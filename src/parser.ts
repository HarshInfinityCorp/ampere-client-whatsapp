/**
 * Ticket Message Parser — v2
 *
 * Parses ticket listings into client's schema with quantity expansion.
 * Each pair/quad in a line becomes a separate ticket record.
 */

import type { Ticket } from "./firebase";

// ── Keywords ──
const SELL_KEYWORDS = /^(available|selling|for sale|wts)$/i;
const BUY_KEYWORDS = /^(wanted|looking for|wtb|need)$/i;
const SELL_INLINE = /\b(available|selling|for sale|wts)\b/i;
const BUY_INLINE = /\b(wanted|looking for|wtb|need)\b/i;

// ── Footer lines to skip ──
const FOOTER_PATTERN = /^(dm|ready to send|ready to send,?\s*dm|message me|contact me|ping me|hit me up)[\s,.!]*$/i;

// ── Currency symbols ──
const CURRENCY_MAP: Record<string, "GBP" | "EUR" | "USD" | "INR"> = {
  "£": "GBP",
  "€": "EUR",
  "$": "USD",
  "₹": "INR",
  "rs": "INR",
};

// ── Extract price from a line ──
interface PriceResult {
  price: number;
  currency: "GBP" | "EUR" | "USD" | "INR";
  price_type: "per_ticket";
}

function extractPrice(line: string): PriceResult | null {
  // Format 1: £500pp, £1250 each, €40, $800
  const currencyFirst = line.match(/(£|€|\$|₹)\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(pp|each|per\s*ticket)?/i);
  if (currencyFirst) {
    const currency = CURRENCY_MAP[currencyFirst[1]] || "GBP";
    const price = parseFloat(currencyFirst[2].replace(/,/g, ""));
    return { price, currency, price_type: "per_ticket" };
  }

  // Format 2: / 40 €, / 70€, 40€
  const currencyLast = line.match(/\/?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(£|€|\$|₹)\s*(pp|each|per\s*ticket)?/i);
  if (currencyLast) {
    const currency = CURRENCY_MAP[currencyLast[2]] || "EUR";
    const price = parseFloat(currencyLast[1].replace(/,/g, ""));
    return { price, currency, price_type: "per_ticket" };
  }

  return null;
}

function hasPrice(line: string): boolean {
  return extractPrice(line) !== null;
}

// ── Extract row from a line ──
function extractRow(line: string): string | null {
  const rowMatch = line.match(/\brow\s+(\d+)/i);
  return rowMatch ? rowMatch[1] : null;
}

// ── Extract seat note from parentheses ──
function extractSeatNote(line: string): string | null {
  const noteMatch = line.match(/\(([^)]+)\)/);
  return noteMatch ? noteMatch[1].trim() : null;
}

// ── Parse quantity prefix and expand into records ──
interface QuantityGroup {
  quantity_value: number | null;
  ticket_type: "pair" | "quad" | null;
  repetitions: number; // how many records to create
  area_text: string;   // line with quantity prefix removed
}

function parseQuantityAndExpand(line: string): QuantityGroup {
  // Remove price and notes from line first for cleaner area extraction
  let cleanLine = line
    .replace(/(£|€|\$|₹)\s*\d+(?:,\d+)*(?:\.\d+)?\s*(pp|each|per\s*ticket)?/gi, "")
    .replace(/\/?\s*\d+(?:,\d+)*(?:\.\d+)?\s*(£|€|\$|₹)\s*(pp|each|per\s*ticket)?/gi, "")
    .replace(/\([^)]*\)/g, "") // remove parentheses
    .replace(/\brow\s+\d+/gi, "") // remove "row 21"
    .replace(/\s+/g, " ")
    .trim();

  // ── Pattern 1: Dash-separated "2-2-2" or "4-4" ──
  // Each number = one group of that many tickets
  const dashPattern = cleanLine.match(/^(\d+(?:-\d+)+)\s*(.*)/);
  if (dashPattern) {
    const groups = dashPattern[1].split("-").map(Number);
    const area = dashPattern[2].trim();
    const groupSize = groups[0]; // all groups should be same size
    const ticketType = groupSize === 2 ? "pair" : groupSize === 4 ? "quad" : null;
    return {
      quantity_value: groupSize,
      ticket_type: ticketType,
      repetitions: groups.length,
      area_text: area,
    };
  }

  // ── Pattern 2: Plus-separated "2+2" ──
  const plusPattern = cleanLine.match(/^(\d+)\s*\+\s*(\d+)\s*(.*)/);
  if (plusPattern) {
    const groupSize = parseInt(plusPattern[1]);
    const groups = 2; // 2+2 = two groups
    const area = plusPattern[3].trim();
    const ticketType = groupSize === 2 ? "pair" : groupSize === 4 ? "quad" : null;
    return {
      quantity_value: groupSize,
      ticket_type: ticketType,
      repetitions: groups,
      area_text: area,
    };
  }

  // ── Pattern 3: "N pair ..." ──
  const pairPattern = cleanLine.match(/^(\d+)\s*pair\s*(.*)/i);
  if (pairPattern) {
    const repetitions = parseInt(pairPattern[1]);
    const area = pairPattern[2].trim();
    return {
      quantity_value: 2,
      ticket_type: "pair",
      repetitions,
      area_text: area,
    };
  }

  // ── Pattern 4: "N x item" ──
  const nxPattern = cleanLine.match(/^(\d+)\s*x\s*(.*)/i);
  if (nxPattern) {
    const qty = parseInt(nxPattern[1]);
    const area = nxPattern[2].trim();
    const ticketType = qty === 2 ? "pair" : qty === 4 ? "quad" : null;
    return {
      quantity_value: qty,
      ticket_type: ticketType,
      repetitions: 1,
      area_text: area,
    };
  }

  // ── Pattern 5: "Nx item" (no space) e.g. "2x Longside" ──
  const nxNoSpacePattern = cleanLine.match(/^(\d+)x\s*(.*)/i);
  if (nxNoSpacePattern) {
    const qty = parseInt(nxNoSpacePattern[1]);
    const area = nxNoSpacePattern[2].trim();
    const ticketType = qty === 2 ? "pair" : qty === 4 ? "quad" : null;
    return {
      quantity_value: qty,
      ticket_type: ticketType,
      repetitions: 1,
      area_text: area,
    };
  }

  // ── Pattern 6: Bare number "4 dug out" ──
  const bareNumberPattern = cleanLine.match(/^(\d+)\s+(.*)/);
  if (bareNumberPattern) {
    const qty = parseInt(bareNumberPattern[1]);
    const area = bareNumberPattern[2].trim();
    // Only treat as quantity if area_text is meaningful (not just digits)
    if (area && !/^\d+$/.test(area)) {
      const ticketType = qty === 2 ? "pair" : qty === 4 ? "quad" : null;
      return {
        quantity_value: qty,
        ticket_type: ticketType,
        repetitions: 1,
        area_text: area,
      };
    }
  }

  // ── Pattern 7: No quantity — e.g. "block 201" ──
  return {
    quantity_value: null,
    ticket_type: null,
    repetitions: 1,
    area_text: cleanLine,
  };
}

