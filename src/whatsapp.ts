import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  proto,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import path from "path";
import fs from "fs";
import { config, isAllowlisted, registerLid } from "./config";
import { parseAllBlocks, isTrade } from "./parser";
import { saveTrade, isDuplicate, registerAdmin } from "./db";

// ── LID → Phone cache (built from group metadata) ──
const lidToPhoneCache = new Map<string, string>();

async function buildLidCache(socket: ReturnType<typeof makeWASocket>) {
  // We build the cache lazily when we encounter a LID
}

async function resolveLidFromGroups(lidJid: string): Promise<string | null> {
  if (!sock) return null;
  const lid = lidJid.replace(/@.*/, "");
  
  // Check cache first
  if (lidToPhoneCache.has(lid)) {
    return lidToPhoneCache.get(lid)!;
  }

  // Try to find this LID in any group's participant list
  try {
    const groups = await sock.groupFetchAllParticipating();
    for (const groupId in groups) {
      const group = groups[groupId];
      for (const participant of group.participants) {
        // participant has: id (could be phone or lid), jid (normalized phone), lid
        const pLid = (participant.lid || "").replace(/@.*/, "");
        const pPhone = (participant.jid || participant.id || "").replace(/@.*/, "");
        
        if (pLid && pPhone && !pPhone.includes(pLid)) {
          // Cache all LID→phone mappings we find
          lidToPhoneCache.set(pLid, pPhone);
        }
      }
    }

    // Check cache again after building
    if (lidToPhoneCache.has(lid)) {
      console.log(`[WA] ✅ LID ${lid} resolved to phone: ${lidToPhoneCache.get(lid)} (from group metadata)`);
      return lidToPhoneCache.get(lid)!;
    }
  } catch (e: any) {
    console.error(`[WA] Error fetching group participants for LID resolution:`, e.message);
  }

  return null;
}
import { appendTrade, testConnection } from "./sheets";
import { handleQuery } from "./query";
import { processDeliveries, setDeliverySender } from "./delivery";

const AUTH_DIR = path.join(process.cwd(), "data", ".wa-auth");
const logger = pino({ level: "silent" });

// Suppress Baileys decrypt errors from console (harmless, old messages from before pairing)
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = args[0]?.toString() || "";
  if (msg.includes("Failed to decrypt") || msg.includes("MessageCounterError") || msg.includes("Bad MAC")) return;
  originalConsoleError(...args);
};

let sock: ReturnType<typeof makeWASocket> | null = null;

// ── Public send function ──
export async function sendMessage(target: string, message: string): Promise<void> {
  if (!sock) throw new Error("WhatsApp not connected");

  let jid: string;

  if (target.includes("@")) {
    // Already a JID (e.g. 75535673725102@lid or 919313557365@s.whatsapp.net)
    jid = target;
  } else {
    // Plain phone number — format as JID
    const digits = target.replace(/\D/g, "");
    jid = `${digits}@s.whatsapp.net`;
  }

  await sock.sendMessage(jid, { text: message });
  console.log(`[WA] Sent to ${jid}: ${message.slice(0, 60)}...`);
}

// ── Resolve LID to real phone number ──
async function resolveLidToPhone(jid: string): Promise<string | null> {
  if (!sock) return null;
  if (!jid.endsWith("@lid")) return null;

  try {
    const signalRepo = (sock as any).signalRepository;
    const lidLookup = signalRepo?.lidMapping;
    console.log(`[WA] signalRepository keys:`, signalRepo ? Object.keys(signalRepo) : "null");
    console.log(`[WA] lidLookup:`, lidLookup ? Object.keys(lidLookup) : "null");

    if (!lidLookup?.getPNForLID) {
      console.log(`[WA] getPNForLID not available`);
      return null;
    }
    const pnJid = await lidLookup.getPNForLID(jid);
    console.log(`[WA] getPNForLID result:`, pnJid);
    if (!pnJid) return null;
    return pnJid.replace(/@.+/, "");
  } catch (e: any) {
    console.log(`[WA] LID resolve error:`, e.message);
    return null;
  }
}

