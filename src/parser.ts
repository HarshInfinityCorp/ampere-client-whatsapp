/**
 * Ticket Message Parser
 *
 * Parses ticket listings from WhatsApp groups.
 *
 * ── SUPPORTED FORMATS ──
 *
 * 1. Available/Wanted at START:
 *    Available
 *    Liverpool end @ Everton
 *    2-2-2 £425pp
 *    Dm
 *
 * 2. Available/Wanted at END:
 *    Liverpool Legends v BvB Dortmund Legends
 *    4 x AU2 row 21 £60 each
 *    Available
 *
 * 3. Slash-separated prices (€):
 *    block 201 / 40 €
 *    block 208 / 70 €
 *
 * 4. "each" pricing:
 *    2+2 block 95 £1250 each
 *
 * 5. "pp" pricing:
 *    4 x kop £500pp
 */

export interface ParsedTrade {
  type: "buy" | "sell" | null;
  event_name: string | null;
  block_details: string | null;
  item: string | null;
  quantity: string | null;
  price: string | null;
  raw_message: string;
  parsed: boolean;
}

// ── Keywords ──
const SELL_KEYWORDS = /^(available|selling|for sale|wts)$/i;
const BUY_KEYWORDS = /^(wanted|looking for|wtb|need)$/i;
const SELL_INLINE = /\b(available|selling|for sale|wts)\b/i;
const BUY_INLINE = /\b(wanted|looking for|wtb|need)\b/i;

// ── Footer lines to skip ──
const FOOTER_PATTERN = /^(dm|ready to send|ready to send,?\s*dm|message me|contact me|ping me|hit me up)[\s,.!]*$/i;

// ── Price patterns (handles multiple formats) ──
// £500pp, £1250 each, €40, $800, 40 €, 70€
const PRICE_PATTERNS = [
  // Currency before number: £500pp, €40, $1250 each
  /(£|€|\$|rs\.?|₹)\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(pp|each|per\s*person)?/i,
  // Number before currency: 40 €, 70€
  /(\d+(?:,\d+)*(?:\.\d+)?)\s*(£|€|\$|₹)\s*(pp|each|per\s*person)?/i,
  // Slash format: / 40 €, /70€
  /\/\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(£|€|\$|₹)?\s*(pp|each|per\s*person)?/i,
];

function extractPrice(line: string): string | null {
  for (const pattern of PRICE_PATTERNS) {
    const match = line.match(pattern);
    if (match) {
      // Determine currency and amount based on capture group order
      if (pattern === PRICE_PATTERNS[0]) {
        // Currency before number
        return `${match[1]}${match[2]}${match[3] ? " " + match[3] : ""}`.trim();
      } else if (pattern === PRICE_PATTERNS[1]) {
        // Number before currency
        return `${match[2]}${match[1]}${match[3] ? " " + match[3] : ""}`.trim();
      } else if (pattern === PRICE_PATTERNS[2]) {
        // Slash format
        const currency = match[2] || "€";
        return `${currency}${match[1]}${match[3] ? " " + match[3] : ""}`.trim();
      }
    }
  }
  return null;
}

function hasPrice(line: string): boolean {
  return PRICE_PATTERNS.some((p) => p.test(line));
}

// ── Block detail extraction ──
// Removes price from the line to get just the block info
function extractBlockDetails(line: string): string {
  let block = line;
  // Remove price portions
  for (const pattern of PRICE_PATTERNS) {
    block = block.replace(pattern, "");
  }
  // Clean up slashes, extra spaces, trailing commas
  block = block.replace(/[\/,]+\s*$/, "").replace(/\s+/g, " ").trim();
  return block || line;
}

// ── Check if a line looks like a ticket detail line ──
function isTicketLine(line: string): boolean {
  if (FOOTER_PATTERN.test(line)) return false;
  if (SELL_KEYWORDS.test(line) || BUY_KEYWORDS.test(line)) return false;

  // Lines in parentheses are notes/restrictions, NOT ticket lines
  // e.g., "(No Upper Quadrants)" is a note, not a ticket block
  if (/^\(.*\)\.?$/.test(line.trim())) return false;

  // Has price
  if (hasPrice(line)) return true;

  // Has block/section patterns: "2-2-2", "4 x kop", "block 95", "2+2"
  if (/\d+\s*[-+]\s*\d+/.test(line)) return true; // 2-2-2, 2+2
  if (/\d+\s*x\s/i.test(line)) return true; // 4 x kop
  if (/\bblock\s+\d+/i.test(line)) return true; // block 95
  if (/\brow\s+\d+/i.test(line)) return true; // row 21
  if (/\b(kop|upper|lower|dug\s*out|longside|quadrant)\b/i.test(line)) return true; // section names
  if (/\bpair\b/i.test(line)) return true; // 5 pair long upper

  return false;
}

