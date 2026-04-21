import { neon, neonConfig } from '@neondatabase/serverless';
import { config } from '../config';
import { Ticket, StatsData } from '../types';

let sql: any = null;

export async function initNeon(): Promise<void> {
  if (sql) return;

  const url = process.env.NEON_DATABASE_URL || config.neonDatabaseUrl;
  if (!url) {
    console.error("[Neon] ❌ NEON_DATABASE_URL is missing in environment variables.");
    process.exit(1);
  }

  // Create Neon serverless HTTP connection logic
  sql = neon(url);

  console.log(`[Neon] ✅ Connected to Neon PostgreSQL! Running migrations...`);

  try {
    await sql`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        lid TEXT NOT NULL UNIQUE,
        name TEXT DEFAULT 'Unknown',
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS tickets (
        id SERIAL PRIMARY KEY,
        event TEXT,
        ticket_type TEXT,
        quantity_value INTEGER,
        price NUMERIC,
        price_type TEXT,
        currency TEXT,
        area_text TEXT,
        row TEXT,
        seat_note TEXT,
        availability_status TEXT NOT NULL,
        raw_line_text TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_phone TEXT NOT NULL,
        group_name TEXT NOT NULL,
        group_jid TEXT NOT NULL,
        message_id TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log(`[Neon] ✅ DB Schema is ready.`);
  } catch (err: any) {
    console.error(`[Neon] ❌ Error initializing schema:`, err.message);
    process.exit(1);
  }
}

export function getDb() {
  if (!sql) throw new Error("Neon not initialized. Call initNeon() first.");
  return sql;
}

// ── Ticket operations ──

export async function saveTickets(tickets: Ticket[]): Promise<string[]> {
  if (!tickets.length) return [];
  const db = getDb();
  
  const ids: string[] = [];
  
  for (const t of tickets) {
    const result = await db`
      INSERT INTO tickets (
        event, ticket_type, quantity_value, price, price_type, currency, 
        area_text, row, seat_note, availability_status, raw_line_text, 
        sender_name, sender_phone, group_name, group_jid, message_id
      ) VALUES (
        ${t.event}, ${t.ticket_type}, ${t.quantity_value}, ${t.price}, ${t.price_type}, ${t.currency},
        ${t.area_text}, ${t.row}, ${t.seat_note}, ${t.availability_status}, ${t.raw_line_text},
        ${t.sender_name}, ${t.sender_phone}, ${t.group_name}, ${t.group_jid}, ${t.message_id}
      ) RETURNING id;
    `;
    ids.push(String(result[0].id));
  }
  
  return ids;
}

export async function isDuplicate(_messageId: string, _groupJid: string): Promise<boolean> {
  // Deduplication logic bypassed right now, exactly like firebase implementation
  return false;
}

export async function queryTickets(filters: {
  status?: "available" | "wanted";
  event?: string;
  area?: string;
  currency?: string;
  dateFrom?: Date;
  limit?: number;
} = {}): Promise<Ticket[]> {
  const db = getDb();

  // We build a dynamic WHERE clause
  const conditions = ["1=1"];
  const values: any[] = [];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`availability_status = $${values.length}`);
  }
  
  if (filters.currency) {
    values.push(filters.currency);
    conditions.push(`currency = $${values.length}`);
  }

  if (filters.dateFrom) {
    values.push(filters.dateFrom.toISOString());
    conditions.push(`created_at >= $${values.length}`);
  }

  // Use raw SQL with safe template variables for conditions
  const whereClause = conditions.join(" AND ");
  const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";

  // Because serverless neon driver `sql` tag function expects simple string interpolation for static strings, 
  // but array parameters for values. We can use the simple execution format provided by `@neondatabase/serverless`
  // Actually, `@neondatabase/serverless` using `neon()` handles parameters like a standard JS pg client.
  // Wait, `sql('SELECT ... WHERE status=$1', [status])` or `sql(query, values)` is allowed.
  
  const queryStr = `SELECT * FROM tickets WHERE ${whereClause} ORDER BY created_at DESC ${limitClause}`;
  
  const rows = await db(queryStr, values);
  
  let results = rows as Ticket[];

  // Client-side event filter
  if (filters.event) {
    const eventLower = filters.event.toLowerCase();
    results = results.filter((t: Ticket) => t.event?.toLowerCase().includes(eventLower));
  }

  // Client-side area filter
  if (filters.area) {
    const areaLower = filters.area.toLowerCase();
    results = results.filter((t: Ticket) => t.area_text?.toLowerCase().includes(areaLower));
  }

  return results;
}

export async function getStats(dateFrom?: Date): Promise<StatsData> {
  const db = getDb();
  
  let rows: any;
  if (dateFrom) {
    rows = await db("SELECT * FROM tickets WHERE created_at >= $1", [dateFrom.toISOString()]);
  } else {
    rows = await db("SELECT * FROM tickets");
  }

  const tickets = rows as Ticket[];
  const available = tickets.filter(t => t.availability_status === "available").length;
  const wanted = tickets.filter(t => t.availability_status === "wanted").length;

  const eventCount: Record<string, number> = {};
  for (const t of tickets) {
    if (t.event) eventCount[t.event] = (eventCount[t.event] || 0) + 1;
  }
  
  const topEvents = Object.entries(eventCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([event, count]) => ({ event, count }));

  return { available, wanted, total: tickets.length, topEvents };
}

// ── Admin operations ──

export async function registerAdmin(lid: string, name?: string): Promise<boolean> {
  const db = getDb();
  const existing = await db("SELECT 1 FROM admins WHERE lid = $1 LIMIT 1", [lid]);
  
  if (existing.length > 0) return false;

  await db("INSERT INTO admins (lid, name) VALUES ($1, $2)", [lid, name || "Unknown"]);
  return true;
}

export async function isAdminLid(lid: string): Promise<boolean> {
  const db = getDb();
  const existing = await db("SELECT 1 FROM admins WHERE lid = $1 LIMIT 1", [lid]);
  return existing.length > 0;
}
