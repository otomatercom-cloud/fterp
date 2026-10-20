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

## Scenario F — Design Studio & Shop Drawings
1. Upgrade the addon (`-u otm_ft_pipeline`), restart Odoo. Log in as Sales Manager (owner of a lead) or Manager.
2. CRM & Sales → open a lead → **Design & drawings** → add "Master bedroom concept" (type Concept) → Add.
3. Click **+ file (rev 1)** and upload a JPG/PNG/PDF (max 7 MB). Thumbnail appears; click it to open.
4. **Send for review** → status *In review*. (Sending without a file must fail.)
5. Log in as Manager (or the lead's Sales Manager): write a note, **Request changes** → status *Changes requested*, revision becomes 2, your note shows in red. (Without a note it must fail.)
6. Upload a new file (tagged r2) → Send for review → **Approve** → status *Approved*, "Approved by …".
7. Add a type **Shop drawing** item the same way. It appears under **Shop Drawings**; other types under **Design Studio** (status counters on top).
8. Negative: a Procurement/Accounts user cannot add items or approve; a non-PDF/image file renamed to .jpg is rejected.

## Demo logins (Settings → Demo data → Load)
Password for all: `Demo@2026`. Logins: `demo.sales1@ftdemo.com`, `demo.sales2@…`, `demo.manager@…`, `demo.pm1@…`, `demo.pm2@…`, `demo.procurement@…`, `demo.accounts@…`, and portal customers `demo.customer1@…` (work in progress), `customer2` (estimate sent), `customer3` (handover).
Data: 32 leads across all stages with estimates, costing, design items (all statuses, with images), purchase orders, invoices/payments, tasks and snags, joinery, installations with before/after photos, site updates and history.
Reload: Remove demo data, then Load again (internal demo users are archived and reactivated; portal users are deleted and recreated).
Quick checks: sales1 vs sales2 see different leads; pm1 vs pm2 see different projects; customer1 sees only its own project; customer2 can approve the estimate; customer3 can confirm handover only when snags are closed.

## Scenario G — Finance & Accounts (milestones, follow-up, profitability)
1. Login `demo.accounts@ftdemo.com`. Open a lead at **Work started** (e.g. *Business Bay Office Fit-out*) → card **Payment schedule**.
2. No plan yet? **Create plan** (Advance 30 / Progress 30 @ 50% site progress / Final 35 / Retention 5; total must be 100%) → Save.
3. Progress milestone: if site progress is below the trigger it shows "Site progress must reach 50%". As `demo.pm1` add a site update ≥ 50%, then as Accounts click **Create & post invoice** (tax from company default; amount = % of the estimate excl. tax).
4. Select journal → **Register payment** → status *Paid*, balance 0.
5. Leave one invoice unpaid past its due date → status *Overdue*. Type a note → **Log follow-up** (shows on the card and in the lead chatter).
6. **Finance & Accounts** menu: KPIs (contract, invoiced, collected, outstanding), collection gauges, margin bars per project (estimate excl. tax − procurement cost), **Overdue payments** table (days overdue, last follow-up), all-projects table.
7. Final milestone only after **Handover**; Retention only after **Completed** (button replaced by the reason text before that).
8. Negative: `demo.manager` can set the plan, view and log follow-ups but has no invoice/payment buttons; `demo.sales1`/PM/procurement cannot open Finance (menu hidden, API refuses); editing the plan cannot change or remove an invoiced milestone.

## Scenario H — Estimation & BOQ (rate library, categories, revisions)
1. Login `demo.manager@ftdemo.com` (or procurement) → **Estimation & BOQ** → *Rate library*: 22 demo items with rate, cost and margin %. Add a new item (code, name, category, unit, rate, cost); edit one; archive one. Sales Manager sees the library without cost/margin and cannot edit.
2. Login `demo.sales1@ftdemo.com` → a lead at **Estimate draft** → *Estimate*: use **+ From rate library…** to add items (category and unit are filled, price = library rate). Change qty; "By category" subtotals show under the lines. Save.
3. **Submit to Procurement** → *Estimate revisions* card shows Rev 1. Login `demo.procurement` → **Return to Sales** (or Confirm costing) → a new revision is kept only when the content changed.
4. As sales1 edit and re-submit: Rev N shows the difference vs the previous revision (+/- amount). Expand a revision to see its lines; **Restore into draft** (Sales Manager, only at Estimate draft) puts those lines back in the editor.
5. **Estimation & BOQ** page → *Estimates in progress*: lines, revisions, total and category split per lead.

## Scenario I — Procurement module (vendors, PO tracking, goods receipt)
1. Login `demo.procurement@ftdemo.com` → **Procurement**. KPIs: To confirm, Awaiting goods, Overdue deliveries, Open order value. Filters: All / To confirm / Awaiting goods / Overdue / Received.
2. Open a **Draft** PO (click its row) → set *Expected delivery* → **Confirm order** → status Confirmed, "Not received". (Cancel works only for unconfirmed orders without receipts.)
3. Open a confirmed PO → type quantities in *Receive now* (cannot exceed what is still due) → note → **Record goods received**. Partial shows "Partially received"; when every line is complete it becomes "Received" and the input boxes disappear. Receipts are listed under the PO.
4. Overdue: an order whose expected date passed and is not fully received shows red "Overdue". **Reschedule** moves the date.
5. **Vendors** tab: add a vendor (name, phone, email); table shows orders, open orders and value per vendor.
6. Login `demo.pm1@ftdemo.com` → Procurement shows only own projects' POs; can record goods received, cannot confirm/cancel/reschedule and has no Vendors tab. `demo.pm2` sees other projects. `demo.sales1`/accounts do not see the menu.
7. Each receipt is also logged in the lead chatter ("Goods received on P000xx").

## Scenario J — Manufacturing & Intercompany orders (furniture factory)
Setup: the factory is a separate Odoo **company**. Demo load creates "FT Furniture Factory (Demo)" and the login `demo.factory@ftdemo.com` (role *Factory*, company = the factory only). In your own data: create the furniture company in Odoo, add it to Settings → Companies, and give factory users the role *Factory* (Settings → Pipeline roles) with that company.
1. Login `demo.pm1@ftdemo.com` → **Intercompany Orders** → *New order*: choose a project (client approved … handover), factory company, needed-by date, note → **Create draft order**.
2. Open the order → **Import joinery jobs** (copies the project's joinery items) or **+ Line**; set quantity and transfer price → **Save lines** → **Send to factory**. (Sending without lines fails.)
3. Login `demo.factory@ftdemo.com` → **Manufacturing**: KPIs and the production board (Queued → Cutting → Assembly → Finishing → Quality check → Ready). Open the sent order → **Accept order** (or **Reject** with a reason).
4. Change each item's stage with the dropdown. Order becomes *In production* when any item leaves Queued, and *Ready for dispatch* when all are Ready. **Dispatch to site** then marks it Dispatched.
5. Back as `demo.pm1`: **Confirm received at site** → *Received at site*. Each step is logged in the project chatter.
6. Overdue: needed-by date passed and not dispatched → red "Overdue". Negative checks: the factory user cannot create or edit orders or open project pages; `demo.pm2` cannot see pm1's orders; sales/accounts do not see the menus; PM cannot accept or move stages.

## Scenario K — Petty Cash (floats, expenses with receipts, approval)
1. Login `demo.accounts@ftdemo.com` → **Petty Cash** → *Cash floats*: balance and pending per holder. Enter an amount next to `Demo Project Manager 1` → **Top up** (balance rises at once).
2. Login `demo.pm1@ftdemo.com` → **Petty Cash**: cards My balance / Pending / Available. *New expense*: category, project, date, amount, description → **Submit**. An amount above your *available* balance is refused.
3. On the pending line click **+ receipt** and upload a JPG/PNG/PDF (≤5 MB); the "receipt" link opens it. **Withdraw** removes a pending expense.
4. Login `demo.accounts` → *Approvals*: the pending expense → **Approve** (balance drops) or **Reject** with a reason (shown to the holder in red). You cannot review your own expense. Expenses above the limit (500 by default; system parameter `otm_ft_pipeline.petty_limit`) show "Manager approval needed" and only `demo.manager` can approve them.
5. Approval is refused if the holder's balance is lower than the expense (top up first).
6. *Spend this month by category* donut: holders see their own, Accounts/Manager see everyone's.
7. Approved expenses linked to a project are added to its **cost** in Finance (profitability = estimate − procurement − petty cash).
8. Negative: Procurement/PM/Sales cannot open the Approvals or Floats tabs or other people's receipts (`/api/petty-files/<id>` returns 403/404); customers and factory users have no menu.

## Scenario L — HR & Payroll (employees, attendance, leave, payroll)
Demo data: 7 office staff (linked to the demo logins, monthly salary), 8 site workers (daily wage), 35 days of attendance, 4 leave requests, last month's payslips (paid / approved / draft).
1. Login `demo.manager@ftdemo.com` → **HR & Payroll** → *Employees*: list with rates. Add an employee (name, type, pay type, rate, optional login user), edit, archive.
2. *Attendance*: pick a date (not future) → set Present / Half day / Absent / Leave and the **project** for each worker → **Save attendance**. The table shows this month's P / H / A / L counts. Login `demo.pm1` → the same tab lists only site workers and only pm1's running projects.
3. *Leave*: as `demo.sales1` **Request leave** (dates + reason; overlapping requests are refused; Sundays are not counted). As `demo.manager` approve (the dates become "Leave" in attendance) or reject with a reason. You cannot approve your own request.
4. *Payroll* (Manager / Accounts): choose the month → **Generate / refresh drafts**. Monthly staff: salary × paid days ÷ working days (Sundays excluded; paid leave counts, half day = 0.5). Daily workers: days worked × daily wage. **Adjust** allowances / deductions on drafts. Manager **Approve** → Accounts (`demo.accounts`) **Mark paid**. Approved/paid payslips are never overwritten by Generate.
5. Staff see only their own record, leave and approved/paid payslips (My payslips); PM sees no salary figures of others.
6. Finance → profitability: attendance days linked to a project add **labour cost** to that project (daily wage, or monthly salary ÷ 26) next to procurement and petty cash.
