import { google } from "googleapis";
import { config } from "./config";
import type { Trade } from "./db";

let sheets: ReturnType<typeof google.sheets> | null = null;

function getSheets() {
  if (sheets) return sheets;
  const auth = new google.auth.GoogleAuth({
    keyFile: config.serviceAccountFile,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  sheets = google.sheets({ version: "v4", auth });
  return sheets;
}

function colToIndex(col: string): number {
  return col.toUpperCase().charCodeAt(0) - 65; // A=0, B=1, C=2
}

// ── Delivery Sheet ──

export interface DeliveryRow {
  rowIndex: number;    // 1-based row number
  phone: string;
  link: string;
  status: string;
}

export async function readDeliverySheet(): Promise<DeliveryRow[]> {
  try {
    const s = getSheets();
    const range = `${config.deliverySheetName}!A:Z`;
    const response = await s.spreadsheets.values.get({
      spreadsheetId: config.sheetId,
      range,
    });

    const rows = response.data.values || [];
    const phoneIdx = colToIndex(config.deliveryColPhone);
    const linkIdx = colToIndex(config.deliveryColLink);
    const statusIdx = colToIndex(config.deliveryColStatus);

    const result: DeliveryRow[] = [];

    // Skip header row (row 0 = row 1 in sheets)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const phone = (row[phoneIdx] || "").toString().trim();
      const link = (row[linkIdx] || "").toString().trim();
      const status = (row[statusIdx] || "").toString().trim().toLowerCase();

      if (!phone || !link) continue;
      if (status === "delivered") continue; // already done

      result.push({
        rowIndex: i + 1, // 1-based (row 1 = header, row 2 = first data)
        phone,
        link,
        status,
      });
    }

    return result;
  } catch (error) {
    console.error("[Sheets] Error reading delivery sheet:", error);
    return [];
  }
}

export async function markAsDelivered(rowIndex: number): Promise<void> {
  try {
    const s = getSheets();
    const statusCell = `${config.deliverySheetName}!${config.deliveryColStatus}${rowIndex}`;
    await s.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: statusCell,
      valueInputOption: "RAW",
      requestBody: { values: [["delivered"]] },
    });
    console.log(`[Sheets] Row ${rowIndex} marked as delivered`);
  } catch (error) {
    console.error(`[Sheets] Error marking row ${rowIndex} as delivered:`, error);
    throw error;
  }
}

export async function markAsFailed(rowIndex: number, reason: string): Promise<void> {
  try {
    const s = getSheets();
    const statusCell = `${config.deliverySheetName}!${config.deliveryColStatus}${rowIndex}`;
    await s.spreadsheets.values.update({
      spreadsheetId: config.sheetId,
      range: statusCell,
      valueInputOption: "RAW",
      requestBody: { values: [[`failed: ${reason}`]] },
    });
  } catch (error) {
    console.error(`[Sheets] Error marking row ${rowIndex} as failed:`, error);
  }
}

// ── Trades Sheet (optional sync) ──

export async function ensureTradesSheetHeader(): Promise<void> {
  try {
    const s = getSheets();

    // Check if "Trades" tab exists
    const spreadsheet = await s.spreadsheets.get({ spreadsheetId: config.sheetId });
    const sheets = spreadsheet.data.sheets || [];
    const tradesTabExists = sheets.some(
      (sheet) => sheet.properties?.title === config.tradesSheetName
    );

    // Create "Trades" tab if it doesn't exist
    if (!tradesTabExists) {
      console.log(`[Sheets] Creating "${config.tradesSheetName}" tab...`);
      await s.spreadsheets.batchUpdate({
        spreadsheetId: config.sheetId,
        requestBody: {
          requests: [
            {
              addSheet: {
                properties: { title: config.tradesSheetName },
              },
            },
          ],
        },
      });
      console.log(`[Sheets] ✅ "${config.tradesSheetName}" tab created`);
    }

    // Add header row if empty
    const range = `${config.tradesSheetName}!A1:L1`;
    const response = await s.spreadsheets.values.get({
      spreadsheetId: config.sheetId,
      range,
    });
    if (!response.data.values?.length) {
      await s.spreadsheets.values.update({
        spreadsheetId: config.sheetId,
        range,
        valueInputOption: "RAW",
        requestBody: {
          values: [["Type", "Event Name", "Block Details", "Item", "Quantity", "Price", "Sender Name", "Sender Phone", "Group", "Raw Message", "Parsed", "Timestamp"]],
        },
      });
      console.log(`[Sheets] ✅ Header row added to "${config.tradesSheetName}"`);
    }
  } catch (e: any) {
    console.error("[Sheets] Error setting up trades sheet:", e.message);
  }
}

export async function appendTrade(trade: Trade): Promise<void> {
  try {
    const s = getSheets();
    await s.spreadsheets.values.append({
      spreadsheetId: config.sheetId,
      range: `${config.tradesSheetName}!A:L`,
      valueInputOption: "RAW",
      requestBody: {
        values: [[
          trade.type || "",
          trade.event_name || "",
          trade.block_details || "",
          trade.item || "",
          trade.quantity || "",
          trade.price || "",
          trade.sender_name || "",
          trade.sender_phone || "",
          trade.group_name || "",
          trade.raw_message,
          trade.parsed ? "yes" : "partial",
          new Date().toISOString(),
        ]],
      },
    });
  } catch (error) {
    console.error("[Sheets] Error appending trade:", error);
    throw error; // Re-throw so whatsapp.ts can catch and log
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    if (!config.sheetId) {
      console.log("[Sheets] No GOOGLE_SHEET_ID set — skipping sheets");
      return false;
    }
    const s = getSheets();
    await s.spreadsheets.get({ spreadsheetId: config.sheetId });
    console.log("[Sheets] ✅ Connected to Google Sheets");
    return true;
  } catch (error) {
    console.error("[Sheets] ❌ Connection failed:", error);
    return false;
  }
}
