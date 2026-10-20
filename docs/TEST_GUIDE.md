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
| 3 | sm1 | lead | **Submit to manager** | Stage Manager review; estimate (excl. tax) 260,000 locked |
| 4 | mgr | My Tasks | **Approve estimate** | Estimate approved |
| 5 | sm1 | lead | **Send to client**, then **Client approved** | Client approved |
| 6 | mgr | lead | choose Project Manager pm1, **Assign PM** | PM assigned |
| 7 | pm1 | lead | **Send to procurement** | Stage Procurement |
| 8 | proc | lead | Price lines: Timber/Al Noor Timber 100000, Gypsum/Gulf Gypsum 50000, Marble/Stonehill 70000 → **Save prices** → **Create purchase orders** | Total 220,000 "Within estimate (40,000 under)"; 3 draft POs, prices lock |
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
