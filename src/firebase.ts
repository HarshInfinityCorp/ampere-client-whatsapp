import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { config } from "./config";

// ── Init ──
let db: admin.firestore.Firestore | null = null;

export function initFirebase(): void {
  if (db) return;

  const serviceAccountPath = path.resolve(process.cwd(), config.firebaseServiceAccountFile);

  if (!fs.existsSync(serviceAccountPath)) {
    console.error(`[Firebase] ❌ Service account file not found: ${serviceAccountPath}`);
    process.exit(1);
  }

  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, "utf8"));

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: config.firebaseProjectId || serviceAccount.project_id,
  });

  db = admin.firestore();
  console.log(`[Firebase] ✅ Connected to project: ${serviceAccount.project_id}`);
}

export function getDb(): admin.firestore.Firestore {
  if (!db) throw new Error("Firebase not initialized. Call initFirebase() first.");
  return db;
}

// ── Ticket helpers ──

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
  created_at?: admin.firestore.Timestamp;
}

export async function saveTicket(ticket: Ticket): Promise<string> {
  const db = getDb();
  const docRef = await db.collection("tickets").add({
    ...ticket,
    created_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

export async function saveTickets(tickets: Ticket[]): Promise<string[]> {
  if (!tickets.length) return [];
  const db = getDb();
  const batch = db.batch();
  const refs: admin.firestore.DocumentReference[] = [];

  for (const ticket of tickets) {
    const ref = db.collection("tickets").doc();
    batch.set(ref, {
      ...ticket,
      created_at: admin.firestore.FieldValue.serverTimestamp(),
    });
    refs.push(ref);
  }

  await batch.commit();
  return refs.map((r) => r.id);
}

export async function isDuplicate(messageId: string, groupJid: string): Promise<boolean> {
  const db = getDb();
  const snap = await db.collection("tickets")
    .where("message_id", "==", messageId)
    .where("group_jid", "==", groupJid)
    .limit(1)
    .get();
  return !snap.empty;
}

export async function queryTickets(filters: {
  status?: "available" | "wanted";
  event?: string;
  currency?: string;
  dateFrom?: Date;
  limit?: number;
} = {}): Promise<Ticket[]> {
  const db = getDb();
  let query: admin.firestore.Query = db.collection("tickets");

  if (filters.status) {
    query = query.where("availability_status", "==", filters.status);
  }
  if (filters.currency) {
    query = query.where("currency", "==", filters.currency);
  }
  if (filters.dateFrom) {
    query = query.where("created_at", ">=", admin.firestore.Timestamp.fromDate(filters.dateFrom));
  }

  query = query.orderBy("created_at", "desc").limit(filters.limit || 50);

  const snap = await query.get();
  const results = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Ticket));

  // Client-side event filter (Firestore doesn't support LIKE queries)
  if (filters.event) {
    const eventLower = filters.event.toLowerCase();
    return results.filter((t) => t.event?.toLowerCase().includes(eventLower));
  }

  return results;
}

export async function getStats(dateFrom: Date): Promise<{
  available: number;
  wanted: number;
  total: number;
  topEvents: { event: string; count: number }[];
}> {
  const db = getDb();
  const snap = await db.collection("tickets")
    .where("created_at", ">=", admin.firestore.Timestamp.fromDate(dateFrom))
    .get();

  const tickets = snap.docs.map((d) => d.data() as Ticket);
  const available = tickets.filter((t) => t.availability_status === "available").length;
  const wanted = tickets.filter((t) => t.availability_status === "wanted").length;

  // Top events
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

// ── Admin helpers ──

export async function registerAdmin(lid: string, name?: string): Promise<boolean> {
  const db = getDb();
  const existing = await db.collection("admins").where("lid", "==", lid).limit(1).get();
  if (!existing.empty) return false; // already registered

  await db.collection("admins").add({
    lid,
    name: name || "Unknown",
    registered_at: admin.firestore.FieldValue.serverTimestamp(),
  });
  return true;
}

export async function isAdminLid(lid: string): Promise<boolean> {
  const db = getDb();
  const snap = await db.collection("admins").where("lid", "==", lid).limit(1).get();
  return !snap.empty;
}
