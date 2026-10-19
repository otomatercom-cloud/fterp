# FT ERP (Next.js + Odoo 19)

## 1. Odoo
Copy `odoo/otm_ft_pipeline` into your Odoo addons path, restart, Apps → Update Apps List, install **FT Interior Pipeline**
(needs crm, sale_crm, account). Add users to the groups under "FT Pipeline": Sales Manager, Manager, Project Manager, Procurement, Accounts.

## 2. Next.js
```
cp .env.example .env.local   # set ODOO_BASE_URL, ODOO_DATABASE, NEXTAUTH_SECRET (32+ chars)
npm install
npm run dev                  # http://localhost:3000, log in with an Odoo user
npm test                     # workflow rules
```

## 3. Test order
Walk-in lead → Create estimate → add lines → Submit → Manager approve → Send to client → Client approved → assign PM →
PM sends to procurement → procurement total → Approve prices → Accounts start invoice → create + post → send to sales →
send to client → record advance → register payment → verify payment.
Rules: docs/INTERIOR_WORKFLOW.md
