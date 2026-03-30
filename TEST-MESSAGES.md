# 🧪 Test Messages & Queries

## BEFORE TESTING
1. Clean Firebase: delete `tickets` + `admins` collections
2. Start bot: `npm run dev`
3. Wait for: `[WA] ✅ LID cache built`

---

## GROUP MESSAGES
Post these one by one in "Wgroup1" from any phone.
Wait 2-3 seconds between each.

---

### MSG 1 — Basic (2 records expected)
```
Available

Arsenal v Burnley

2+2 block 95 £1250 each

Dm
```

---

### MSG 2 — Multiple blocks (8 records expected)
```
Available

Liverpool v Brentford

4 x kop £500pp
2-2-2 dug out £375pp
4-4 £475pp

Dm
```

---

### MSG 3 — Euro slash pricing (2 records expected)
```
available

Slovakia - Kosovo
block 201 / 40 €
block 208 / 70 €

ready to send, DM
```

---

### MSG 4 — Wanted + seat note (1 record expected)
```
Wanted

United Vs Liverpool
2x Longside Upper
(No Upper Quadrants)

DM
```

---

### MSG 5 — Available at END + row number (2 records expected)
```
Liverpool Legends v BvB Dortmund Legends

4 x AU2 row 21 £60 each
4 x CE5 row 6 £70 each
Available
```

---

### MSG 6 — Dash expansion (5 records expected)
```
Available

Liverpool end @ Everton

2-2-2 £425pp
4-4 £475pp

Dm
```

---

### MSG 7 — DUPLICATE of MSG 1 (0 records expected — dedup test)
```
Available

Arsenal v Burnley

2+2 block 95 £1250 each

Dm
```

---

### MSG 8 — Pair expansion (5 records expected)
```
Available

Manchester City v Chelsea

5 pair long upper £325pp

Dm
```

---

## EXPECTED TOTAL: 25 records in Firebase

| MSG | Event | Records |
|-----|-------|---------|
| 1 | Arsenal v Burnley | 2 |
| 2 | Liverpool v Brentford | 8 |
| 3 | Slovakia - Kosovo | 2 |
| 4 | United Vs Liverpool | 1 |
| 5 | Liverpool Legends v BvB | 2 |
| 6 | Liverpool end @ Everton | 5 |
| 7 | Arsenal (DUPLICATE) | 0 |
| 8 | Man City v Chelsea | 5 |
| **TOTAL** | | **25** |

---

## DM QUERIES
Send these to bot number from registered phone.
First register: `register admin123`

---

### Q1 — Registration
```
register admin123
```
✅ Expected: "You're registered!"

---

### Q2 — Find by event
```
find Liverpool
```
✅ Expected: Liverpool tickets with seller name + phone number

---

### Q3 — Show available
```
show available
```
✅ Expected: List of available tickets with phone numbers

---

### Q4 — Show wanted
```
show wanted
```
✅ Expected: United Vs Liverpool listing

---

### Q5 — Stats
```
how many tickets today?
```
✅ Expected: 24 available, 1 wanted, 25 total

---

### Q6 — Seller search
```
who is selling Arsenal tickets?
```
✅ Expected: Seller name + phone number for Arsenal

---

### Q7 — Euro tickets
```
find Slovakia
```
✅ Expected: Slovakia - Kosovo with €40 and €70 prices

---

### Q8 — Specific area
```
find kop tickets
```
✅ Expected: Liverpool v Brentford kop listing

---

### Q9 — Off-topic (should reject gracefully)
```
find iphone
```
✅ Expected: "No tickets found" — NOT a generic error message

---

### Q10 — Historical (if data from prev days)
```
show all from yesterday
```
✅ Expected: Either yesterday's data or "no data for yesterday"
