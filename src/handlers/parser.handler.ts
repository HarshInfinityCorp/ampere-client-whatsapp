import { Ticket, TicketMeta } from "../types";
import {
  SELL_KEYWORDS,
  BUY_KEYWORDS,
  SELL_INLINE,
  BUY_INLINE,
  FOOTER_PATTERN,
  isTicketLine,
  extractPrice,
  extractRow,
  extractSeatNote,
  parseQuantityAndExpand,
} from "../utils/formatting.util";

export function parseAllTickets(
  text: string,
  meta: TicketMeta
): Omit<Ticket, "id" | "created_at">[] {
  const raw = text.trim();
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  let status: "available" | "wanted" = "available";
  let typeLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (SELL_KEYWORDS.test(lines[i])) { status = "available"; typeLineIndex = i; break; }
    if (BUY_KEYWORDS.test(lines[i])) { status = "wanted"; typeLineIndex = i; break; }
  }

  if (typeLineIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (SELL_INLINE.test(lines[i]) && !FOOTER_PATTERN.test(lines[i])) {
        status = "available"; typeLineIndex = i; break;
      }
      if (BUY_INLINE.test(lines[i]) && !FOOTER_PATTERN.test(lines[i])) {
        status = "wanted"; typeLineIndex = i; break;
      }
    }
  }

  if (typeLineIndex === -1) return [];

  const contentLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === typeLineIndex) continue;
    if (FOOTER_PATTERN.test(lines[i])) continue;
    if (SELL_KEYWORDS.test(lines[i]) || BUY_KEYWORDS.test(lines[i])) continue;
    contentLines.push(lines[i]);
  }

  let eventName = "";
  let ticketLines: string[] = [];

  for (const line of contentLines) {
    if (isTicketLine(line)) {
      ticketLines.push(line);
    } else if (/^\(.*\)\.?$/.test(line.trim()) && ticketLines.length > 0) {
      ticketLines[ticketLines.length - 1] += " " + line;
    } else if (!eventName) {
      eventName = line;
    } else if (ticketLines.length === 0) {
      eventName += " " + line;
    }
  }

  if (!eventName && ticketLines.length > 0) eventName = "Unknown Event";

  const results: Omit<Ticket, "id" | "created_at">[] = [];

  for (const line of ticketLines) {
    const priceResult = extractPrice(line);
    const row = extractRow(line);
    const seatNote = extractSeatNote(line);
    const { quantity_value, ticket_type, repetitions, area_text } = parseQuantityAndExpand(line);

    for (let i = 0; i < repetitions; i++) {
      results.push({
        event: eventName || null,
        ticket_type,
        quantity_value,
        price: priceResult?.price ?? null,
        price_type: priceResult ? "per_ticket" : null,
        currency: priceResult?.currency ?? null,
        area_text: area_text || null,
        row: row || null,
        seat_note: seatNote || null,
        availability_status: status,
        raw_line_text: line,
        sender_name: meta.sender_name,
        sender_phone: meta.sender_phone,
        group_name: meta.group_name,
        group_jid: meta.group_jid,
        message_id: meta.message_id,
      });
    }
  }

  if (results.length === 0 && eventName) {
    results.push({
      event: eventName,
      ticket_type: null,
      quantity_value: null,
      price: null,
      price_type: null,
      currency: null,
      area_text: null,
      row: null,
      seat_note: null,
      availability_status: status,
      raw_line_text: raw,
      sender_name: meta.sender_name,
      sender_phone: meta.sender_phone,
      group_name: meta.group_name,
      group_jid: meta.group_jid,
      message_id: meta.message_id,
    });
  }

  return results;
}

export function isTicketMessage(text: string): boolean {
  const lines = text.trim().split("\n").map((l) => l.trim());
  return lines.some(
    (l) => SELL_KEYWORDS.test(l) || BUY_KEYWORDS.test(l) || SELL_INLINE.test(l) || BUY_INLINE.test(l)
  );
}
