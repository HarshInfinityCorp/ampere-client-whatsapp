# 🔥 Implementation Plan — Firebase Migration + New Schema

**File:** `/Users/mac/Desktop/cutsom-bot-whatsapp/IMPLEMENTATION-PLAN.md`
**Created:** 2026-03-30
**Status:** Pending

---

## 📋 Overview

Migrate the WhatsApp Ticket Trading Bot from SQLite + Google Sheets to **Firebase Firestore** as the single database, and rewrite the parser to match the client's exact schema with quantity expansion.

---

## 🏗️ Architecture Change

### Before (Current)
```
WhatsApp Group Message
    ↓
Parser (basic extraction)
    ↓
SQLite (primary DB) ──→ Google Sheets (backup, cron retry)
    ↓
AI Query (reads SQLite)
```

### After (New)
```
WhatsApp Group Message
    ↓
Parser (detailed extraction + quantity expansion)
    ↓
Firebase Firestore (single source of truth)
    ↓
AI Query (reads Firebase)
```

### What Gets Removed
- `better-sqlite3` dependency
- `googleapis` dependency (no more Google Sheets)
- `node-cron` dependency (no more sync retry)
- `src/sheets.ts` — deleted
- `src/delivery.ts` — deleted (or rewritten for Firebase)
- SQLite schema, sync logic, cron jobs
- Google Sheets backup, header creation, append logic

### What Gets Added
- `firebase-admin` dependency
- `src/firebase.ts` — Firebase connection + read/write helpers
- Rewritten `src/parser.ts` — new schema with quantity expansion
- Rewritten `src/db.ts` — Firebase queries instead of SQLite
- Updated `src/query.ts` — reads from Firebase

---

## 📦 New Schema (Client's Requirement)

### Firestore Collection: `tickets`

Each document represents **one ticket unit** (pair or quad):

```json
{
  "event": "Liverpool v Brentford",
  "ticket_type": "pair",
  "quantity_value": 2,
  "price": 375,
  "price_type": "per_ticket",
  "currency": "GBP",
  "area_text": "dug out",
  "row": null,
  "seat_note": null,
  "availability_status": "available",
  "raw_line_text": "2-2-2 dug out £375pp",
  "sender_name": "Harsh😊",
  "sender_phone": "919879838537",
  "group_name": "Wgroup1",
  "group_jid": "120363xxx@g.us",
  "message_id": "BAE5F4xxx",
  "created_at": "2026-03-28T12:05:00.000Z"
}
```

### Field Definitions

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `event` | string | Match/event name | "Liverpool v Brentford" |
| `ticket_type` | string \| null | "pair" (2 tickets) or "quad" (4 tickets) or null | "pair" |
| `quantity_value` | number \| null | Number of tickets in this unit | 2 |
| `price` | number \| null | Price as a number (no currency symbol) | 375 |
| `price_type` | string \| null | Always "per_ticket" when price exists | "per_ticket" |
| `currency` | string \| null | "GBP" (£), "EUR" (€), "USD" ($) | "GBP" |
| `area_text` | string \| null | Seating area (without quantity prefix) | "dug out" |
| `row` | string \| null | Row number if specified | "21" |
| `seat_note` | string \| null | Restrictions/notes in parentheses | "No Upper Quadrants" |
| `availability_status` | string | "available" or "wanted" | "available" |
| `raw_line_text` | string | The original line (not whole message) | "2-2-2 dug out £375pp" |
| `sender_name` | string | WhatsApp display name | "Harsh😊" |
| `sender_phone` | string | Sender's real phone number | "919879838537" |
| `group_name` | string | WhatsApp group name | "Wgroup1" |
| `group_jid` | string | WhatsApp group JID | "120363xxx@g.us" |
| `message_id` | string | WhatsApp message ID (for dedup) | "BAE5F4xxx" |
| `created_at` | timestamp | When the ticket was saved | Firestore timestamp |

### Firestore Collection: `admins`

```json
{
  "lid": "75535673725102",
  "name": "Milan",
  "registered_at": "2026-03-28T12:00:00.000Z"
}
```

---

## 🧮 Quantity Expansion Logic

This is the biggest change. The client wants **each pair/quad as a separate document**.

