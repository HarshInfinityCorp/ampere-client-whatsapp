# 🎫 WhatsApp Ticket Trading Bot — Complete Setup Guide

This guide walks you through setting up the bot from scratch on a fresh machine.

---

## 📋 Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Install Node.js](#2-install-nodejs)
3. [Download the Project](#3-download-the-project)
4. [Create Firebase Project](#4-create-firebase-project)
5. [Set Up Firestore Database](#5-set-up-firestore-database)
6. [Download Firebase Service Account Key](#6-download-firebase-service-account-key)
7. [Set Up AI](#7-set-up-ai-choose-one)
8. [Configure the Bot](#8-configure-the-bot)
9. [Start the Bot](#9-start-the-bot)
10. [Pair WhatsApp](#10-pair-whatsapp)
11. [Register as Admin](#11-register-as-admin)
12. [Add Bot to Groups](#12-add-bot-to-groups)
13. [Test Everything](#13-test-everything)
14. [Daily Usage](#14-daily-usage)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Prerequisites

You need:
- A **computer** (Mac, Windows, or Linux) that stays ON while the bot runs
- A **WhatsApp number** for the bot (use an OLD number, NOT a new SIM)
- A **Google account** (for Firebase)
- An **AI API key** (Gemini is free)
- **Internet connection**

⚠️ **Important:** The bot's WhatsApp number should be an existing number with history, not freshly activated.

---

## 2. Install Node.js

### Mac
```bash
brew install node
# Or download from: https://nodejs.org (LTS version)
```

### Windows
Download from: https://nodejs.org (LTS version) and run the installer.

### Linux
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### Verify
```bash
node --version    # Should show v18+
npm --version
```

---

## 3. Download the Project

```bash
git clone https://github.com/harshilLakhani22/ampere-client-whatsapp.git
cd ampere-client-whatsapp
npm install
```

---

## 4. Create Firebase Project

1. Go to: **https://console.firebase.google.com**
2. Click **"Create a project"**
3. Enter a project name (e.g., `ticket-bot`)
4. **Disable Google Analytics** → Click **"Create project"**
5. Wait ~30 seconds → Click **"Continue"**

---

## 5. Set Up Firestore Database

1. In the left sidebar → Click **"Firestore Database"**
2. Click **"Create database"**
3. Select **"Start in production mode"** → Click **"Next"**
4. Choose location: **`eur3 (Europe)`** or `nam5 (US)` → Click **"Enable"**
5. Wait for it to provision (~20 seconds)

---

## 6. Download Firebase Service Account Key

1. Click the **gear icon ⚙️** (top left) → **"Project settings"**
2. Go to **"Service accounts"** tab
3. Click **"Generate new private key"** → **"Generate key"**
4. A JSON file downloads automatically

5. Move it to the project folder:
```bash
# Mac/Linux
mv ~/Downloads/ticket-bot-*.json ./firebase-service-account.json

# Windows
Move-Item ~\Downloads\ticket-bot-*.json .\firebase-service-account.json
```

6. Note your **Project ID** from the Project Settings page (e.g., `ticket-bot-ab6bb`)

---

## 7. Set Up AI (Choose One)

### Option A: Gemini (Recommended — Free)
1. Go to: https://aistudio.google.com/apikey
2. Sign in → Click **"Create API key"**
3. Copy the key (starts with `AIza...`)

### Option B: OpenClaw
Use your existing OpenClaw base URL and API key.

---

## 8. Configure the Bot

```bash
cp .env.example .env
```

Edit `.env`:

```env
# WhatsApp
WA_PAIRING_PHONE=+911234567890      ← your bot's number

# Registration secret (admins DM this to register)
REGISTER_SECRET=changeme123          ← CHANGE THIS!

# Firebase
FIREBASE_SERVICE_ACCOUNT_FILE=./firebase-service-account.json
FIREBASE_PROJECT_ID=ticket-bot-ab6bb ← your project ID

# AI — Option A: Gemini (recommended)
GEMINI_API_KEY=AIza...

# AI — Option B: OpenClaw
# OPENCLAW_BASE_URL=http://127.0.0.1:18789/v1
# OPENCLAW_API_KEY=your_key
```

### Checklist:
- [ ] `WA_PAIRING_PHONE` set with country code
- [ ] `REGISTER_SECRET` changed from default
- [ ] `FIREBASE_SERVICE_ACCOUNT_FILE` = path to your JSON key
- [ ] `FIREBASE_PROJECT_ID` = your project ID
- [ ] AI key set

---

## 9. Start the Bot

```bash
npm run dev
```

You should see:
```
[Firebase] ✅ Connected to project: ticket-bot-xxxxx
[WA] ✅ PAIRING CODE: 4829-1753
```

⚠️ **Keep this terminal open!**

---

## 10. Pair WhatsApp

On the **bot's phone**:

1. Open **WhatsApp** → **Settings** → **Linked Devices**
2. Tap **"Link a Device"**
3. Tap **"Link with phone number instead"** (small text at bottom)
4. Enter the **pairing code** from the terminal

Wait for:
```
[WA] ✅ WhatsApp connected!
[WA] ✅ LID cache built: X mappings from Y groups
```

### ⚠️ Common Pairing Errors
| Error | Fix |
|-------|-----|
| `401` | `rm -rf data/.wa-auth` then restart |
| `515` | Normal — bot auto-reconnects |
| `405` | Too many attempts, wait 4-24 hours |

---

## 11. Register as Admin

From **any phone** (not the bot's phone), DM the bot's number:

```
register changeme123
```
(Use the secret you set in `.env`)

Bot replies:
```
✅ You're registered!
You can now query me.
```

No restart needed. Works instantly.

---

## 12. Add Bot to Groups

Add the bot's number to your ticket trading groups:
1. Open the WhatsApp group → Tap group name → **"Add participants"**
2. Add the bot's number

⚠️ **Add gradually:** 5-10 groups/day (not all at once — spam risk)

The bot will:
- ✅ Listen silently to all ticket messages
- ✅ Save each ticket to Firebase automatically
- ❌ Never send messages in groups

---

## 13. Test Everything

Post this in a group the bot is in:
```
Available

Liverpool v Arsenal

4 x kop £500pp
2-2-2 dug out £375pp

Dm
```

Check **Firebase Console → Firestore → tickets** — you should see 4 records:
- 1 quad (kop)
- 3 pairs (dug out from 2-2-2 expansion)

Then DM the bot:
```
find Liverpool
```

Should return the tickets with seller phone number.

**See [TEST-MESSAGES.md](./TEST-MESSAGES.md) for the full test suite.**

---

## 14. Daily Usage

### Query Commands (DM the bot)

| Command | What it does |
|---------|-------------|
| `show available` | List available tickets with phone numbers |
| `show wanted` | List wanted tickets |
| `find Liverpool` | Search by event name |
| `who is selling Arsenal?` | Find sellers + contact info |
| `how many today?` | Today's stats |
| `find kop tickets` | Search by area/section |

### Stopping the Bot
Press `Ctrl+C` in the terminal.

### Restarting
```bash
npm run dev
```
No re-pairing needed — session is saved in `data/.wa-auth/`.

### Full Reset
```bash
rm -rf data/.wa-auth   # re-pair WhatsApp
# Also delete Firebase collections manually if needed
npm run dev
```

---

## 15. Troubleshooting

| Problem | Solution |
|---------|----------|
| `401` on startup | `rm -rf data/.wa-auth` then restart |
| `515` on startup | Normal, bot auto-reconnects in 5s |
| Bot not receiving group messages | Verify bot's number is in the group |
| LID instead of phone number | Normal for DMs; group messages resolve automatically |
| Firebase permission error | Check service account JSON is correct and has Firestore access |
| `register` not working | Type exactly: `register YOUR_SECRET` (case sensitive) |
| AI queries failing | Check Gemini/OpenClaw API key in `.env` |

---

## 📁 File Reference

```
ampere-client-whatsapp/
├── src/
│   ├── index.ts              ← Entry point
│   ├── whatsapp.ts           ← WhatsApp connection
│   ├── parser.ts             ← Ticket parser + quantity expansion
│   ├── firebase.ts           ← Firestore CRUD
│   ├── query.ts              ← AI query handler
│   └── config.ts             ← Config
├── data/                     ← Auto-created (auth + cache)
├── .env                      ← Your config (NEVER share!)
├── firebase-service-account.json ← Firebase key (NEVER share!)
├── .env.example              ← Config template
├── SETUP-GUIDE.md            ← This file
├── TEST-MESSAGES.md          ← Test cases
└── README.md                 ← Overview
```

### ⚠️ Files to NEVER Share / Commit
- `.env`
- `firebase-service-account.json`
- `data/.wa-auth/`

---

*Last updated: March 2026*
