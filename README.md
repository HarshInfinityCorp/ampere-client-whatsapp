# 🎫 WhatsApp Ticket Trading Bot

A WhatsApp bot that silently monitors groups for ticket buy/sell listings, saves them to a database, and lets you query the data via DM.

---

## ✨ Features

- **Silent group listener** — Monitors 30-40+ WhatsApp groups, never sends messages to groups
- **Smart ticket parser** — Extracts event names, blocks/sections, prices from various message formats
- **Multi-block parsing** — One message with 6 ticket blocks = 6 separate records
- **Deduplication** — Prevents duplicate entries within 24 hours
- **AI-powered queries** — DM the bot in natural language: "find Liverpool tickets", "who's selling Arsenal?"
- **Seller contact info** — Returns the seller's real phone number with every query
- **Google Sheets backup** — Real-time cloud backup with auto-retry on failure
- **Auto-registration** — New admins register via DM, no config file editing needed
- **Delivery system** — Send links to phone numbers via WhatsApp from a Google Sheet

---

## 📋 Supported Message Formats

The parser handles these ticket listing formats:

```
Available                          Wanted
Liverpool end @ Everton            United Vs Liverpool
2-2-2 £425pp                      2x Longside Upper
4-4 £475pp                        (No Upper Quadrants)
Dm                                DM
```

```
available                          Liverpool Legends v BvB Dortmund
Slovakia - Kosovo                  4 x AU2 row 21 £60 each
block 201 / 40 €                   4 x CE5 row 6 £70 each
block 208 / 70 €                   Available
ready to send, DM
```

```
Available
Arsenal v Burnley
2+2 block 95 £1250 each
Dm
```

**Supported price formats:** `£500pp`, `£1250 each`, `€40`, `/ 40 €`, `$800`
**Supported keywords:** `Available`, `Wanted`, `WTS`, `WTB`, `For Sale`, `Looking for`

---

## 🚀 Setup Guide

### Prerequisites

