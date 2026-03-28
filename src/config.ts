import * as dotenv from "dotenv";
dotenv.config();

export const config = {
  // WhatsApp
  waPairingPhone: process.env.WA_PAIRING_PHONE || "",

  // Allowlist (from .env — seed/fallback only)
  allowlist: (process.env.ALLOWLIST || "")
    .split(",")
    .map((n) => n.trim().replace(/\D/g, ""))
    .filter(Boolean),

  // Register secret — client sets this once in .env
  registerSecret: (process.env.REGISTER_SECRET || "admin123").toLowerCase(),

  // Google Sheets
  serviceAccountFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE || "./whatsapp-bot-491405-11b125b6f487.json",
  sheetId: process.env.GOOGLE_SHEET_ID || "",
  deliverySheetName: process.env.DELIVERY_SHEET_NAME || "Sheet1",
  deliveryColPhone: process.env.DELIVERY_COL_PHONE || "A",
  deliveryColLink: process.env.DELIVERY_COL_LINK || "B",
  deliveryColStatus: process.env.DELIVERY_COL_STATUS || "C",
  tradesSheetName: process.env.TRADES_SHEET_NAME || "Trades",
  syncTradesToSheets: process.env.SYNC_TRADES_TO_SHEETS === "true",

  // AI
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  openclawBaseUrl: process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1",
  openclawApiKey: process.env.OPENCLAW_API_KEY || "",
  aiModel: process.env.AI_MODEL || "claude-sonnet-4-20250514",

  // Polling
  deliveryPollInterval: parseInt(process.env.DELIVERY_POLL_INTERVAL || "5"),
};

// LID → phone mapping cache (populated from group messages)
export const lidPhoneMap = new Map<string, string>();

export function registerLid(lid: string, phone: string) {
  if (lid && phone) {
    lidPhoneMap.set(lid, phone);
  }
}

/**
 * Check if a sender is allowlisted.
 * Checks: DB admins table → .env ALLOWLIST → LID map
 */
export function isAllowlisted(phone: string): boolean {
  // Lazy import to avoid circular dependency
  const { isAdminLid } = require("./db");

  const digits = phone.replace(/\D/g, "");

  // 1. Check DB admins table (auto-registered users)
  if (isAdminLid(digits)) return true;

  // 2. Check LID map
  const resolvedPhone = lidPhoneMap.get(phone);
  if (resolvedPhone) {
    const resolvedDigits = resolvedPhone.replace(/\D/g, "");
    if (isAdminLid(resolvedDigits)) return true;
    if (config.allowlist.some(a => resolvedDigits.endsWith(a) || a.endsWith(resolvedDigits))) {
      return true;
    }
  }

  // 3. Check .env allowlist (fallback/seed)
  return config.allowlist.some((allowed) => {
    if (digits === allowed) return true;
    if (digits.endsWith(allowed) || allowed.endsWith(digits)) return true;
    const last10digits = digits.slice(-10);
    const last10allowed = allowed.slice(-10);
    if (last10digits === last10allowed && last10digits.length === 10) return true;
    return false;
  });
}
