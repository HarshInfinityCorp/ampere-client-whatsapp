import OpenAI from "openai";
import { config } from "./config";
import { queryTrades, getStats } from "./db";

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

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

export async function handleQuery(question: string): Promise<string> {
  const today = todayStr();
  const stats = getStats(today);

  // Pre-fetch relevant trades to pass as context to AI
  const recentTrades = queryTrades({ limit: 20 });
  const tradesContext = (recentTrades as any[]).length
    ? (recentTrades as any[]).map((t: any) =>
        `[${t.type?.toUpperCase() || "?"}] ${t.event_name || t.item || "?"} - ${t.block_details || ""} | price: ${t.price || "?"} | from: ${t.sender_name || "?"} (${t.sender_phone || "?"}) | group: ${t.group_name || "?"} | date: ${t.parsed_at?.split("T")[0] || "?"}`
      ).join("\n")
    : "No trades recorded yet.";

  const systemPrompt = `You are a WhatsApp ticket trading bot assistant. You help the admin query a database of ticket listings (buy/sell) collected from WhatsApp groups.

TODAY: ${today}
TODAY'S STATS: ${stats.totalBuys} wanted, ${stats.totalSells} available, ${stats.total} total
TOP EVENTS TODAY: ${stats.topItems.map((i) => `${i.item} (${i.count})`).join(", ") || "none"}

RECENT TRADES (last 20):
${tradesContext}

When user asks "find someone selling X" or similar, include the seller's phone number from the trades.

Answer the user's question in a short, clear WhatsApp-friendly format.
Use emoji to make it readable. Keep it under 15 lines.
Do NOT use markdown headers or code blocks.`;

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

  } catch (error) {
    console.error("[Query] AI failed, using fallback:", error);
    return fallbackQuery(question, stats);
  }
}

// ── Fallback without AI ──
function fallbackQuery(question: string, stats: ReturnType<typeof getStats>): string {
  const q = question.toLowerCase();
  const today = todayStr();

  if (q.includes("today") || q.includes("stat") || q.includes("how many")) {
    let reply = `📊 *Today's trades (${today})*\n\n`;
    reply += `🟢 Buys: ${stats.totalBuys}\n`;
    reply += `🔴 Sells: ${stats.totalSells}\n`;
    reply += `📦 Total: ${stats.total}`;
    if (stats.topItems.length) {
      reply += `\n\n*Top items:*\n`;
      reply += stats.topItems.map((i) => `• ${i.item} — ${i.count}`).join("\n");
    }
    return reply;
  }

  if (q.includes("sell") || q.includes("available")) {
    const trades = queryTrades({ type: "sell", limit: 5 });
    if (!(trades as any[]).length) return "❌ No available tickets found.";
    return `🎫 Last ${(trades as any[]).length} available:\n` +
      (trades as any[]).map((t: any) => 
        `• ${t.event_name || t.item || "?"}\n  ${t.block_details || ""} ${t.price || ""}\n  📞 ${t.sender_phone || "?"}`
      ).join("\n\n");
  }

  if (q.includes("buy") || q.includes("wanted")) {
    const trades = queryTrades({ type: "buy", limit: 5 });
    if (!(trades as any[]).length) return "❌ No wanted tickets found.";
    return `🔍 Last ${(trades as any[]).length} wanted:\n` +
      (trades as any[]).map((t: any) => 
        `• ${t.event_name || t.item || "?"}\n  ${t.block_details || ""}\n  📞 ${t.sender_phone || "?"}`
      ).join("\n\n");
  }

  return "❓ Try: *stats today*, *show sells*, *show buys*, *find iPhone*";
}