- **Node.js** v18+ ([download](https://nodejs.org))
- **A WhatsApp number** for the bot (use an old number, NOT a fresh SIM)
- **A Google Cloud project** with Sheets API enabled (for backup)

---

### Step 1: Clone the Repository

```bash
git clone https://github.com/harshil-l/ampere-client-whatsapp.git
cd ampere-client-whatsapp
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Set Up Google Sheets (for backup)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or use existing)
3. Enable **Google Sheets API**:
   - Go to APIs & Services → Library
   - Search "Google Sheets API" → Enable
4. Create a **Service Account**:
   - Go to APIs & Services → Credentials
   - Click "Create Credentials" → "Service Account"
   - Give it a name (e.g., "whatsapp-bot-sa")
   - Click Done
5. Create a **JSON key**:
   - Click on the service account you created
   - Go to "Keys" tab → "Add Key" → "Create new key" → JSON
   - Download the JSON file
   - Move it to the project folder and rename it to `service-account.json`
6. Create a **Google Sheet**:
   - Go to [Google Sheets](https://sheets.google.com) → Create new spreadsheet
   - Copy the Sheet ID from the URL:
     ```
     https://docs.google.com/spreadsheets/d/SHEET_ID_IS_HERE/edit
     ```
7. **Share the sheet** with the service account:
   - Click "Share" in the sheet
   - Paste the service account email (from the JSON file, looks like: `xxx@xxx.iam.gserviceaccount.com`)
   - Give **Editor** access

### Step 4: Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your details:

```env
# Your bot's WhatsApp number
WA_PAIRING_PHONE=+911234567890

# Secret password for admin registration (CHANGE THIS!)
REGISTER_SECRET=your_secret_password

# Google Sheet ID (from Step 3)
GOOGLE_SHEET_ID=your_sheet_id_here

# Service account file (from Step 3)
GOOGLE_SERVICE_ACCOUNT_FILE=./service-account.json

# Enable trades backup to Google Sheets
SYNC_TRADES_TO_SHEETS=true
```

**For AI queries, choose one:**

**Option A: OpenClaw** (if you have OpenClaw running):
```env
OPENCLAW_BASE_URL=http://127.0.0.1:18789/v1
OPENCLAW_API_KEY=your_key
AI_MODEL=claude-sonnet-4-20250514
```

**Option B: Gemini** (free, just needs API key):
```env
GEMINI_API_KEY=your_gemini_api_key
```
Get a free Gemini API key at: [aistudio.google.com](https://aistudio.google.com/apikey)

### Step 5: Start the Bot

```bash
npm run dev
```

You'll see:
```
===========================================
  WhatsApp Trade Bot — Starting...
===========================================
[WA] Requesting pairing code for 1234567890...

[WA] ✅ PAIRING CODE: 4829-1753

Enter this code in WhatsApp → Linked Devices → Link a Device → Link with phone number
```

### Step 6: Pair WhatsApp

On the **bot's phone** (the number you set in `WA_PAIRING_PHONE`):

1. Open **WhatsApp** → **Settings** → **Linked Devices**
2. Tap **"Link a Device"**
3. Tap **"Link with phone number instead"** (at the bottom)
4. Enter the **pairing code** from the terminal

Wait for:
```
[WA] ✅ WhatsApp connected!
[WA] ✅ LID cache built: 150 mappings from 40 groups
[Sheets] ✅ Connected to Google Sheets
```

### Step 7: Register as Admin

From **any other phone**, send a DM to the bot's WhatsApp number:

```
register your_secret_password
```

Bot replies:
```
✅ You're registered!
You can now query me directly.

Try:
• "show available"
• "find Liverpool"
• "how many today?"
```

**Done! You're set up.** ✅

---

## 📱 How to Use

### For Group Monitoring
Just add the bot's WhatsApp number to your groups. It will silently monitor and parse ticket messages. **It never sends messages in groups.**

### Query Commands (DM the bot)
Ask anything in natural language:

| Query | What it does |
|-------|-------------|
| `show available` | List all available tickets |
| `show wanted` | List all wanted tickets |
| `find Liverpool` | Search tickets by event name |
| `who is selling Arsenal tickets?` | Find sellers with phone numbers |
| `how many today?` | Today's stats |
| `show all from last week` | Historical data |
| `send pending deliveries` | Process delivery queue from Google Sheet |

### For Delivery (Sending Links)
1. Open your Google Sheet → **Sheet1** tab
2. Add rows: Column A = Phone number, Column B = Link
3. DM the bot: `send pending deliveries`
4. Bot sends each link and marks as "delivered" in Column C

---

## 📂 Project Structure

```
├── src/
│   ├── index.ts        ← Entry point, starts everything
│   ├── whatsapp.ts     ← WhatsApp connection, message handling
│   ├── parser.ts       ← Ticket message parser
│   ├── db.ts           ← SQLite database (trades, admins, deliveries)
│   ├── sheets.ts       ← Google Sheets read/write/backup
│   ├── query.ts        ← AI-powered query handler
│   ├── delivery.ts     ← Delivery processor
│   └── config.ts       ← Environment config
├── data/
│   ├── bot.db          ← SQLite database (auto-created)
│   └── .wa-auth/       ← WhatsApp auth keys (auto-created)
├── .env                ← Your configuration
├── .env.example        ← Example configuration
├── package.json
└── README.md
```

---

## 🗄️ Data Storage

| Storage | Purpose | Persistence |
|---------|---------|-------------|
| **SQLite** (`data/bot.db`) | Primary database — all trades, admins | Permanent (survives restarts) |
| **Google Sheets** ("Trades" tab) | Cloud backup — viewable in browser | Permanent (cloud) |

- All queries read from **SQLite** (fast, local)
- Google Sheets is a **real-time backup** (auto-retry on failure)
- Data is **never lost** on app restart — SQLite writes to disk immediately

---

## ⚠️ Important Notes

### WhatsApp Ban Prevention
- ✅ Bot **never sends** to groups (listen only)
- ✅ Only replies to **registered admins** via DM
- ✅ No bulk messaging, no spam behavior
- ⚠️ Use an **old WhatsApp number** (not a fresh SIM)
- ⚠️ Add groups **gradually** (5-10 per day, not all 40 at once)

### LID (Linked ID) Note
WhatsApp uses "Linked IDs" to hide real phone numbers in some cases:
- **Group messages**: Bot resolves LID → real phone number automatically (via group participant metadata)
- **DMs**: LID cannot be resolved. Admins register via the `register` command.

### Fresh Start
To reset everything:
```bash
rm -rf data/bot.db data/.wa-auth    # Delete database + WhatsApp session
```
Then restart the bot and re-pair.

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| `PAIRING CODE` not appearing | Wait 3-5 seconds after startup |
| Bot not receiving messages | Verify bot's number is in the group |
| `Unable to parse range: Trades!A:L` | Bot auto-creates the tab on restart |
| LID instead of phone number | Normal for DMs; group messages resolve automatically |
| `405` pairing error | Too many pairing attempts. Wait 4-24 hours |
| Google Sheets sync failing | Check service account has Editor access to the sheet |

---

## 📄 License

MIT
