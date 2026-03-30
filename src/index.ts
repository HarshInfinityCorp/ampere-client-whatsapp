import { config } from "./config";
import { initFirebase } from "./firebase";
import { startWhatsApp } from "./whatsapp";

console.log("===========================================");
console.log("  WhatsApp Ticket Trading Bot — Starting...");
console.log("===========================================");
console.log(`[Config] Pairing phone: ${config.waPairingPhone || "⚠️ NOT SET"}`);
console.log(`[Config] Firebase: ${config.firebaseServiceAccountFile}`);
console.log(`[Config] AI: ${config.geminiApiKey ? "Gemini" : "OpenClaw"}`);
console.log("===========================================\n");

if (!config.waPairingPhone) {
  console.error("❌ WA_PAIRING_PHONE is required in .env");
  process.exit(1);
}

async function main() {
  // Init Firebase
  initFirebase();

  // Start WhatsApp
  await startWhatsApp();
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

process.on("uncaughtException", (e) => {
  const msg = e?.message || "";
  if (msg.includes("Bad MAC") || msg.includes("MessageCounterError")) return;
  console.error("[Bot] Uncaught exception:", e.message);
});

process.on("unhandledRejection", (reason) => {
  const msg = String(reason);
  if (msg.includes("Bad MAC") || msg.includes("MessageCounterError")) return;
  console.error("[Bot] Unhandled rejection:", reason);
});
