import { Ticket, QueryIntent, StatsData } from "../types";

export function smartFallback(
  question: string,
  intent: QueryIntent,
  stats: StatsData,
  tickets: Ticket[]
): string {

  // Stats
  if (intent.type === "stats") {
    let reply = `📊 Database Summary (Fallback)\n\n`;
    reply += `🎫 Available: ${stats.available}\n`;
    reply += `🔍 Wanted: ${stats.wanted}\n`;
    reply += `📦 Total: ${stats.total}`;
    if (stats.topEvents.length) {
      reply += `\n\nTop events:\n`;
      reply += stats.topEvents.map((e) => `• ${e.event} — ${e.count}`).join("\n");
    }
    return reply;
  }

  // No results
  if (!tickets.length) {
    if (intent.event) return `No tickets found matching "${intent.event}" (Fallback)`;
    if (intent.area) return `No tickets found for area "${intent.area}" (Fallback)`;
    if (intent.status === "available") return "No available tickets found. (Fallback)";
    if (intent.status === "wanted") return "No wanted tickets found. (Fallback)";
    return "No tickets in the database yet. (Fallback)";
  }

  // Format results
  const total = tickets.length;
  const showing = tickets.slice(0, 10);
  const label = intent.event || intent.area || (intent.status === "wanted" ? "Wanted" : "Available") || "Recent Tickets";
  const moreText = total > 10 ? `\n\n...and ${total - 10} more` : "";

  return `🎫 ${label} — ${total} ticket(s) found:\n\n` +
    showing.map((t) =>
      `${t.availability_status === "available" ? "🟢" : "🔍"} ${t.event || "?"}\n` +
      `  ${t.area_text || "?"} | ${t.currency || ""}${t.price ?? "no price"}\n` +
      `  👤 ${t.sender_name} 📞 ${t.sender_phone}`
    ).join("\n\n") + moreText + "\n\n*(🤖 Fallback Mode)*";
}

export function buildTicketContext(tickets: Ticket[], totalCount: number): string {
  const AI_CONTEXT_CAP = 50;
  if (!tickets.length) return "No matching tickets found in the database.";

  const showing = tickets.slice(0, AI_CONTEXT_CAP);
  const lines = showing.map((t) =>
    `[${t.availability_status.toUpperCase()}] ${t.event || "?"} | ${t.area_text || "?"} | ${t.ticket_type || "?"} x${t.quantity_value ?? "?"} | ${t.currency || ""}${t.price ?? "no price"} | from: ${t.sender_name} (📞 ${t.sender_phone}) | group: ${t.group_name}`
  );

  let context = lines.join("\n");
  if (totalCount > AI_CONTEXT_CAP) {
    context += `\n\n[Showing ${AI_CONTEXT_CAP} of ${totalCount} total matching tickets]`;
  }
  return context;
}
