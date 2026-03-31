import { queryTickets, getStats } from "../services/firebase.service";
import { extractIntentLLM, getAIClient, getAIModel } from "../services/ai.service";
import { smartFallback, buildTicketContext } from "../utils/fallback.util";
import { Ticket } from "../types";

export async function handleQuery(question: string): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split("T")[0];

  // Step 1: Extract intent dynamically using LLM
  const intent = await extractIntentLLM(question);
  console.log(`[Query] Intent extracted:`, JSON.stringify(intent));

  // Step 2: Query Firestore with extracted filters
  let tickets: Ticket[] = [];
  let stats = { available: 0, wanted: 0, total: 0, topEvents: [] as { event: string; count: number }[] };

  try {
    stats = await getStats().catch(() => ({ available: 0, wanted: 0, total: 0, topEvents: [] }));

    switch (intent.type) {
      case "stats":
        break;
      case "list_available":
        tickets = await queryTickets({ status: "available" });
        break;
      case "list_wanted":
        tickets = await queryTickets({ status: "wanted" });
        break;
      case "search":
        tickets = await queryTickets({ event: intent.event, area: intent.area });
        break;
      case "general":
      case "unknown":
      default:
        tickets = await queryTickets({ limit: 200 });
        break;
    }
  } catch (e: any) {
    console.error("[Query Handler] Firestore query failed:", e.message);
  }

  console.log(`[Query] Firestore returned ${tickets.length} tickets`);

  const totalCount = tickets.length;
  const ticketsContext = buildTicketContext(tickets, totalCount);

  // Step 3: Build AI prompt
  const systemPrompt = `You are a WhatsApp ticket trading bot assistant. You help the admin query a database of ticket buy/sell listings from WhatsApp groups.

TODAY: ${todayStr}
ALL-TIME DATABASE STATS: ${stats.available} available, ${stats.wanted} wanted, ${stats.total} total
TOP ALL-TIME EVENTS: ${stats.topEvents.map((e) => `${e.event} (${e.count})`).join(", ") || "none"}

MATCHING TICKETS (${totalCount} found):
${ticketsContext}

INSTRUCTIONS:
- Answer questions naturally and concisely in WhatsApp-friendly format
- Always include seller's phone number (📞) when someone asks about a specific ticket/seller
- Use emoji sparingly but meaningfully
- When showing results, mention the total count found
- Max 15 lines
- Do NOT use markdown headers, code blocks, or asterisks for bold
- CRITICAL: DO NOT hallucinate or invent tickets! If the context says "No matching tickets found", you must clearly state "No tickets found". Do NOT list fake tickets.
- Just answer the question directly`;

  try {
    const client = getAIClient();
    const model = getAIModel();

    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
    });

    const answer = response.choices[0]?.message?.content?.trim();
    if (!answer) throw new Error("Empty AI response");
    return answer;

  } catch (error: any) {
    console.error("[Query Handler] Answer AI generation failed:", error.message);
    return smartFallback(question, intent, stats, tickets);
  }
}
