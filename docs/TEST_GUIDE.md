# Test guide — full pipeline with example data

## Setup (once)
1. Odoo: install/upgrade addon `otm_ft_pipeline` (needs CRM, Sales, Accounting, Purchase). Accounting: set company Default Sales Tax (e.g. VAT 5%), a bank journal, chart of accounts.
2. Next.js: `.env` filled, `npm run dev`, open http://localhost:3000
3. Login as admin → Settings → give users roles. Suggested test users (create in Odoo Settings → Users, internal users):
   - sm1, sm2 → Sales Manager
   - mgr → Manager
   - pm1 → Project Manager
   - proc → Procurement
   - acc → Accounts
4. (Optional) Settings → Load demo data to see the dashboard filled. Remove it before the real test.

## Scenario A — full run (walk-in lead, AED-style numbers)
| Step | Login | Where | What to enter / click | Expected |
|---|---|---|---|---|
| 1 | sm1 | CRM & Sales → New lead | Name "Marina Penthouse Fit-out", Customer "Rashid Al Mansoori", budget 300000, Source **Walk-in** | Lead created, stage **Assigned**, Sales = sm1 |
| 2 | sm1 | open lead | Next step **Create estimate**; add lines: Joinery 120000 ×1, Ceiling & lighting 60000 ×1, Flooring 80000 ×1 → **Save estimate** | Subtotal 260,000 + VAT + Total shown |
| 3 | sm1 | lead | **Send to procurement for costing** | Stage **Procurement check**; estimate (excl. tax) 260,000 locked |
| 3b | proc | My Tasks → lead → card **Availability & costing** | Joinery: In stock, cost 90000 · Ceiling & lighting: Needs ordering, 10 days, cost 45000 · Flooring: Needs ordering, 14 days, cost 60000 → **Save costing** → **Confirm availability & costing** | Margin and longest lead time shown; stage **Manager review** |
| 3c | proc | (negative) set one item "Not available" → Confirm | Refused; use **Return to sales** to send it back to Estimate draft |
| 4 | mgr | My Tasks | **Approve estimate** | Estimate approved |
| 5 | sm1 | lead | **Send to client**, then **Client approved** | Client approved |
| 6 | mgr | lead | choose Project Manager pm1, **Assign PM** | PM assigned |
| 7 | pm1 | lead | **Send to procurement** | Stage Procurement |
| 8 | proc | lead | Price lines are pre-filled from the confirmed costing (edit if the vendor price changed), e.g.: Timber/Al Noor Timber 100000, Gypsum/Gulf Gypsum 50000, Marble/Stonehill 70000 → **Save prices** → **Create purchase orders** | Total 220,000 "Within estimate (40,000 under)"; 3 draft POs, prices lock |
| 9 | proc | lead | **Approve prices** | Procurement approved |
| 10 | acc | lead | **Start invoice**, advance 78000 (excl. tax) → **Create invoice** → **Post invoice** → **Send to sales** | Invoice total = 78000 + tax |
| 11 | sm1 | lead | **Send invoice to client**; enter advance received = invoice total → save → **Record advance** | Payment verification |
| 12 | acc | lead | choose bank journal → **Register payment**, then **Verify payment** | **Work started** |
| 13 | pm1 | Projects → open project | Joinery: add "Wardrobe units" ×4; Tasks: add task "Site marking", add **snag** "Paint touch-up"; site update 50% note "Ceiling framing done" | Board and timeline update |
| 14 | pm1 | project | Try **Complete work (handover)** now | Blocked: joinery not installed / snag open / progress < 100 |
| 15 | pm1 | project | Move joinery → Installed, snag → Done, site update 100% → **Complete work** | Stage **Handover** |
| 16 | sm1 or mgr | project | **Confirm client handover** | **Completed** |

## Scenario B — negative checks (must be refused)
- sm1 tries Approve estimate → button absent / Odoo refuses.
- proc enters prices total 300000 (> estimate) and tries Approve prices → refused; mgr can approve.
- acc tries Verify payment before registering payment → "no registered payment".
- pm2 (another PM) tries Send to procurement on pm1's lead → refused.
- Advance received ≠ invoice total → Verify payment refused.

## Scenario C — Meta lead round robin
In Odoo (Developer mode) create 3 CRM opportunities with FT Source = **Meta** and no salesperson. They are assigned sm1, sm2, sm1… in turn, stage Assigned.

## Other screens to check
- Bell icon / **My Tasks**: shows only what the logged-in role must act on.
- **Dashboard**: counts, graph, pills, recent activity change after each step.
- **Reports** (mgr/sm/acc): tables + Download CSV.
- **Settings** (admin): role checkboxes; log in again to see new menus.

## Scenario D — Customer portal (client logs in)
1. As sm1: open lead "Marina Penthouse Fit-out" (after the estimate exists) → card **Customer portal access** → email `rashid@example.com`, temporary password `Welcome#2026` → **Create login**.
2. Log out. Log in with `rashid@example.com` / `Welcome#2026` → lands on **My Projects** (only that customer's projects, no internal menus).
3. While the lead is at *Sent to client*: open the project → see estimate lines, subtotal, tax, total → **Approve estimate** (or **Request changes** → lead returns to Estimate draft). The stage history shows the client as the actor.
4. Continue the internal flow (steps 6–12 of Scenario A). The client sees "Advance invoice" with total/balance and a PDF link, then "Work in progress" with progress % and site-update notes.
5. At *Handover*: client opens the project → **Confirm handover** → status Completed.
6. Negative checks: the client must not see other customers' projects, procurement prices, margins or internal stage names; a client cannot open /m/crm (no menu, no access).

## Scenario E — Installation, photos and client snag sign-off
1. As pm1: Projects → open a *Work started* project → card **Site visits & installation** → add "Kitchen cabinet installation", type Installation, date, crew "Ravi, Suresh" → **Add**.
2. On that row click **+ before photo**, choose a JPG/PNG (≤5 MB) → thumbnail appears; same for **+ after photo**. Try a .pdf or a renamed .exe → refused ("Only JPEG, PNG or WebP").
3. Move the row **→ In progress → Done**.
4. Finish joinery (Installed), tasks/snags Done, progress 100% → **Complete work (handover)**.
5. Log in as the customer (Scenario D): project shows installation rows with photos. At *Handover* type "Scratch on wardrobe door" → **Report issue**.
6. Customer tries **Confirm handover** → refused (open snag). As pm1 mark the "[Client] Scratch…" snag **Done** on the project page → customer now sees it as Fixed and **Confirm handover** works → Completed.
7. Negative: a different customer's login cannot open your photo URL (/api/photos/<id> → not available).
