import { Pool } from 'pg';
import { config } from 'dotenv';
config();
const pool = new Pool({
  connectionString: process.env.NEON_DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
async function run() {
  try {
    const client = await pool.connect();
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
    console.log("Migration Success");
    client.release();
  } catch(e) {
    console.error("Full Error:", e);
  }
}
run();
