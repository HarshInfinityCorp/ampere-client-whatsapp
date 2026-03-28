import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DB_PATH = path.join(process.cwd(), "data", "bot.db");

if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");

// ── Schema ──
db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    type          TEXT,
    event_name    TEXT,
    block_details TEXT,
    item          TEXT,
    quantity      TEXT,
    price         TEXT,
    sender_name   TEXT,
    sender_phone  TEXT,
    group_name    TEXT,
    raw_message   TEXT NOT NULL,
    parsed        INTEGER DEFAULT 0,
    parsed_at     TEXT DEFAULT (datetime('now')),
    synced        INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS deliveries (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_number  TEXT NOT NULL,
    link          TEXT NOT NULL,
    status        TEXT DEFAULT 'pending',
    sheet_row     INTEGER,
    delivered_at  TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS admins (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    lid           TEXT UNIQUE NOT NULL,
    phone         TEXT,
    name          TEXT,
    registered_at TEXT DEFAULT (datetime('now'))
  );
`);

// ── Trade helpers ──
export interface Trade {
  id?: number;
  type?: string;
  event_name?: string;
  block_details?: string;
  item?: string;
  quantity?: string;
  price?: string;
  sender_name?: string;
  sender_phone?: string;
  group_name?: string;
  raw_message: string;
  parsed?: boolean;
}

export function isDuplicate(trade: Trade): boolean {
  // Check if same event + block + price + sender exists in last 24 hours
  const existing = db.prepare(`
    SELECT COUNT(*) as c FROM trades
    WHERE event_name = ? 
    AND block_details = ?
    AND price = ?
    AND sender_phone = ?
    AND datetime(parsed_at) > datetime('now', '-24 hours')
  `).get(
    trade.event_name || null,
    trade.block_details || null,
    trade.price || null,
    trade.sender_phone || null
  ) as { c: number };

  return existing.c > 0;
}

export function saveTrade(trade: Trade): number {
  const result = db.prepare(`
    INSERT INTO trades (type, event_name, block_details, item, quantity, price, sender_name, sender_phone, group_name, raw_message, parsed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    trade.type || null,
    trade.event_name || null,
    trade.block_details || null,
    trade.item || null,
    trade.quantity || null,
    trade.price || null,
    trade.sender_name || null,
    trade.sender_phone || null,
    trade.group_name || null,
    trade.raw_message,
    trade.parsed ? 1 : 0
  );
  return result.lastInsertRowid as number;
}

export function queryTrades(filters: {
  type?: string;
  item?: string;
  group?: string;
  date?: string;
  limit?: number;
} = {}): Trade[] {
  let query = "SELECT * FROM trades WHERE 1=1";
  const params: (string | number)[] = [];

  if (filters.type) { query += " AND LOWER(type) = LOWER(?)"; params.push(filters.type); }
  if (filters.item) { query += " AND LOWER(item) LIKE LOWER(?)"; params.push(`%${filters.item}%`); }
  if (filters.group) { query += " AND LOWER(group_name) LIKE LOWER(?)"; params.push(`%${filters.group}%`); }
  if (filters.date) { query += " AND DATE(parsed_at) = ?"; params.push(filters.date); }

  query += " ORDER BY parsed_at DESC";
  query += ` LIMIT ${filters.limit || 50}`;

  return db.prepare(query).all(...params) as Trade[];
}

export function getStats(date?: string): {
  totalBuys: number;
  totalSells: number;
  total: number;
  topItems: { item: string; count: number }[];
} {
  const dateFilter = date || new Date().toISOString().split("T")[0];
  
  const totalBuys = (db.prepare(
    "SELECT COUNT(*) as c FROM trades WHERE LOWER(type)='buy' AND DATE(parsed_at)=?"
  ).get(dateFilter) as { c: number }).c;

  const totalSells = (db.prepare(
    "SELECT COUNT(*) as c FROM trades WHERE LOWER(type)='sell' AND DATE(parsed_at)=?"
  ).get(dateFilter) as { c: number }).c;

  const topItems = db.prepare(
    "SELECT item, COUNT(*) as count FROM trades WHERE DATE(parsed_at)=? AND item IS NOT NULL GROUP BY item ORDER BY count DESC LIMIT 5"
  ).all(dateFilter) as { item: string; count: number }[];

  return { totalBuys, totalSells, total: totalBuys + totalSells, topItems };
}

export function getUnsyncedTrades(): Trade[] {
  return db.prepare("SELECT * FROM trades WHERE synced=0 ORDER BY parsed_at ASC LIMIT 100").all() as Trade[];
}

export function markTradesSynced(ids: number[]): void {
  if (!ids.length) return;
  db.prepare(`UPDATE trades SET synced=1 WHERE id IN (${ids.map(() => "?").join(",")})`).run(...ids);
}

// ── Delivery helpers ──
export interface Delivery {
  id?: number;
  phone_number: string;
  link: string;
  status?: string;
  sheet_row?: number;
}

export function saveDelivery(delivery: Delivery): number {
  const result = db.prepare(
    "INSERT INTO deliveries (phone_number, link, status, sheet_row) VALUES (?, ?, ?, ?)"
  ).run(delivery.phone_number, delivery.link, delivery.status || "pending", delivery.sheet_row || null);
  return result.lastInsertRowid as number;
}

export function updateDeliveryStatus(id: number, status: string): void {
  db.prepare(
    "UPDATE deliveries SET status=?, delivered_at=datetime('now') WHERE id=?"
  ).run(status, id);
}

export function getPendingDeliveries(): Delivery[] {
  return db.prepare("SELECT * FROM deliveries WHERE status='pending'").all() as Delivery[];
}

// ── Admin helpers ──
export function registerAdmin(lid: string, name?: string): boolean {
  try {
    db.prepare(
      "INSERT OR IGNORE INTO admins (lid, name) VALUES (?, ?)"
    ).run(lid, name || null);
    return true;
  } catch {
    return false;
  }
}

export function isAdminLid(lid: string): boolean {
  const result = db.prepare(
    "SELECT COUNT(*) as c FROM admins WHERE lid = ?"
  ).get(lid) as { c: number };
  return result.c > 0;
}

export function getAllAdmins(): { lid: string; name: string; registered_at: string }[] {
  return db.prepare("SELECT lid, name, registered_at FROM admins").all() as any[];
}

export function removeAdmin(lid: string): boolean {
  const result = db.prepare("DELETE FROM admins WHERE lid = ?").run(lid);
  return result.changes > 0;
}

export default db;
