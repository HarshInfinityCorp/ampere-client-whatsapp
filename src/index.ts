import * as cron from "node-cron";
import { config } from "./config";
import { startWhatsApp } from "./whatsapp";
import { processDeliveries } from "./delivery";
import { ensureTradesSheetHeader, appendTrade } from "./sheets";
import { getUnsyncedTrades, markTradesSynced } from "./db";

console.log("===========================================");
console.log("  WhatsApp Trade Bot — Starting...");
console.log("===========================================");
console.log(`[Config] Allowlist: ${config.allowlist.length ? config.allowlist.join(", ") : "⚠️ NONE SET"}`);
console.log(`[Config] Pairing phone: ${config.waPairingPhone || "⚠️ NOT SET"}`);
console.log(`[Config] Google Sheet ID: ${config.sheetId || "⚠️ NOT SET"}`);
console.log(`[Config] AI: ${config.geminiApiKey ? "Gemini" : "OpenClaw"}`);
console.log(`[Config] Delivery poll: every ${config.deliveryPollInterval} min`);
console.log("===========================================\n");

// Validate critical config
if (!config.waPairingPhone) {
  console.error("❌ WA_PAIRING_PHONE is required in .env");
  process.exit(1);
}

if (!config.allowlist.length) {
  console.warn("⚠️  ALLOWLIST is empty — no one can query the bot!");
}

async function main() {
  // Setup Google Sheets header (if trades sync enabled)
  if (config.syncTradesToSheets && config.sheetId) {
    await ensureTradesSheetHeader().catch((e) =>
      console.error("[Sheets] Could not set up trades sheet:", e.message)
    );
  }

  // Start WhatsApp
  await startWhatsApp();

  // Start delivery cron job
  if (config.sheetId) {
    const cronExpr = `*/${config.deliveryPollInterval} * * * *`;
    console.log(`[Cron] Delivery poll scheduled every ${config.deliveryPollInterval} min`);

    cron.schedule(cronExpr, async () => {
      console.log("[Cron] Running delivery check...");
      await processDeliveries().catch((e) =>
        console.error("[Cron] Delivery error:", e.message)
      );
    });
  } else {
    console.log("[Cron] No GOOGLE_SHEET_ID set — delivery polling disabled");
  }

  // Start failed sync retry job (every 5 min)
  if (config.syncTradesToSheets && config.sheetId) {
    console.log("[Cron] Failed sync retry scheduled every 5 min");

    cron.schedule("*/5 * * * *", async () => {
      const unsynced = getUnsyncedTrades();
      if (!unsynced.length) return;

      console.log(`[Cron] Retrying ${unsynced.length} unsynced trades...`);
      const synced: number[] = [];

      for (const trade of unsynced) {
        try {
          await appendTrade(trade);
          if (trade.id) synced.push(trade.id);
        } catch (e: any) {
          console.error(`[Cron] Failed to sync trade ${trade.id}:`, e.message);
        }
      }

      if (synced.length) {
        markTradesSynced(synced);
        console.log(`[Cron] ✅ Synced ${synced.length} trades to Google Sheets`);
      }
    });
  }
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});

// Keep process alive
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
