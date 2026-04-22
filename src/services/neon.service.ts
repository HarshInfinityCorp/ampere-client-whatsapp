import { Pool } from 'pg';
import { config } from '../config';
import { Ticket, StatsData } from '../types';

let pool: Pool | null = null;

export async function initNeon(): Promise<void> {
  if (pool) return;

  const url = process.env.NEON_DATABASE_URL || config.neonDatabaseUrl;
  if (!url) {
    console.error("[Neon] ❌ NEON_DATABASE_URL is missing in environment variables.");
    process.exit(1);
  }

  // Use persistent TCP connection pooling instead of serverless HTTP fetch
  pool = new Pool({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    // Cloud connection resilience:
    keepAlive: true, // Prevent NAT firewalls from silently dropping the connection
    idleTimeoutMillis: 30000, // Close idle connections after 30 seconds
    connectionTimeoutMillis: 15000, // Wait 15 seconds for Neon cold starts
    max: 5, // Keep the pool small for the free tier
  });

  try {
    let client: any = null;
    let retries = 3;
    while (retries > 0) {
      try {
        client = await pool.connect();
        break;
      } catch (e: any) {
        console.warn(`[Neon] ⏳ Wakeup delay detected. Retrying... (${retries} left)`);
        retries--;
        if (retries === 0) throw e;
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    console.log(`[Neon] ✅ Connected via TCP to Neon PostgreSQL! Running migrations...`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        lid TEXT NOT NULL UNIQUE,
        name TEXT DEFAULT 'Unknown',
        registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
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
    `);
    
    client.release();
    console.log(`[Neon] ✅ DB Schema is ready.`);
  } catch (err: any) {
    console.error(`[Neon] ❌ Error initializing schema:`, err);
    process.exit(1);
  }
}

export function getDb(): Pool {
  if (!pool) throw new Error("Neon not initialized. Call initNeon() first.");
  return pool;
}

// ── Robust Query Wrapper ──

async function safeQuery(queryStr: string, values?: any[]): Promise<any> {
  const db = getDb();
  let retries = 3;
  let lastError: any;

  while (retries > 0) {
    try {
      return await db.query(queryStr, values);
    } catch (e: any) {
      lastError = e;
      // If it's a network/timeout error (like waking up from cold sleep), retry
      if (e.code === 'ETIMEDOUT' || e.code === 'ECONNRESET' || e.code === 'EHOSTUNREACH') {
        console.warn(`[Neon] ⏳ Query connection timeout (${e.code}). Retrying... (${retries - 1} left)`);
        retries--;
        if (retries === 0) throw lastError;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds before retry
      } else {
        // If it's a syntax error or logic error, throw immediately
        throw e;
      }
    }
  }
}

// ── Ticket operations ──

export async function saveTickets(tickets: Ticket[]): Promise<string[]> {
  if (!tickets.length) return [];
  
  const ids: string[] = [];
  
  const insertQuery = `
    INSERT INTO tickets (
      event, ticket_type, quantity_value, price, price_type, currency, 
      area_text, row, seat_note, availability_status, raw_line_text, 
      sender_name, sender_phone, group_name, group_jid, message_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    ) RETURNING id;
  `;
  
  for (const t of tickets) {
    const values = [
      t.event, t.ticket_type, t.quantity_value, t.price, t.price_type, t.currency,
      t.area_text, t.row, t.seat_note, t.availability_status, t.raw_line_text,
      t.sender_name, t.sender_phone, t.group_name, t.group_jid, t.message_id
    ];
    const result = await safeQuery(insertQuery, values);
    ids.push(String(result.rows[0].id));
  }
  
  return ids;
}

export async function isDuplicate(_messageId: string, _groupJid: string): Promise<boolean> {
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

  const whereClause = conditions.join(" AND ");
  const limitClause = filters.limit ? `LIMIT ${filters.limit}` : "";

  const queryStr = `SELECT * FROM tickets WHERE ${whereClause} ORDER BY created_at DESC ${limitClause}`;
  
  const res = await safeQuery(queryStr, values);
  let results = res.rows as Ticket[];

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
  let res;
  if (dateFrom) {
    res = await safeQuery("SELECT * FROM tickets WHERE created_at >= $1", [dateFrom.toISOString()]);
  } else {
    res = await safeQuery("SELECT * FROM tickets");
  }

  const tickets = res.rows as Ticket[];
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
  const res = await safeQuery("SELECT 1 FROM admins WHERE lid = $1 LIMIT 1", [lid]);
  
  if (res.rows.length > 0) return false;

  await safeQuery("INSERT INTO admins (lid, name) VALUES ($1, $2)", [lid, name || "Unknown"]);
  return true;
}

export async function isAdminLid(lid: string): Promise<boolean> {
  const res = await safeQuery("SELECT 1 FROM admins WHERE lid = $1 LIMIT 1", [lid]);
  return res.rows.length > 0;
}
