import { readDeliverySheet, markAsDelivered, markAsFailed } from "./sheets";
import { saveDelivery, updateDeliveryStatus } from "./db";
import { config } from "./config";

type SendFn = (phone: string, message: string) => Promise<void>;

let sendMessage: SendFn | null = null;

export function setDeliverySender(fn: SendFn) {
  sendMessage = fn;
}

export async function processDeliveries(): Promise<string> {
  if (!sendMessage) {
    return "❌ Delivery processor not ready (WhatsApp not connected)";
  }

  if (!config.sheetId) {
    return "❌ No Google Sheet ID configured (GOOGLE_SHEET_ID in .env)";
  }

  console.log("[Delivery] Starting delivery check...");

  let delivered = 0;
  let failed = 0;
  let skipped = 0;

  try {
    const rows = await readDeliverySheet();

    if (!rows.length) {
      console.log("[Delivery] No pending deliveries found");
      return "✅ No pending deliveries in the sheet";
    }

    console.log(`[Delivery] Found ${rows.length} pending rows`);

    for (const row of rows) {
      // Normalize phone number
      let phone = row.phone.replace(/\s+/g, "").replace(/[^\d+]/g, "");
      if (!phone.startsWith("+")) phone = "+" + phone;

      // Basic validation
      if (phone.length < 10) {
        console.warn(`[Delivery] Invalid phone in row ${row.rowIndex}: ${row.phone}`);
        await markAsFailed(row.rowIndex, "invalid phone");
        failed++;
        continue;
      }

      const dbId = saveDelivery({
        phone_number: phone,
        link: row.link,
        status: "pending",
        sheet_row: row.rowIndex,
      });

      try {
        const message = `Here is your link: ${row.link}`;
        await sendMessage(phone, message);
        await markAsDelivered(row.rowIndex);
        updateDeliveryStatus(dbId, "delivered");
        delivered++;
        console.log(`[Delivery] ✅ Delivered to ${phone} (row ${row.rowIndex})`);

        // Small delay to avoid rate limiting
        await sleep(2000);
      } catch (error: any) {
        const reason = error?.message || "unknown error";
        console.error(`[Delivery] ❌ Failed for ${phone}: ${reason}`);
        await markAsFailed(row.rowIndex, reason.slice(0, 50));
        updateDeliveryStatus(dbId, "failed");
        failed++;
      }
    }
  } catch (error: any) {
    console.error("[Delivery] Error reading sheet:", error.message);
    return `❌ Error reading Google Sheet: ${error.message}`;
  }

  const summary = `📦 Delivery complete:\n✅ Delivered: ${delivered}\n❌ Failed: ${failed}\n⏭️ Skipped: ${skipped}`;
  console.log("[Delivery]", summary);
  return summary;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
