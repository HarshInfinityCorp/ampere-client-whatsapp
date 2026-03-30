# 🎫 WhatsApp Ticket Trading Bot — Complete Setup Guide

This guide walks you through setting up the bot from scratch on a fresh machine.

---

## 📋 Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Node.js](#2-install-nodejs)
3. [Download the Project](#3-download-the-project)
4. [Create Google Cloud Project](#4-create-google-cloud-project)
5. [Enable Google Sheets API](#5-enable-google-sheets-api)
6. [Create Service Account](#6-create-service-account)
7. [Create Google Sheet](#7-create-google-sheet)
8. [Set Up AI (Choose One)](#8-set-up-ai-choose-one)
9. [Configure the Bot](#9-configure-the-bot)
10. [Start the Bot](#10-start-the-bot)
11. [Pair WhatsApp](#11-pair-whatsapp)
12. [Register as Admin](#12-register-as-admin)
13. [Add Bot to Groups](#13-add-bot-to-groups)
14. [Test Everything](#14-test-everything)
15. [Daily Usage](#15-daily-usage)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Prerequisites

You need:
- A **computer** (Mac, Windows, or Linux) that stays ON while the bot runs
- A **WhatsApp number** for the bot (use an OLD number, NOT a new SIM)
- A **Google account** (for Google Sheets backup)
- An **AI API key** (Gemini is free, or use OpenClaw)
- **Internet connection**

⚠️ **Important:** The bot's WhatsApp number should be:
- An **existing number** with history (not freshly activated)
- A number you can keep as a **linked device** (it stays on your phone too)
- NOT your primary personal number (use a secondary/spare number)

---

## 2. Install Node.js

### Mac
```bash
# Using Homebrew
brew install node

# Or download from: https://nodejs.org (LTS version)
```

### Windows
Download from: https://nodejs.org (LTS version)
Run the installer, click Next through all steps.

### Linux
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Verify Installation
```bash
node --version    # Should show v18+ 
npm --version     # Should show 9+
```

---

## 3. Download the Project

```bash
# Clone the repository
git clone https://github.com/harshil-l/ampere-client-whatsapp.git

# Enter the project folder
cd ampere-client-whatsapp

# Install dependencies
npm install
```

You should see packages installing. Wait for it to finish (1-2 minutes).

---

## 4. Create Google Cloud Project

1. Go to **Google Cloud Console**: https://console.cloud.google.com

2. **Sign in** with your Google account

3. Click the project dropdown at the top → **"New Project"**
   ```
   Project name: whatsapp-ticket-bot
   Organization: (leave default)
   Location: (leave default)
   ```

4. Click **"Create"**

5. Wait 10-15 seconds, then **select the project** from the dropdown

---

## 5. Enable Google Sheets API

1. In Google Cloud Console, go to the hamburger menu (☰) → **"APIs & Services"** → **"Library"**

2. Search for **"Google Sheets API"**

3. Click on it → Click **"Enable"**

4. Wait for it to enable (10-20 seconds)

✅ Google Sheets API is now enabled.

---

## 6. Create Service Account

A service account is like a "robot Google account" that lets your bot read/write Google Sheets.

### Step 6a: Create the Account

1. Go to hamburger menu (☰) → **"APIs & Services"** → **"Credentials"**

2. Click **"+ Create Credentials"** at the top → **"Service Account"**

3. Fill in:
   ```
   Service account name: whatsapp-bot
   Service account ID: (auto-filled)
   Description: WhatsApp ticket bot service account
   ```

4. Click **"Create and Continue"**

5. **Skip** the "Grant access" step → Click **"Continue"**

6. **Skip** the "Grant users access" step → Click **"Done"**

### Step 6b: Create JSON Key

1. You'll see your service account in the list. **Click on it**.

2. Go to the **"Keys"** tab

3. Click **"Add Key"** → **"Create new key"**

4. Select **"JSON"** → Click **"Create"**

5. A `.json` file will download automatically (e.g., `whatsapp-ticket-bot-abc123.json`)

6. **Move this file** to your project folder:
   ```bash
   # Mac/Linux
   mv ~/Downloads/whatsapp-ticket-bot-*.json ./service-account.json

   # Windows (PowerShell)
   Move-Item ~\Downloads\whatsapp-ticket-bot-*.json .\service-account.json
   ```

7. **Note the email** in the JSON file (you'll need it in the next step). It looks like:
   ```
   whatsapp-bot@whatsapp-ticket-bot.iam.gserviceaccount.com
   ```
   You can find it by opening the file:
   ```bash
   # Mac/Linux
   cat service-account.json | grep client_email

   # Or just open the file in any text editor
   ```

✅ Service account created with JSON key.

---

## 7. Create Google Sheet

1. Go to **Google Sheets**: https://sheets.google.com

2. Click **"+ Blank"** to create a new spreadsheet

3. **Name it** something like "Ticket Bot Data"

4. **Copy the Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/THIS_IS_YOUR_SHEET_ID/edit
   ```
   The Sheet ID is the long string between `/d/` and `/edit`

5. **Share the sheet** with your service account:
   - Click the **"Share"** button (top right)
   - Paste the service account email (from Step 6b):
     ```
     whatsapp-bot@whatsapp-ticket-bot.iam.gserviceaccount.com
     ```
   - Set permission to **"Editor"**
   - Uncheck "Notify people"
   - Click **"Share"**

6. The sheet will have **two tabs** (the bot creates them automatically):
   - **Sheet1** → For deliveries (sending links)
   - **Trades** → Auto-created by bot for ticket backup

✅ Google Sheet is ready.

---

## 8. Set Up AI (Choose One)

The bot uses AI to answer natural language queries. Choose ONE option:

### Option A: Gemini (Recommended — Free)

1. Go to: https://aistudio.google.com/apikey
2. Sign in with Google
3. Click **"Create API key"**
4. Copy the API key (starts with `AIza...`)
5. Save it — you'll use it in Step 9

### Option B: OpenClaw (If you have it running)

If you already have OpenClaw set up:
1. Get your API key from OpenClaw config
2. Note the base URL (usually `http://127.0.0.1:18789/v1`)

---

## 9. Configure the Bot

1. **Copy the example config:**
   ```bash
   cp .env.example .env
   ```

2. **Edit `.env`** with your details:

   ```bash
   # Mac/Linux
   nano .env

   # Windows
   notepad .env
   ```

3. **Fill in these values:**

   ```env
   # ── WhatsApp ──
   # Your bot's phone number (with country code, no spaces)
   WA_PAIRING_PHONE=+911234567890

   # ── Registration ──
   # Choose a secret password (clients DM this to register)
   # CHANGE THIS to something unique!
   REGISTER_SECRET=mySecretPass2024

   # ── Google Sheets ──
   # The JSON file you downloaded (should be in project folder)
   GOOGLE_SERVICE_ACCOUNT_FILE=./service-account.json

   # Your Google Sheet ID (from Step 7)
   GOOGLE_SHEET_ID=paste_your_sheet_id_here

   # Enable trades backup to Google Sheets
   SYNC_TRADES_TO_SHEETS=true

   # ── AI ──
   # Option A: Gemini (recommended)
   GEMINI_API_KEY=paste_your_gemini_key_here

   # Option B: OpenClaw (comment out Gemini lines above, uncomment below)
   # OPENCLAW_BASE_URL=http://127.0.0.1:18789/v1
   # OPENCLAW_API_KEY=your_openclaw_key
   # AI_MODEL=claude-sonnet-4-20250514
   ```

4. **Save the file** (Ctrl+X → Y → Enter in nano)

### Quick Checklist:
- [ ] `WA_PAIRING_PHONE` = your bot's number with country code
- [ ] `REGISTER_SECRET` = changed from default
- [ ] `GOOGLE_SERVICE_ACCOUNT_FILE` = path to your JSON key
- [ ] `GOOGLE_SHEET_ID` = your sheet ID
- [ ] `SYNC_TRADES_TO_SHEETS` = true
- [ ] AI key set (Gemini or OpenClaw)

---

## 10. Start the Bot

```bash
npm run dev
```

You should see:
```
===========================================
  WhatsApp Trade Bot — Starting...
===========================================
[Config] Pairing phone: +911234567890
[Config] Google Sheet ID: your_sheet_id
[Config] AI: Gemini
===========================================

[WA] Requesting pairing code for 1234567890...

[WA] ✅ PAIRING CODE: 4829-1753

Enter this code in WhatsApp → Linked Devices → Link a Device → Link with phone number
```

⚠️ **Keep this terminal open!** The bot runs as long as the terminal is open.

---

## 11. Pair WhatsApp

On the **bot's phone** (the number you set in `WA_PAIRING_PHONE`):

1. Open **WhatsApp**
2. Go to **Settings** → **Linked Devices**
3. Tap **"Link a Device"**
4. **Important:** Tap **"Link with phone number instead"** (small text at the bottom)
5. Enter your **computer's phone number** (any number) when asked
6. Enter the **pairing code** from the terminal (e.g., `4829-1753`)

Wait 5-10 seconds. The terminal should show:
```
[WA] ✅ WhatsApp connected!
[WA] Building LID→phone cache from group participants...
[WA] ✅ LID cache built: X mappings from Y groups
[Sheets] ✅ Connected to Google Sheets
```

✅ Bot is connected!

### ⚠️ Pairing Troubleshooting
- **"Link with phone number" not showing?** → Update WhatsApp to latest version
- **Code expired?** → Restart the bot (`Ctrl+C` then `npm run dev`)
- **405 error?** → Too many attempts. Wait 4-24 hours before trying again
- **Bot disconnects after pairing?** → Normal, it will auto-reconnect

---

## 12. Register as Admin

From a **different phone** (NOT the bot's phone), send a DM to the bot's WhatsApp number:

```
register mySecretPass2024
```
(Use the secret you set in `.env`)

The bot should reply:
```
✅ You're registered!
You can now query me directly.

Try:
• "show available"
• "find Liverpool"
• "how many today?"
```

✅ You can now query the bot!

### Register More Admins
Share the secret with other people who should have access. They just DM:
```
register mySecretPass2024
```
No restart needed. Works instantly.

---

## 13. Add Bot to Groups

Add the bot's WhatsApp number to your ticket trading groups:

1. Open the WhatsApp group
2. Tap group name → **"Add participants"**
3. Add the **bot's number**

### ⚠️ Important — Add Groups Gradually!
- **Day 1:** Add to 5-10 groups
- **Day 2:** Add 5-10 more
- **Day 3:** Add 5-10 more
- Continue until all groups added

**Why?** Adding to 40 groups at once on a new linked device may trigger WhatsApp's spam detection.

The bot will:
- ✅ **Silently listen** to all messages
- ✅ **Parse ticket listings** (Available/Wanted)
- ✅ **Save to database** with seller's phone number
- ❌ **Never send messages** in groups

---

## 14. Test Everything

### Test 1: Group Parsing
Post this in any group the bot is in:
```
Available

Liverpool v Brentford

4 x kop £500pp
5 pair long upper £325pp

Dm
```

**Check terminal** — you should see:
```
[WA] 📦 Saved 2 trade(s) from "GroupName" by YourName (0 duplicates skipped)
```

### Test 2: Query the Bot
DM the bot from your registered number:
```
show available
```

Bot should reply with the tickets you just posted, including phone numbers.

### Test 3: Check Google Sheets
Open your Google Sheet → **"Trades"** tab (auto-created)
You should see the parsed trades with all details.

### Test 4: Search
DM the bot:
```
find Liverpool
```
Should return the Liverpool tickets with seller contact info.

---

## 15. Daily Usage

### Query Commands (DM the bot)

| Command | What it does |
|---------|-------------|
| `show available` | List all available tickets |
| `show wanted` | List all wanted tickets |
| `find Liverpool` | Search by event name |
| `who is selling Arsenal?` | Find sellers with phone numbers |
| `how many today?` | Today's stats |
| `show all from last week` | Historical data |
| `send pending deliveries` | Send links from Google Sheet |

### Delivery System (Sending Links)
1. Open Google Sheet → **Sheet1** tab
2. Column A = Phone number (with country code)
3. Column B = Link to send
4. DM bot: `send pending deliveries`
5. Bot sends each link and marks Column C as "delivered"

### Stopping the Bot
Press `Ctrl+C` in the terminal.

### Restarting the Bot
```bash
cd ampere-client-whatsapp
npm run dev
```
No need to re-pair — it remembers the WhatsApp session.

### Resetting Everything (Fresh Start)
```bash
# Delete database + WhatsApp session
rm -rf data/bot.db data/.wa-auth

# Also clean Google Sheet "Trades" tab manually

# Restart
npm run dev
# You'll need to re-pair WhatsApp
```

---

## 16. Troubleshooting

| Problem | Solution |
|---------|----------|
| **Bot not receiving group messages** | Verify bot's number is in the group. Send a NEW message (old messages aren't captured) |
| **"Unable to parse range: Trades!A:L"** | The "Trades" tab doesn't exist yet. Restart the bot — it auto-creates the tab |
| **Pairing code not appearing** | Wait 3-5 seconds. If nothing, restart the bot |
| **405 pairing error** | Too many pairing attempts. Wait 4-24 hours |
| **LID instead of phone number** | Normal for DMs. Group messages resolve automatically via participant metadata |
| **Google Sheets sync failing** | Check: (1) Service account has Editor access, (2) Sheet ID is correct, (3) API is enabled |
| **"ALLOWLIST is empty" warning** | Normal! Admins register via DM. The warning is just informational |
| **Bot disconnects randomly** | It auto-reconnects. If it doesn't, restart with `npm run dev` |
| **Duplicate entries in Google Sheets** | This was fixed. Make sure you're running the latest code (`git pull`) |
| **AI queries not working** | Check your Gemini/OpenClaw API key in `.env` |
| **"register" command not working** | Make sure you're typing exactly: `register YOUR_SECRET` (case sensitive) |

### Getting Help
- GitHub Issues: https://github.com/harshil-l/ampere-client-whatsapp/issues
- Check logs in terminal for error messages

---

## 📁 File Reference

```
ampere-client-whatsapp/
├── src/                    ← Source code (don't edit unless you know what you're doing)
│   ├── index.ts            ← Entry point
│   ├── whatsapp.ts         ← WhatsApp connection
│   ├── parser.ts           ← Ticket message parser
│   ├── db.ts               ← Database
│   ├── sheets.ts           ← Google Sheets
│   ├── query.ts            ← AI queries
│   ├── delivery.ts         ← Delivery system
│   └── config.ts           ← Configuration
├── data/                   ← Auto-created, contains database + WhatsApp auth
├── .env                    ← Your configuration (NEVER share this!)
├── .env.example            ← Example configuration
├── service-account.json    ← Google service account key (NEVER share this!)
├── package.json            ← Dependencies
└── README.md               ← Quick reference
```

### ⚠️ Files to NEVER Share
- `.env` — contains your API keys and secrets
- `service-account.json` — Google Cloud credentials
- `data/.wa-auth/` — WhatsApp session keys
- `data/bot.db` — your trade database

---

*Last updated: March 2026*
