# 🎫 WhatsApp Ticket Trading Bot

A WhatsApp bot that silently monitors groups for ticket buy/sell listings, saves them to Firebase Firestore, and lets you query the data via natural language DMs.

---

## ✨ Features

- **Silent group listener** — Monitors WhatsApp groups, never sends messages to groups
- **Smart ticket parser** — Extracts event, area, price, currency, row, seat notes
- **Quantity expansion** — `2-2-2 dug out £375pp` → 3 separate pair records in DB
- **Conversational Memory** — Follow-up queries work exactly like ChatGPT (remembers context for 15 mins)
- **AI-powered queries** — DM the bot: "find Liverpool tickets", "which of those are cheapest?"
- **Seller contact info** — Returns seller's real phone number with every query
- **Firebase Firestore** — Cloud database, no data limits, full scanning, queryable from anywhere
- **Auto-registration** — Admins register via DM, no config file editing needed
- **LID resolution** — Resolves WhatsApp privacy IDs to real phone numbers
- **Ampere.sh Ready** — Engineered as a modular, stateless agent ready for cloud deployment

---

## 📋 Supported Message Formats

```
Available                          Wanted
Liverpool v Brentford              United Vs Liverpool
4 x kop £500pp                    2x Longside Upper
2-2-2 dug out £375pp              (No Upper Quadrants)
Dm                                DM
```

```
available                          Liverpool Legends v BvB
Slovakia - Kosovo                  4 x AU2 row 21 £60 each
block 201 / 40 €                   4 x CE5 row 6 £70 each
block 208 / 70 €                   Available
ready to send, DM
```

**Supported price formats:** `£500pp`, `£1250 each`, `€40`, `/ 40 €`, `$800`
**Supported type keywords:** `Available`, `Wanted`, `WTS`, `WTB`, `For Sale`

---

## 🗄️ Data Schema (Firebase Firestore)

Each ticket record in the `tickets` collection:

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
  "message_id": "BAE5Fxxx",
  "created_at": "2026-03-30T09:00:00Z"
}
```

### Quantity Expansion

| Raw Line | Records Saved | ticket_type | quantity_value |
|----------|--------------|-------------|----------------|
| `2-2-2 dug out £375pp` | 3 | pair | 2 |
| `4-4 £475pp` | 2 | quad | 4 |
| `5 pair long upper £325pp` | 5 | pair | 2 |
| `4 x kop £500pp` | 1 | quad | 4 |
| `2+2 block 95 £1250 each` | 2 | pair | 2 |
| `block 201 / 40 €` | 1 | null | null |

---

## 🚀 Quick Start

### Prerequisites
- Node.js v18+
- A WhatsApp number for the bot
- Firebase project with Firestore enabled
- AI key (Gemini free or OpenClaw)

### Setup

```bash
git clone https://github.com/harshilLakhani22/ampere-client-whatsapp.git
cd ampere-client-whatsapp
npm install
cp .env.example .env
# Edit .env with your values
npm run dev
```

**See [SETUP-GUIDE.md](./SETUP-GUIDE.md) for complete step-by-step instructions.**

---

## 📱 Query Commands (DM the bot)

First register: DM `register your_secret`

| Query | What it does |
|-------|-------------|
| `show available` | List all available tickets with phone numbers |
| `show wanted` | List all wanted tickets |
| `find Liverpool` | Search tickets by event name |
| `who is selling Arsenal?` | Find sellers with contact info |
| `how many tickets today?` | Today's stats |
| `find kop tickets` | Search by area/section |

---

## 📂 Project Structure

```
├── src/
│   ├── config/
│   │   └── index.ts            ← Environment config
│   ├── handlers/
│   │   ├── message.handler.ts  ← DM and group routing
│   │   ├── parser.handler.ts   ← Ticket parser + quantity expansion
│   │   └── query.handler.ts    ← AI query orchestrator
│   ├── services/
│   │   ├── ai.service.ts       ← LLM Intent Extractor (OpenClaw/Gemini)
│   │   ├── firebase.service.ts ← Firestore full-DB CRUD operations
│   │   └── whatsapp.service.ts ← Baileys connection manager
│   ├── types/
│   │   └── index.ts            ← TypeScript interfaces
│   ├── utils/
│   │   ├── fallback.util.ts    ← Hardcoded query fallback when AI is down
│   │   └── memory.util.ts      ← Conversational memory caching
│   └── index.ts                ← App initialization
├── data/
│   └── .wa-auth/               ← WhatsApp auth (auto-created)
├── .env                        ← Your config (never commit!)
├── .env.example                ← Config template
├── SETUP-GUIDE.md              ← Full setup instructions
├── TEST-MESSAGES.md            ← Test cases
└── README.md
```

---

## ⚙️ Environment Variables

```env
WA_PAIRING_PHONE=+911234567890
REGISTER_SECRET=your_secret
FIREBASE_SERVICE_ACCOUNT_FILE=./firebase-service-account.json
FIREBASE_PROJECT_ID=your-project-id
GEMINI_API_KEY=your_gemini_key   # or use OpenClaw below
# OPENCLAW_BASE_URL=http://127.0.0.1:18789/v1
# OPENCLAW_API_KEY=your_key
```

---

## ⚠️ Important Notes

- Bot **never sends** to groups (listen only)
- Use an **old WhatsApp number** (not a fresh SIM)
- Add groups **gradually** (5-10/day) to avoid detection
- Firebase free tier: 50K reads + 20K writes/day (plenty for this use case)

---

## 🔧 Troubleshooting

| Problem | Solution |
|---------|----------|
| `401` on startup | `rm -rf data/.wa-auth` then restart |
| `515` on startup | Normal, bot auto-reconnects |
| Bot not receiving messages | Check bot number is in the group |
| LID instead of phone | Normal for DMs; groups resolve automatically |
| Firebase permission error | Check service account has Firestore access |

---

*Last updated: March 2026*
