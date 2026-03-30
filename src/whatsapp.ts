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
import { config, isAllowlisted } from "./config";
import { parseAllTickets, isTicketMessage } from "./parser";
import { saveTickets, isDuplicate, registerAdmin } from "./firebase";
import { handleQuery } from "./query";

const AUTH_DIR = path.join(process.cwd(), "data", ".wa-auth");
const logger = pino({ level: "silent" });

// Suppress Baileys decrypt errors
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  const msg = args[0]?.toString() || "";
  if (msg.includes("Failed to decrypt") || msg.includes("MessageCounterError") || msg.includes("Bad MAC")) return;
  originalConsoleError(...args);
};

let sock: ReturnType<typeof makeWASocket> | null = null;

// ── LID → Phone cache (built from group metadata) ──
const lidToPhoneCache = new Map<string, string>();

// ── Public send function ──
export async function sendMessage(target: string, message: string): Promise<void> {
  if (!sock) throw new Error("WhatsApp not connected");
  const jid = target.includes("@") ? target : `${target.replace(/\D/g, "")}@s.whatsapp.net`;
  await sock.sendMessage(jid, { text: message });
  console.log(`[WA] Sent to ${jid}: ${message.slice(0, 60)}...`);
}

// ── Resolve LID via signal repository ──
async function resolveLidToPhone(jid: string): Promise<string | null> {
  if (!sock || !jid.endsWith("@lid")) return null;
  try {
    const signalRepo = (sock as any).signalRepository;
    const lidLookup = signalRepo?.lidMapping;
    if (!lidLookup?.getPNForLID) return null;
    const pnJid = await lidLookup.getPNForLID(jid);
    if (!pnJid) return null;
    return pnJid.replace(/@.+/, "");
  } catch { return null; }
}

// ── Resolve LID via group participant metadata ──
async function resolveLidFromGroups(lidJid: string): Promise<string | null> {
  if (!sock) return null;
  const lid = lidJid.replace(/@.*/, "");
  if (lidToPhoneCache.has(lid)) return lidToPhoneCache.get(lid)!;

  try {
    const groups = await sock.groupFetchAllParticipating();
    for (const groupId in groups) {
      for (const participant of groups[groupId].participants) {
        const pLid = (participant.lid || "").replace(/@.*/, "");
        const pPhone = (participant.jid || participant.id || "").replace(/@.*/, "");
        if (pLid && pPhone && pLid !== pPhone) {
          lidToPhoneCache.set(pLid, pPhone);
        }
      }
    }
    return lidToPhoneCache.get(lid) || null;
  } catch { return null; }
}

// ── Handle incoming messages ──
async function onMessage(msg: proto.IWebMessageInfo) {
  const key = msg.key;
  const isGroup = key.remoteJid?.endsWith("@g.us");
  if (key.fromMe) return;

  const text =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.ephemeralMessage?.message?.conversation ||
    "";

  if (!text) return;

  const sender = msg.pushName || "Unknown";
  const remoteJid = key.remoteJid || "";

  // ── Extract sender phone ──
  let rawJid = key.participant || remoteJid || "";
  let senderPhone = rawJid.replace(/@.+/, "");

  if (isGroup && key.participant?.endsWith("@s.whatsapp.net")) {
    senderPhone = key.participant.replace(/@.+/, "");
  } else if (rawJid.endsWith("@lid")) {
    const resolved =
      (await resolveLidToPhone(rawJid)) ||
      (await resolveLidFromGroups(rawJid));
    if (resolved) senderPhone = resolved;
  }

  // ── GROUP: parse ticket messages ──
  if (isGroup) {
    if (!isTicketMessage(text)) return;

    const groupJid = key.remoteJid || "";
    const messageId = key.id || "";
    let groupName = groupJid;

    try {
      if (sock) {
        const meta = await sock.groupMetadata(groupJid).catch(() => null);
        if (meta) groupName = meta.subject;
      }
    } catch { /* ignore */ }

    // Dedup by message ID
    if (await isDuplicate(messageId, groupJid)) {
      console.log(`[WA] ⏭️  Duplicate message skipped: ${messageId}`);
      return;
    }

    const tickets = parseAllTickets(text, {
      sender_name: sender,
      sender_phone: senderPhone,
      group_name: groupName,
      group_jid: groupJid,
      message_id: messageId,
    });

    if (!tickets.length) return;

    await saveTickets(tickets as any);
    console.log(`[WA] 🎫 Saved ${tickets.length} ticket(s) from "${groupName}" by ${sender}`);
    return;
  }

  // ── DM: admin commands ──
  if (!isGroup) {
    console.log(`[WA] DM from: ${senderPhone} (raw JID: ${remoteJid})`);
    const lower = text.toLowerCase().trim();

    // Registration (works for anyone)
    if (lower === `register ${config.registerSecret}`) {
      console.log(`[WA] 🔑 Registration from: ${senderPhone} (${sender})`);
      const success = await registerAdmin(senderPhone, sender);
      await sendMessage(remoteJid,
        success
          ? `✅ You're registered!\n\nYou can now query me.\n\nTry:\n• "show available"\n• "find Liverpool"\n• "how many today?"`
          : `✅ You're already registered! Just ask me a question.`
      );
      return;
    }

    // Allowlist check
    if (!(await isAllowlisted(senderPhone))) {
      console.log(`[WA] ❌ Not registered: ${senderPhone}`);
      return;
    }

    console.log(`[WA] 💬 Query from ${sender}: ${text}`);
    await sendMessage(remoteJid, "⏳ Looking that up...");
    const answer = await handleQuery(text);
    await sendMessage(remoteJid, answer);
  }
}

// ── Start WhatsApp ──
export async function startWhatsApp(): Promise<void> {
  if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

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
      }
    }

    if (connection === "open") {
      console.log("[WA] ✅ WhatsApp connected!");
      console.log("[WA] Listening to groups silently. Never sending to groups.");

      // Build LID→phone cache from all groups
      try {
        const groups = await sock!.groupFetchAllParticipating();
        let cached = 0;
        for (const groupId in groups) {
          for (const participant of groups[groupId].participants) {
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
