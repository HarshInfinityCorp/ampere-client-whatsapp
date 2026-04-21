import * as dotenv from "dotenv";
dotenv.config();

export const config = {
  // WhatsApp
  waPairingPhone: process.env.WA_PAIRING_PHONE || "",
  registerSecret: (process.env.REGISTER_SECRET || "admin123").toLowerCase(),

  // Firebase
  neonDatabaseUrl: process.env.NEON_DATABASE_URL || "",

  // AI
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  openclawBaseUrl: process.env.OPENCLAW_BASE_URL || "http://127.0.0.1:18789/v1",
  openclawApiKey: process.env.OPENCLAW_API_KEY || "",
  aiModel: process.env.AI_MODEL || "claude-sonnet-4-20250514",

  // Delivery
  deliveryPollInterval: parseInt(process.env.DELIVERY_POLL_INTERVAL || "5"),
};
