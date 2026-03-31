import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { config } from "../config";
import { Ticket, StatsData } from "../types";

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

// ── Ticket operations ──

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

// Optionally implemented deduplication logic (currently bypass)
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
  const db = getDb();
  let query: admin.firestore.Query = db.collection("tickets");

  if (filters.status) query = query.where("availability_status", "==", filters.status);
  if (filters.currency) query = query.where("currency", "==", filters.currency);
  if (filters.dateFrom) {
    query = query.where("created_at", ">=", admin.firestore.Timestamp.fromDate(filters.dateFrom));
  }

  query = query.orderBy("created_at", "desc");
  if (filters.limit) query = query.limit(filters.limit);

  const snap = await query.get();
  let results = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Ticket));

  // Client-side event filter (Firestore lacks LIKE)
  if (filters.event) {
    const eventLower = filters.event.toLowerCase();
    results = results.filter((t) => t.event?.toLowerCase().includes(eventLower));
  }

  // Client-side area filter
  if (filters.area) {
    const areaLower = filters.area.toLowerCase();
    results = results.filter((t) => t.area_text?.toLowerCase().includes(areaLower));
  }

  return results;
}

export async function getStats(dateFrom?: Date): Promise<StatsData> {
  const db = getDb();
  
  let query: admin.firestore.Query = db.collection("tickets");
  if (dateFrom) {
    query = query.where("created_at", ">=", admin.firestore.Timestamp.fromDate(dateFrom));
  }

  const snap = await query.get();

  const tickets = snap.docs.map((d) => d.data() as Ticket);
  const available = tickets.filter((t) => t.availability_status === "available").length;
  const wanted = tickets.filter((t) => t.availability_status === "wanted").length;

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
  const existing = await db.collection("admins").where("lid", "==", lid).limit(1).get();
  if (!existing.empty) return false;

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
