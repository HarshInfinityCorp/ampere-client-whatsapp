import { queryTickets, getStats } from "../services/neon.service";
import { extractIntentLLM, getAIClient, getAIModel } from "../services/ai.service";
import { smartFallback, buildTicketContext } from "../utils/fallback.util";
import { Ticket } from "../types";
import { getChatHistory, addMessageToHistory, ChatMessage } from "../utils/memory.util";

export async function handleQuery(question: string, adminPhone: string = "unknown"): Promise<string> {
  const today = new Date();
  const todayStr = today.toDateString(); // e.g. "Wed Apr 22 2026"

  // Fetch recent conversational memory for this admin
  const history = getChatHistory(adminPhone);

  // Step 1: Extract intent dynamically using LLM (with history)
  const intent = await extractIntentLLM(question, history);
  console.log(`[Query] Intent extracted:`, JSON.stringify(intent));

  // Step 2: Query Neon DB with extracted filters
  let tickets: Ticket[] = [];
  let stats = { available: 0, wanted: 0, total: 0, topEvents: [] as { event: string; count: number }[] };

  try {
    stats = await getStats().catch(() => ({ available: 0, wanted: 0, total: 0, topEvents: [] }));

    // Step 1.5: Parse Timeframe
    let dateFrom: Date | undefined;
    if (intent.timeframe) {
      const now = new Date();
      if (intent.timeframe === "today") {
        now.setHours(0, 0, 0, 0);
        dateFrom = now;
      } else if (intent.timeframe === "yesterday") {
        now.setDate(now.getDate() - 1);
        now.setHours(0, 0, 0, 0);
        dateFrom = now;
      } else if (intent.timeframe === "this_week") {
        now.setDate(now.getDate() - 7);
        dateFrom = now;
      }
    }

    const queryFilters: any = { dateFrom };

    switch (intent.type) {
      case "stats":
        break;
      case "list_available":
        tickets = await queryTickets({ ...queryFilters, status: "available" });
        break;
      case "list_wanted":
        tickets = await queryTickets({ ...queryFilters, status: "wanted" });
        break;
      case "search":
        tickets = await queryTickets({ ...queryFilters, event: intent.event, area: intent.area, status: intent.status });
        break;
      case "general":
      case "unknown":
      default:
        if (intent.event || intent.area) {
          tickets = await queryTickets({ ...queryFilters, event: intent.event, area: intent.area, status: intent.status });
        } else {
          tickets = await queryTickets({ ...queryFilters, limit: 200 });
        }
        break;
    }

    // Step 2.5: Apply Client-side filters for Pricing and Quantity
    if (intent.max_price !== undefined && intent.max_price !== null) {
      tickets = tickets.filter(t => t.price !== null && t.price <= intent.max_price!);
    }
    
    if (intent.min_quantity !== undefined && intent.min_quantity !== null) {
      tickets = tickets.filter(t => t.quantity_value !== null && t.quantity_value >= intent.min_quantity!);
    }

  } catch (e: any) {
    console.error("[Query Handler] Neon DB query failed:", e.message);
  }

  console.log(`[Query] Neon DB returned ${tickets.length} tickets`);

  const totalCount = tickets.length;
  const ticketsContext = buildTicketContext(tickets, totalCount);

  // Step 3: Build AI prompt
  const systemPrompt = `You are a WhatsApp ticket trading bot assistant. You help the admin query a database of ticket buy/sell listings from WhatsApp groups.

TODAY: ${todayStr}
ALL-TIME DATABASE STATS: ${stats.available} available, ${stats.wanted} wanted, ${stats.total} total
TOP ALL-TIME EVENTS: ${stats.topEvents.map((e) => `${e.event} (${e.count})`).join(", ") || "none"}

MATCHING TICKETS (${totalCount} found):
${ticketsContext}

IMPORTANT — DATA TRUST RULES:
- The MATCHING TICKETS section above contains ALL the data you need. This is the COMPLETE result set from the database query. There is nothing hidden or missing.
- If it says "\${totalCount} found", then you have exactly \${totalCount} tickets to work with. List them ALL when the user asks for details.
- The conversation history (previous messages) is ONLY for understanding what topic the user is referring to. Do NOT use old conversation messages as ticket data. ONLY use the MATCHING TICKETS above.
- CRITICAL: DO NOT hallucinate or invent tickets! If the context says "No matching tickets found", you must clearly state "No tickets found". Do NOT list fake tickets.
- If a user asks for the timestamp or posting time, it is explicitly listed as "posted:" at the end of each ticket.

FORMATTING RULES:
- Answer questions naturally and concisely in WhatsApp-friendly format
- Always include seller's phone number (📞) when listing ticket details
- Use emoji sparingly but meaningfully
- When showing results, mention the total count found
- Max 15 lines
- Do NOT use markdown headers, code blocks, or asterisks for bold
- If the user's query is highly ambiguous or you lack sufficient context to answer it precisely (e.g. asking "how many" without specifying what), YOU MUST politely ask a clarifying question to get more details.
- Just answer the question directly unless a clarifying question is absolutely necessary.`;

  try {
    const client = getAIClient();
    const model = getAIModel();

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        ...history,
        { role: "user", content: question },
      ],
    });

    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) throw new Error("Empty AI response");
    if (answer.startsWith("Codex error:") || answer.includes('{"type":"error"')) {
      throw new Error("OpenClaw proxy backend error intercepted");
    }

    // Persist to memory!
    addMessageToHistory(adminPhone, "user", question);
    addMessageToHistory(adminPhone, "assistant", answer);

    return answer;

  } catch (error: any) {
    console.error("[Query Handler] Answer AI generation failed:", error.message);
    return smartFallback(question, intent, stats, tickets);
  }
}