// ── Handle incoming messages ──
async function onMessage(msg: proto.IWebMessageInfo) {
  const key = msg.key;
  const isGroup = key.remoteJid?.endsWith("@g.us");
  const isFromMe = key.fromMe;

  if (isFromMe) return; // ignore our own messages

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.ephemeralMessage?.message?.conversation ||
    "";

  if (!text) return;

  const sender = msg.pushName || "Unknown";
  const remoteJid = key.remoteJid || "";

  // Extract sender phone — resolve LID to real phone if needed
  let rawJid = key.participant || remoteJid || "";
  let senderPhone = rawJid.replace(/@.+/, "");

  // In group messages, participant might have real phone number
  if (isGroup && key.participant?.endsWith("@s.whatsapp.net")) {
    senderPhone = key.participant.replace(/@.+/, "");
  }

  // If it's a LID, resolve to real phone number
  if (rawJid.endsWith("@lid") || senderPhone.match(/^\d+$/) && !rawJid.endsWith("@s.whatsapp.net")) {
    // Try signal repository first
    const resolvedFromSignal = await resolveLidToPhone(rawJid.endsWith("@lid") ? rawJid : remoteJid);
    if (resolvedFromSignal) {
      console.log(`[WA] LID ${senderPhone} resolved via signal: ${resolvedFromSignal}`);
      senderPhone = resolvedFromSignal;
    } else {
      // Try group metadata lookup
      const resolvedFromGroups = await resolveLidFromGroups(rawJid.endsWith("@lid") ? rawJid : `${senderPhone}@lid`);
      if (resolvedFromGroups) {
        senderPhone = resolvedFromGroups;
      } else {
        console.log(`[WA] ⚠️ Could not resolve LID: ${senderPhone} — saving as-is`);
      }
    }
  }

  // ── GROUP MESSAGE: parse trades ──
  if (isGroup) {
    if (!isTrade(text)) return;

    const groupId = key.remoteJid || "";
    let groupName = groupId;

    // Try to get group name from metadata (cached)
    try {
      if (sock) {
        const meta = await sock.groupMetadata(groupId).catch(() => null);
        if (meta) groupName = meta.subject;
      }
    } catch { /* ignore */ }

    // Parse all ticket blocks from message
    const parsedBlocks = parseAllBlocks(text);

    let savedCount = 0;
    let dupCount = 0;

    for (const parsed of parsedBlocks) {
      const trade = {
        type: parsed.type || undefined,
        event_name: parsed.event_name || undefined,
        block_details: parsed.block_details || undefined,
        item: parsed.item || undefined,
        quantity: parsed.quantity || undefined,
        price: parsed.price || undefined,
        sender_name: sender,
        sender_phone: senderPhone,
        group_name: groupName,
        raw_message: text,
        parsed: parsed.parsed,
      };

      // Check for duplicate
      if (isDuplicate(trade)) {
        dupCount++;
        console.log(
          `[WA] ⏭️  Duplicate skipped: ${parsed.event_name} - ${parsed.block_details}`
        );
        continue;
      }

      // Save to SQLite
      saveTrade(trade);
      savedCount++;

      // Real-time sync to Google Sheets (with fallback)
      if (config.syncTradesToSheets) {
        await appendTrade(trade).catch((e) => {
          console.error("[WA] ⚠️  Sheet sync failed, will retry later:", e.message);
          // Trade is still in SQLite, will be synced by cron job
        });
      }
    }

    if (savedCount > 0) {
      console.log(
        `[WA] 📦 Saved ${savedCount} trade(s) from "${groupName}" by ${sender} (${dupCount} duplicates skipped)`
      );
    }

    return;
  }

  // ── DM MESSAGE ──
  if (!isGroup) {
    console.log(`[WA] DM received from: ${senderPhone} (raw JID: ${key.remoteJid})`);

    const lower = text.toLowerCase().trim();

    // ── Auto-registration — works for ANYONE before allowlist check ──
    // New admin sends "register <secret>" → auto-saved to DB, no restart needed
    if (lower === `register ${config.registerSecret}`) {
      console.log(`[WA] 🔑 Registration request from: ${senderPhone} (${sender})`);
      const success = registerAdmin(senderPhone, sender);
      if (success) {
        console.log(`[WA] ✅ Admin registered: ${senderPhone} (${sender})`);
        await sendMessage(remoteJid,
          `✅ *You're registered!*\n\nYou can now query me directly.\n\nTry:\n• "show available"\n• "find Liverpool"\n• "how many today?"\n• "send pending deliveries"`
        );
      } else {
        await sendMessage(remoteJid, `✅ You're already registered! Send me a query.`);
      }
      return;
    }

    if (!isAllowlisted(senderPhone)) {
      console.log(`[WA] ❌ Not in allowlist: ${senderPhone}`);
      console.log(`[WA] 👉 They can send "register admin123" to discover their ID`);
      return;
    }

    console.log(`[WA] 💬 Query from ${sender} (${senderPhone}): ${text}`);

    if (lower === "send pending deliveries" || lower === "send deliveries" || lower === "deliver") {
      await sendMessage(remoteJid, "⏳ Processing deliveries from Google Sheet...");
      const result = await processDeliveries();
      await sendMessage(remoteJid, result);
      return;
    }

    // AI query
    await sendMessage(remoteJid, "⏳ Looking that up...");
    const answer = await handleQuery(text);
    await sendMessage(remoteJid, answer);
  }
}

