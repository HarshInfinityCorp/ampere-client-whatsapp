import { proto } from "@whiskeysockets/baileys";
import { config } from "../config";
import { saveTickets, isDuplicate, registerAdmin, isAdminLid } from "../services/firebase.service";
import { resolveLidToPhone, resolveLidFromGroups, sendMessage, getSock } from "../services/whatsapp.service";
import { parseAllTickets, isTicketMessage } from "./parser.handler";
import { handleQuery } from "./query.handler";

async function isAllowlisted(phone: string): Promise<boolean> {
  const digits = phone.replace(/\D/g, "");
  return isAdminLid(digits); 
  // Note: we let whatsapp.service cache LIDs directly against the DB resolution now,
  // so this stays simple.
}

export async function onMessage(msg: proto.IWebMessageInfo) {
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

  if (isGroup) {
    if (!isTicketMessage(text)) return;
    const groupJid = key.remoteJid || "";
    const messageId = key.id || "";
    let groupName = groupJid;

    try {
      const sock = getSock();
      if (sock) {
        const meta = await sock.groupMetadata(groupJid).catch(() => null);
        if (meta) groupName = meta.subject;
      }
    } catch { /* ignore */ }

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

  // DM Command Handling
  if (!isGroup) {
    console.log(`[WA] DM from: ${senderPhone} (raw JID: ${remoteJid})`);
    const lower = text.toLowerCase().trim();

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

    if (!(await isAllowlisted(senderPhone))) {
      const allowViaLidRegex = await isAllowlisted((await resolveLidToPhone(remoteJid) || ""));
      if (!allowViaLidRegex) {
        console.log(`[WA] ❌ Not registered: ${senderPhone}`);
        return;
      }
    }

    console.log(`[WA] 💬 Query from ${sender} (${senderPhone}): ${text}`);
    await sendMessage(remoteJid, "⏳ Looking that up...");
    const answer = await handleQuery(text, senderPhone);
    await sendMessage(remoteJid, answer);
  }
}