// ── Check if a line is a ticket detail line ──
function isTicketLine(line: string): boolean {
  if (FOOTER_PATTERN.test(line)) return false;
  if (SELL_KEYWORDS.test(line) || BUY_KEYWORDS.test(line)) return false;

  // Lines fully in parentheses are notes
  if (/^\(.*\)\.?$/.test(line.trim())) return false;

  if (hasPrice(line)) return true;
  if (/\d+\s*[-+]\s*\d+/.test(line)) return true;    // 2-2-2, 2+2
  if (/\d+\s*x\s/i.test(line)) return true;           // 4 x kop
  if (/\d+x\s/i.test(line)) return true;              // 2x Longside
  if (/\bblock\s+\d+/i.test(line)) return true;       // block 95
  if (/\brow\s+\d+/i.test(line)) return true;         // row 21
  if (/\b(kop|upper|lower|dug\s*out|longside|quadrant)\b/i.test(line)) return true;
  if (/\bpair\b/i.test(line)) return true;

  return false;
}

// ── Main export: parse all tickets from a message ──
export function parseAllTickets(
  text: string,
  meta: {
    sender_name: string;
    sender_phone: string;
    group_name: string;
    group_jid: string;
    message_id: string;
  }
): Omit<Ticket, "id" | "created_at">[] {
  const raw = text.trim();
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // ── Detect availability status ──
  let status: "available" | "wanted" = "available";
  let typeLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (SELL_KEYWORDS.test(lines[i])) { status = "available"; typeLineIndex = i; break; }
    if (BUY_KEYWORDS.test(lines[i])) { status = "wanted"; typeLineIndex = i; break; }
  }

  // Inline fallback
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

  if (typeLineIndex === -1) return []; // not a ticket message

  // ── Get content lines (skip keyword + footer lines) ──
  const contentLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i === typeLineIndex) continue;
    if (FOOTER_PATTERN.test(lines[i])) continue;
    if (SELL_KEYWORDS.test(lines[i]) || BUY_KEYWORDS.test(lines[i])) continue;
    contentLines.push(lines[i]);
  }

  // ── Separate event name from ticket lines ──
  let eventName = "";
  let ticketLines: string[] = [];

  for (const line of contentLines) {
    if (isTicketLine(line)) {
      ticketLines.push(line);
    } else if (/^\(.*\)\.?$/.test(line.trim()) && ticketLines.length > 0) {
      // Parenthesised note → append to previous ticket line
      ticketLines[ticketLines.length - 1] += " " + line;
    } else if (!eventName) {
      eventName = line;
    } else if (ticketLines.length === 0) {
      eventName += " " + line;
    }
  }

  if (!eventName && ticketLines.length > 0) eventName = "Unknown Event";

  // ── Parse each ticket line into expanded records ──
  const results: Omit<Ticket, "id" | "created_at">[] = [];

  for (const line of ticketLines) {
    const priceResult = extractPrice(line);
    const row = extractRow(line);
    const seatNote = extractSeatNote(line);
    const { quantity_value, ticket_type, repetitions, area_text } = parseQuantityAndExpand(line);

    // Create `repetitions` records for this line
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

  // If no ticket lines but has event, save one record for the whole listing
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
