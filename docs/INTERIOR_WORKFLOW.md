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
