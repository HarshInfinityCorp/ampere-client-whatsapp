// ── Keywords ──
export const SELL_KEYWORDS = /^(available|selling|for sale|wts)$/i;
export const BUY_KEYWORDS = /^(wanted|looking for|wtb|need)$/i;
export const SELL_INLINE = /\b(available|selling|for sale|wts)\b/i;
export const BUY_INLINE = /\b(wanted|looking for|wtb|need)\b/i;

// ── Footer lines to skip ──
export const FOOTER_PATTERN = /^(dm|ready to send|ready to send,?\s*dm|message me|contact me|ping me|hit me up)[\s,.!]*$/i;

// ── Currency symbols ──
const CURRENCY_MAP: Record<string, "GBP" | "EUR" | "USD" | "INR"> = {
  "£": "GBP",
  "€": "EUR",
  "$": "USD",
  "₹": "INR",
  "rs": "INR",
};

export interface PriceResult {
  price: number;
  currency: "GBP" | "EUR" | "USD" | "INR";
  price_type: "per_ticket";
}

export function extractPrice(line: string): PriceResult | null {
  const currencyFirst = line.match(/(£|€|\$|₹)\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(pp|each|per\s*ticket)?/i);
  if (currencyFirst) {
    const currency = CURRENCY_MAP[currencyFirst[1]] || "GBP";
    const price = parseFloat(currencyFirst[2].replace(/,/g, ""));
    return { price, currency, price_type: "per_ticket" };
  }

  const currencyLast = line.match(/\/?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(£|€|\$|₹)\s*(pp|each|per\s*ticket)?/i);
  if (currencyLast) {
    const currency = CURRENCY_MAP[currencyLast[2]] || "EUR";
    const price = parseFloat(currencyLast[1].replace(/,/g, ""));
    return { price, currency, price_type: "per_ticket" };
  }

  return null;
}

export function hasPrice(line: string): boolean {
  return extractPrice(line) !== null;
}

export function extractRow(line: string): string | null {
  const rowMatch = line.match(/\brow\s+(\d+)/i);
  return rowMatch ? rowMatch[1] : null;
}

export function extractSeatNote(line: string): string | null {
  const noteMatch = line.match(/\(([^)]+)\)/);
  return noteMatch ? noteMatch[1].trim() : null;
}

export interface QuantityGroup {
  quantity_value: number | null;
  ticket_type: "pair" | "quad" | null;
  repetitions: number;
  area_text: string;
}

export function parseQuantityAndExpand(line: string): QuantityGroup {
  let cleanLine = line
    .replace(/(£|€|\$|₹)\s*\d+(?:,\d+)*(?:\.\d+)?\s*(pp|each|per\s*ticket)?/gi, "")
    .replace(/\/?\s*\d+(?:,\d+)*(?:\.\d+)?\s*(£|€|\$|₹)\s*(pp|each|per\s*ticket)?/gi, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\brow\s+\d+/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const dashPattern = cleanLine.match(/^(\d+(?:-\d+)+)\s*(.*)/);
  if (dashPattern) {
    const groups = dashPattern[1].split("-").map(Number);
    const area = dashPattern[2].trim();
    const groupSize = groups[0];
    const ticketType = groupSize === 2 ? "pair" : groupSize === 4 ? "quad" : null;
    return { quantity_value: groupSize, ticket_type: ticketType, repetitions: groups.length, area_text: area };
  }

  const plusPattern = cleanLine.match(/^(\d+)\s*\+\s*(\d+)\s*(.*)/);
  if (plusPattern) {
    const groupSize = parseInt(plusPattern[1]);
    const area = plusPattern[3].trim();
    const ticketType = groupSize === 2 ? "pair" : groupSize === 4 ? "quad" : null;
    return { quantity_value: groupSize, ticket_type: ticketType, repetitions: 2, area_text: area };
  }

  const pairPattern = cleanLine.match(/^(\d+)\s*pair\s*(.*)/i);
  if (pairPattern) {
    return { quantity_value: 2, ticket_type: "pair", repetitions: parseInt(pairPattern[1]), area_text: pairPattern[2].trim() };
  }

  const nxPattern = cleanLine.match(/^(\d+)\s*x\s*(.*)/i);
  if (nxPattern) {
    const qty = parseInt(nxPattern[1]);
    const ticketType = qty === 2 ? "pair" : qty === 4 ? "quad" : null;
    return { quantity_value: qty, ticket_type: ticketType, repetitions: 1, area_text: nxPattern[2].trim() };
  }

  const nxNoSpacePattern = cleanLine.match(/^(\d+)x\s*(.*)/i);
  if (nxNoSpacePattern) {
    const qty = parseInt(nxNoSpacePattern[1]);
    const ticketType = qty === 2 ? "pair" : qty === 4 ? "quad" : null;
    return { quantity_value: qty, ticket_type: ticketType, repetitions: 1, area_text: nxNoSpacePattern[2].trim() };
  }

  const bareNumberPattern = cleanLine.match(/^(\d+)\s+(.*)/);
  if (bareNumberPattern) {
    const qty = parseInt(bareNumberPattern[1]);
    const area = bareNumberPattern[2].trim();
    if (area && !/^\d+$/.test(area)) {
      const ticketType = qty === 2 ? "pair" : qty === 4 ? "quad" : null;
      return { quantity_value: qty, ticket_type: ticketType, repetitions: 1, area_text: area };
    }
  }

  return { quantity_value: null, ticket_type: null, repetitions: 1, area_text: cleanLine };
}

export function isTicketLine(line: string): boolean {
  if (FOOTER_PATTERN.test(line)) return false;
  if (SELL_KEYWORDS.test(line) || BUY_KEYWORDS.test(line)) return false;
  if (/^\(.*\)\.?$/.test(line.trim())) return false;
  
  if (hasPrice(line)) return true;
  if (/\d+\s*[-+]\s*\d+/.test(line)) return true;
  if (/\d+\s*x\s/i.test(line)) return true;
  if (/\d+x\s/i.test(line)) return true;
  if (/\bblock\s+\d+/i.test(line)) return true;
  if (/\brow\s+\d+/i.test(line)) return true;
  if (/\b(kop|upper|lower|dug\s*out|longside|quadrant)\b/i.test(line)) return true;
  if (/\bpair\b/i.test(line)) return true;

  return false;
}