// ── Extract quantity ──
function extractQuantity(line: string): string | null {
  // "4 x kop" → 4
  const xMatch = line.match(/(\d+)\s*x\s/i);
  if (xMatch) return xMatch[1];

  // "2+2 block" → 4
  const plusMatch = line.match(/^(\d+)\s*\+\s*(\d+)/);
  if (plusMatch) return String(parseInt(plusMatch[1]) + parseInt(plusMatch[2]));

  // "5 pair" → 5 (but return as "5 pair")
  const pairMatch = line.match(/(\d+)\s*pair/i);
  if (pairMatch) return pairMatch[1];

  return null;
}

/**
 * Parse all ticket blocks from a message
 * Returns array of trades (one per block)
 */
export function parseAllBlocks(text: string): ParsedTrade[] {
  const raw = text.trim();
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);

  if (lines.length === 0) return [];

  // ── Detect type and position (start or end of message) ──
  let type: "buy" | "sell" | null = null;
  let typeLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SELL_KEYWORDS.test(line)) {
      type = "sell";
      typeLineIndex = i;
      break;
    }
    if (BUY_KEYWORDS.test(line)) {
      type = "buy";
      typeLineIndex = i;
      break;
    }
  }

  // If no standalone keyword found, check inline (e.g., "ready to send, DM" with "available" elsewhere)
  if (!type) {
    for (let i = 0; i < lines.length; i++) {
      if (SELL_INLINE.test(lines[i]) && !FOOTER_PATTERN.test(lines[i])) {
        type = "sell";
        typeLineIndex = i;
        break;
      }
      if (BUY_INLINE.test(lines[i]) && !FOOTER_PATTERN.test(lines[i])) {
        type = "buy";
        typeLineIndex = i;
        break;
      }
    }
  }

  if (!type) return [];

  // ── Separate event name from ticket lines ──
  let eventName = "";
  let ticketLines: string[] = [];

  // Determine which lines are content (skip type keyword line and footers)
  const contentLines: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === typeLineIndex) continue; // skip the keyword line
    if (FOOTER_PATTERN.test(line)) continue; // skip DM, ready to send, etc.
    if (SELL_KEYWORDS.test(line) || BUY_KEYWORDS.test(line)) continue; // skip other keyword lines
    contentLines.push(line);
  }

  // First pass: identify event name vs ticket detail lines
  for (const line of contentLines) {
    if (isTicketLine(line)) {
      ticketLines.push(line);
    } else if (/^\(.*\)\.?$/.test(line.trim()) && ticketLines.length > 0) {
      // Lines in parentheses → append as note to the previous ticket line
      // e.g., "(No Upper Quadrants)" appended to "2x Longside Upper"
      ticketLines[ticketLines.length - 1] += " " + line;
    } else if (!eventName) {
      eventName = line;
    } else {
      // Could be continuation of event name or extra text
      // If we already have ticket lines, ignore it
      if (ticketLines.length === 0) {
        eventName += " " + line;
      }
    }
  }

  // If no event name found but we have ticket lines, use context
  if (!eventName && ticketLines.length > 0) {
    // The whole message might be just ticket details without explicit event
    eventName = "Unknown Event";
  }

  // ── Parse each ticket line into a trade ──
  if (ticketLines.length === 0) {
    // No ticket lines — just an event listing
    return [{
      type,
      event_name: eventName || null,
      block_details: null,
      item: eventName || null,
      quantity: null,
      price: null,
      raw_message: raw,
      parsed: true,
    }];
  }

  return ticketLines.map((line) => {
    const price = extractPrice(line);
    const blockDetails = extractBlockDetails(line);
    const quantity = extractQuantity(line);

    const item = eventName && blockDetails
      ? `${eventName} - ${blockDetails}${price ? " - " + price : ""}`
      : eventName || blockDetails || null;

    return {
      type,
      event_name: eventName || null,
      block_details: blockDetails || null,
      item,
      quantity,
      price,
      raw_message: raw,
      parsed: true,
    };
  });
}

export function parseMessage(text: string): ParsedTrade {
  const blocks = parseAllBlocks(text);
  if (blocks.length > 0) return blocks[0];

  return {
    type: null,
    event_name: null,
    block_details: null,
    item: null,
    quantity: null,
    price: null,
    raw_message: text.trim(),
    parsed: false,
  };
}

export function isTrade(text: string): boolean {
  return parseAllBlocks(text).length > 0;
}