// ── Start WhatsApp ──
export async function startWhatsApp(): Promise<void> {
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  console.log(`[WA] Using Baileys version: ${version.join(".")}`);

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ["Mac OS", "Chrome", "130.0.0"],
  });

  // Register delivery sender
  setDeliverySender(sendMessage);

  // ── Pairing ──
  if (!state.creds.registered) {
    if (!config.waPairingPhone) {
      console.error("[WA] ❌ WA_PAIRING_PHONE not set in .env");
      process.exit(1);
    }

    console.log(`[WA] Requesting pairing code for ${config.waPairingPhone}...`);
    await sleep(3000);
    const code = await sock.requestPairingCode(config.waPairingPhone.replace(/\D/g, ""));
    console.log(`\n[WA] ✅ PAIRING CODE: ${code}\n`);
    console.log("[WA] Enter this code in WhatsApp → Linked Devices → Link a Device → Link with phone number\n");
  }

  // ── Events ──
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

      console.log(`[WA] Connection closed (status: ${statusCode}). Reconnect: ${shouldReconnect}`);

      if (shouldReconnect) {
        console.log("[WA] Reconnecting in 5s...");
        await sleep(5000);
        startWhatsApp();
      } else {
        console.log("[WA] Logged out. Delete data/.wa-auth and restart to re-pair.");
      }
    }

    if (connection === "open") {
      console.log("[WA] ✅ WhatsApp connected!");
      console.log("[WA] Listening to groups silently. Never sending to groups.");

      // Build LID→phone cache from all groups
      try {
        console.log("[WA] Building LID→phone cache from group participants...");
        const groups = await sock!.groupFetchAllParticipating();
        let cached = 0;
        for (const groupId in groups) {
          const group = groups[groupId];
          for (const participant of group.participants) {
            const pLid = (participant.lid || "").replace(/@.*/, "");
            const pPhone = (participant.jid || participant.id || "").replace(/@.*/, "");
            if (pLid && pPhone && pLid !== pPhone) {
              lidToPhoneCache.set(pLid, pPhone);
              cached++;
            }
          }
        }
        console.log(`[WA] ✅ LID cache built: ${cached} mappings from ${Object.keys(groups).length} groups`);
      } catch (e: any) {
        console.error("[WA] ⚠️ Could not build LID cache:", e.message);
      }

      // Test Google Sheets connection
      await testConnection();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      await onMessage(msg).catch((e) =>
        console.error("[WA] Message handler error:", e.message)
      );
    }
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
