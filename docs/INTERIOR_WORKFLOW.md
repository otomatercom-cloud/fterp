# FT Interior: Lead → Work start (rules as given)
1. Sources: Meta (auto, round-robin across Sales Managers), Walk-in (Sales Manager creates), Other (Manager assigns).
2. Sales Manager creates Estimate → Manager approves (reject returns to Sales Manager) → Sales Manager sends to Client.
3. Client approves → Manager assigns Project Manager → PM sends to Procurement.
4. Procurement collects prices matching the estimate and approves → Accounts starts invoice → Sales → Client.
5. Client pays advance → Accounts verifies → Project Manager starts work.

## Assumptions to confirm
- "Manager" and "Sales Manager" are separate roles.
- Client approval is recorded by Sales on the client's behalf (portal approval can come later).
- Procurement prices above estimate need Manager approval.
- Advance invoice is raised after procurement approval, as stated.
- Round-robin pool = all active Sales Managers; rotation state lives in Odoo.

## Later additions
- **Tax:** estimate and invoice lines use the company's own default sales tax (Odoo Accounting settings); purchase orders use the default purchase tax. The approved estimate and procurement prices are compared **excluding tax**.
- **Purchase orders:** at Procurement stage, one draft PO per vendor is created from the saved price lines (needs the Odoo Purchase app). Prices lock once POs exist.
- **Project execution:** after Work started, the assigned Project Manager posts site progress (0–100%). At 100% the PM completes work (Handover); Sales Manager or Manager confirms client sign-off (Completed).
- **My Tasks / bell:** leads waiting for the user. Sales Manager and Project Manager see only their own leads; Manager, Procurement and Accounts see every lead at their stages.
- **Reports:** by source, sales manager, stage, month, procurement vs estimate, plus CSV export (Manager, Sales Manager, Accounts, admin).
- **Settings (admin):** assign pipeline roles to users; load/remove demo data.
