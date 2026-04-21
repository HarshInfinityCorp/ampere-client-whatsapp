export interface Ticket {
  id?: string;
  event: string | null;
  ticket_type: "pair" | "quad" | null;
  quantity_value: number | null;
  price: number | null;
  price_type: "per_ticket" | null;
  currency: "GBP" | "EUR" | "USD" | "INR" | null;
  area_text: string | null;
  row: string | null;
  seat_note: string | null;
  availability_status: "available" | "wanted";
  raw_line_text: string;
  sender_name: string;
  sender_phone: string;
  group_name: string;
  group_jid: string;
  message_id: string;
  created_at?: Date;
}

export interface TicketMeta {
  sender_name: string;
  sender_phone: string;
  group_name: string;
  group_jid: string;
  message_id: string;
}

export interface QueryIntent {
  type: "search" | "stats" | "list_available" | "list_wanted" | "general" | "unknown";
  event?: string;
  area?: string;
  status?: "available" | "wanted";
  timeframe?: "today" | "yesterday" | "this_week" | "all_time";
  max_price?: number;
  min_quantity?: number;
}

export interface StatsData {
  available: number;
  wanted: number;
  total: number;
  topEvents: { event: string; count: number }[];
}
