import OpenAI from "openai";
import { config } from "./config";
import { queryTickets, getStats } from "./firebase";

function getAIClient() {
  if (config.geminiApiKey) {
    return new OpenAI({
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: config.geminiApiKey,
    });
  }
  return new OpenAI({
    baseURL: config.openclawBaseUrl,
    apiKey: config.openclawApiKey || "no-key",
  });
}

function getAIModel(): string {
  if (config.geminiApiKey) return "gemini-2.0-flash";
  return config.aiModel;
}

function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function handleQuery(question: string): Promise<string> {
  const today = todayStart();
  const todayStr = today.toISOString().split("T")[0];

  // Fetch stats + recent tickets for AI context
  const [stats, recentTickets] = await Promise.all([
    getStats(today).catch(() => ({ available: 0, wanted: 0, total: 0, topEvents: [] })),
    queryTickets({ limit: 30 }).catch(() => []),
  ]);

  const ticketsContext = recentTickets.length
    ? recentTickets.map((t) =>
        `[${t.availability_status.toUpperCase()}] ${t.event || "?"} | ${t.area_text || "?"} | ${t.ticket_type || "?"} x${t.quantity_value ?? "?"} | ${t.currency || ""}${t.price ?? "no price"} | from: ${t.sender_name} (📞 ${t.sender_phone}) | group: ${t.group_name}`
      ).join("\n")
    : "No tickets in database yet.";

  const systemPrompt = `You are a WhatsApp ticket trading bot assistant. You help the admin query a database of ticket buy/sell listings from WhatsApp groups.

TODAY: ${todayStr}
TODAY'S STATS: ${stats.available} available, ${stats.wanted} wanted, ${stats.total} total
TOP EVENTS: ${stats.topEvents.map((e) => `${e.event} (${e.count})`).join(", ") || "none"}

RECENT TICKETS (last 30):
${ticketsContext}

INSTRUCTIONS:
- Answer questions naturally and concisely in WhatsApp-friendly format
- Always include seller's phone number (📞) when someone asks about a specific ticket/seller
- Use emoji sparingly but meaningfully
- Max 15 lines
- Do NOT use markdown headers, code blocks, or asterisks for bold
- If no data matches, say clearly: "No tickets found for [query]"
- Do NOT say "Try: stats today, show sells" — just answer the question directly`;

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
    if (!answer) throw new Error("Empty response");
    return answer;

  } catch (error: any) {
    console.error("[Query] AI failed:", error.message);
    // Smart fallback — actually answers from data instead of generic message
    return await smartFallback(question, stats, recentTickets);
  }
}

// ── Smart fallback (no AI) ──
async function smartFallback(
  question: string,
  stats: Awaited<ReturnType<typeof getStats>>,
  tickets: Awaited<ReturnType<typeof queryTickets>>
): Promise<string> {
  const q = question.toLowerCase();

  // Stats query
  if (q.includes("how many") || q.includes("stats") || q.includes("today")) {
    let reply = `📊 Today's tickets\n\n`;
    reply += `🎫 Available: ${stats.available}\n`;
    reply += `🔍 Wanted: ${stats.wanted}\n`;
    reply += `📦 Total: ${stats.total}`;
    if (stats.topEvents.length) {
      reply += `\n\nTop events:\n`;
      reply += stats.topEvents.map((e) => `• ${e.event} — ${e.count}`).join("\n");
    }
    return reply;
  }

  // Search by event
  const eventKeywords = ["find", "search", "looking for", "show me", "any"];
  for (const kw of eventKeywords) {
    if (q.includes(kw)) {
      const searchTerm = q.replace(kw, "").trim();
      const found = tickets.filter((t) =>
        t.event?.toLowerCase().includes(searchTerm) ||
        t.area_text?.toLowerCase().includes(searchTerm)
      );
      if (!found.length) return `No tickets found matching "${searchTerm}"`;
      return `🎫 Found ${found.length} ticket(s):\n\n` +
        found.slice(0, 5).map((t) =>
          `${t.availability_status === "available" ? "🟢" : "🔍"} ${t.event}\n` +
          `  ${t.area_text || "?"} | ${t.currency || ""}${t.price ?? "no price"}\n` +
          `  👤 ${t.sender_name} 📞 ${t.sender_phone}`
        ).join("\n\n");
    }
  }

  // Show available
  if (q.includes("available")) {
    const avail = tickets.filter((t) => t.availability_status === "available").slice(0, 5);
    if (!avail.length) return "No available tickets found.";
    return `🟢 Available tickets (${avail.length}):\n\n` +
      avail.map((t) =>
        `🎫 ${t.event} | ${t.area_text || "?"} | ${t.currency || ""}${t.price ?? "no price"}\n` +
        `   👤 ${t.sender_name} 📞 ${t.sender_phone}`
      ).join("\n\n");
  }

  // Show wanted
  if (q.includes("wanted") || q.includes("looking")) {
    const wanted = tickets.filter((t) => t.availability_status === "wanted").slice(0, 5);
    if (!wanted.length) return "No wanted tickets found.";
    return `🔍 Wanted tickets (${wanted.length}):\n\n` +
      wanted.map((t) =>
        `🎟️ ${t.event} | ${t.area_text || "?"}\n` +
        `   👤 ${t.sender_name} 📞 ${t.sender_phone}`
      ).join("\n\n");
  }

  // Default — show recent
  if (!tickets.length) return "No tickets in the database yet.";
  return `🎫 Recent tickets (${Math.min(tickets.length, 5)}):\n\n` +
    tickets.slice(0, 5).map((t) =>
      `${t.availability_status === "available" ? "🟢" : "🔍"} ${t.event} | ${t.area_text || "?"}\n` +
      `   👤 ${t.sender_name} 📞 ${t.sender_phone}`
    ).join("\n\n");
}
