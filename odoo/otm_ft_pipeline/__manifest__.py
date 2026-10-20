{
    "name": "FT Interior Pipeline",
    "version": "19.0.1.0.0",
    "summary": "Lead to work-start pipeline for FT Interior Design & Architecture",
    "category": "Sales/CRM",
    "author": "Otomater",
    "website": "https://otomater.com",
    "license": "OPL-1",
    "depends": ["crm", "sale_crm", "account", "purchase", "mail"],
    "data": [
        "security/security.xml",
        "security/ir.model.access.csv",
        "views/crm_lead_views.xml",
        "data/cron.xml",
    ],
    "installable": True,
    "application": False,
}