### How It Works

**Input:** `"2-2-2 dug out £375pp"`

**Step 1:** Parse the quantity prefix `2-2-2`
- Split by `-` → `[2, 2, 2]` → 3 groups
- Each group = 2 → ticket_type = "pair"
- Creates **3 separate documents** (one per pair)

**Step 2:** Each document gets:
```json
{ "ticket_type": "pair", "quantity_value": 2 }
```

### Expansion Rules

| Raw Text | Parse | Records | ticket_type | quantity_value |
|----------|-------|---------|-------------|----------------|
| `2-2-2 dug out £375pp` | 3 groups of 2 | **3** | "pair" | 2 |
| `4-4 £475pp` | 2 groups of 4 | **2** | "quad" | 4 |
| `4 x kop £500pp` | 4 tickets | **1** | "quad" | 4 |
| `5 pair long upper £325pp` | 5 pairs | **5** | "pair" | 2 |
| `2+2 block 95 £1250 each` | 2 groups of 2 | **2** | "pair" | 2 |
| `4 dug out £475pp` | 4 tickets | **1** | "quad" | 4 |
| `2x Longside Upper` | 2 tickets | **1** | "pair" | 2 |
| `block 201 / 40 €` | unknown qty | **1** | null | null |

### Parsing Priority
1. **Dash-separated:** `2-2-2` → split by `-`, each number = one group
2. **Plus-separated:** `2+2` → split by `+`, each number = one group
3. **"X pair":** `5 pair` → X groups of 2
4. **"N x item":** `4 x kop` → 1 group of N
5. **Bare number:** `4 dug out` → 1 group of N
6. **No quantity:** `block 201` → null/null

### ticket_type Rules
- quantity_value = 2 → "pair"
- quantity_value = 4 → "quad"
- quantity_value = other or null → null

---

## 🔤 Area Text Extraction

Strip the quantity prefix to get just the area:

| Raw Line | area_text | How |
|----------|-----------|-----|
| `2-2-2 dug out £375pp` | "dug out" | Remove "2-2-2" prefix |
| `4 x kop £500pp` | "kop" | Remove "4 x" prefix |
| `5 pair long upper £325pp` | "long upper" | Remove "5 pair" prefix |
| `2+2 block 95 £1250 each` | "block 95" | Remove "2+2" prefix |
| `block 201 / 40 €` | "block 201" | No quantity prefix |
| `2x Longside Upper` | "Longside Upper" | Remove "2x" prefix |

---

## 💰 Price Extraction

Extract price as number + currency separately:

| Raw | price | currency | price_type |
|-----|-------|----------|------------|
| `£375pp` | 375 | "GBP" | "per_ticket" |
| `£1250 each` | 1250 | "GBP" | "per_ticket" |
| `/ 40 €` | 40 | "EUR" | "per_ticket" |
| `$800` | 800 | "USD" | "per_ticket" |
| (no price) | null | null | null |

### Currency Mapping
- `£` → "GBP"
- `€` → "EUR"
- `$` → "USD"
- `₹` / `rs` → "INR"

---

## 📂 File Changes

### Files to CREATE
| File | Purpose |
|------|---------|
| `src/firebase.ts` | Firebase Admin SDK init + CRUD helpers |

### Files to REWRITE
| File | Changes |
|------|---------|
| `src/parser.ts` | New schema, quantity expansion, area_text extraction, currency separation |
| `src/db.ts` | Replace SQLite with Firebase queries |
| `src/query.ts` | Read from Firebase, fix fallback responses |
| `src/config.ts` | Add Firebase config, remove Google Sheets config |
| `src/index.ts` | Remove cron jobs, remove sheets imports, init Firebase |
| `src/whatsapp.ts` | Update trade saving to use new schema + Firebase |
| `.env.example` | Add Firebase config, remove Google Sheets config |
| `package.json` | Add firebase-admin, remove better-sqlite3, googleapis, node-cron |

### Files to DELETE
| File | Reason |
|------|--------|
| `src/sheets.ts` | No longer using Google Sheets |
| `src/delivery.ts` | Delivery feature removed (or rewritten later if needed) |

---

## ⚙️ New .env Config

