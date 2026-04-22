import * as admin from "firebase-admin";
import { Pool } from "pg";
import { config } from "dotenv";
import * as path from "path";

config();

async function runMigration() {
  console.log("========================================");
  console.log("  Firebase -> Neon Data Migration");
  console.log("========================================");

  // 1. Initialize Firebase
  const serviceAccountPath = path.resolve(process.cwd(), "./ticket-bot-ab6bb-firebase-adminsdk-fbsvc-05d0f654a4.json");
  const serviceAccount = require(serviceAccountPath);

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "ticket-bot-ab6bb",
    });
  }
  
  const db = admin.firestore();
  console.log("[Firebase] ✅ Connected to Firestore.");

  // 2. Initialize Neon PostgreSQL via pg Pool
  const neonUrl = process.env.NEON_DATABASE_URL;
  if (!neonUrl) {
    console.error("[Neon] ❌ NEON_DATABASE_URL is missing.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: neonUrl,
    ssl: { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  console.log("[Neon] ✅ Connected to PostgreSQL.");

  try {
    // 3. Fetch all old tickets from Firestore
    console.log("[Migration] ⏳ Fetching old tickets from Firebase...");
    const snapshot = await db.collection("tickets").get();
    
    if (snapshot.empty) {
      console.log("[Migration] No tickets found in Firebase.");
      process.exit(0);
    }

    const tickets = snapshot.docs.map(doc => {
      const data = doc.data();
      // Safely convert Firebase Timestamp to JS Date
      if (data.created_at && typeof data.created_at.toDate === 'function') {
        data.created_at = data.created_at.toDate();
      } else if (!data.created_at) {
        data.created_at = new Date(); // Fallback
      }
      return data;
    });

    console.log(`[Migration] ✅ Extracted ${tickets.length} tickets from Firebase.`);

    // 4. Batch Insert into Neon
    console.log("[Migration] ⏳ Inserting into Neon Database...");
    
    let insertedCount = 0;
    
    // We will do single inserts for simplicity and robustness in a migration script
    const insertQuery = `
      INSERT INTO tickets (
        event, ticket_type, quantity_value, price, price_type, currency, 
        area_text, row, seat_note, availability_status, raw_line_text, 
        sender_name, sender_phone, group_name, group_jid, message_id, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
      )
    `;

    for (const t of tickets) {
      const values = [
        t.event || null,
        t.ticket_type || null,
        t.quantity_value || null,
        t.price || null,
        t.price_type || null,
        t.currency || null,
        t.area_text || null,
        t.row || null,
        t.seat_note || null,
        t.availability_status || "available",
        t.raw_line_text || "Migrated from Firebase",
        t.sender_name || "Unknown",
        t.sender_phone || "Unknown",
        t.group_name || "Unknown",
        t.group_jid || "Unknown",
        t.message_id || "Unknown",
        t.created_at
      ];

      try {
        await client.query(insertQuery, values);
        insertedCount++;
      } catch (insertErr: any) {
        console.error(`[Migration] ❌ Failed to insert ticket: ${t.event}`, insertErr.message);
      }
    }

    console.log("========================================");
    console.log(`[Migration] 🎉 SUCCESS! Inserted ${insertedCount} out of ${tickets.length} tickets into Neon.`);
    console.log("========================================");

  } catch (err: any) {
    console.error("[Migration] ❌ Fatal Error:", err.message);
  } finally {
    client.release();
    pool.end();
    process.exit(0);
  }
}

runMigration();