```env
# ── WhatsApp ──
WA_PAIRING_PHONE=+911234567890
REGISTER_SECRET=changeme123

# ── Firebase ──
FIREBASE_SERVICE_ACCOUNT_FILE=./firebase-service-account.json
FIREBASE_PROJECT_ID=your-project-id

# ── AI (choose one) ──
GEMINI_API_KEY=your_gemini_key
# OPENCLAW_BASE_URL=http://127.0.0.1:18789/v1
# OPENCLAW_API_KEY=your_key
# AI_MODEL=claude-sonnet-4-20250514
```

**Removed:** `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_FILE`, `SYNC_TRADES_TO_SHEETS`, `DELIVERY_*`, `ALLOWLIST`

---

## 🔥 Firebase Setup Steps (for client)

1. Go to https://console.firebase.google.com
2. Create a new project (e.g., "ticket-bot")
3. Go to Project Settings → Service Accounts
4. Click "Generate new private key" → download JSON
5. Move JSON to project folder as `firebase-service-account.json`
6. Copy the Project ID from settings
7. Set both values in `.env`

---

## 🧪 Test Cases

### Parser Test — Quantity Expansion

| Input | Expected Records | Verify |
|-------|-----------------|--------|
| `2-2-2 dug out £375pp` | 3 × pair | ticket_type=pair, quantity_value=2, price=375 |
| `4-4 £475pp` | 2 × quad | ticket_type=quad, quantity_value=4, price=475 |
| `5 pair long upper £325pp` | 5 × pair | ticket_type=pair, area_text="long upper" |
| `4 x kop £500pp` | 1 × quad | ticket_type=quad, area_text="kop" |
| `2+2 block 95 £1250 each` | 2 × pair | area_text="block 95", price=1250 |
| `block 201 / 40 €` | 1 × null | ticket_type=null, currency="EUR" |
| `2x Longside Upper` (no price) | 1 × pair | price=null, currency=null |

### Query Test

| Query | Expected |
|-------|----------|
| "find Liverpool" | All Liverpool tickets from Firebase |
| "show available" | All available tickets |
| "how many today?" | Count of today's tickets |
| "who sells Arsenal tickets?" | Seller name + phone |

### Deduplication Test

| Test | Expected |
|------|----------|
| Same message posted twice in 1 min | Only first batch saved |
| Same message posted after 24h | Both saved (not duplicate) |

---

## 📐 Implementation Order

### Phase 1: Firebase Setup
1. Install `firebase-admin`
2. Create `src/firebase.ts` — init + helpers
3. Update `.env.example` and `config.ts`

### Phase 2: Parser Rewrite
1. Rewrite `src/parser.ts` — new schema + quantity expansion
2. Write test file, verify all 7 test cases pass
3. Delete test file

### Phase 3: Database Migration
1. Rewrite `src/db.ts` — Firebase CRUD (save, query, dedup, admins)
2. Delete SQLite references

### Phase 4: WhatsApp Handler Update
1. Update `src/whatsapp.ts` — use new parser output + Firebase save
2. Remove sheets sync logic

### Phase 5: Query Handler Fix
1. Rewrite `src/query.ts` — read from Firebase, fix fallback
2. Remove static error messages

### Phase 6: Cleanup
1. Delete `src/sheets.ts`, `src/delivery.ts`
2. Update `src/index.ts` — remove cron jobs, init Firebase
3. Update `package.json` — remove old deps, add firebase-admin
4. Update `.gitignore`, `README.md`, `SETUP-GUIDE.md`

### Phase 7: Test
1. Clean start (delete data/)
2. Start bot, pair WhatsApp
3. Post test messages in group
4. Verify Firebase console shows correct data
5. Query via DM — verify responses
6. Push to GitHub

---

## 📊 Estimated Changes

| Metric | Value |
|--------|-------|
| Files created | 1 |
| Files rewritten | 7 |
| Files deleted | 2 |
| Dependencies added | 1 (firebase-admin) |
| Dependencies removed | 3 (better-sqlite3, googleapis, node-cron) |
| Parser complexity | High (quantity expansion logic) |
| Total effort | ~2-3 hours |

---

*This plan will be updated as implementation progresses.*
