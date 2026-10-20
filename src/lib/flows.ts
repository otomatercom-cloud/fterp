// Illustrative process definitions transcribed from FT's "Fitout Project Pipeline" diagrams.
// These are NOT live status. Live overlay will come when workflow records exist in Odoo.
export type Kind = "pm" | "step" | "client" | "alert";
export type FNode = { id: string; label: string; c: number; r: number; kind?: Kind };
export type FEdge = { from: string; to: string; loop?: boolean; label?: string };
export type Flow = { slug: string; title: string; note?: string; nodes: FNode[]; edges: FEdge[] };

export const FLOWS: Flow[] = [
  {
    slug: "lead-to-work",
    title: "Lead → Work start",
    note: "Meta leads: round-robin to Sales Managers. Walk-in: Sales Manager creates. Other: Manager assigns. Dashed = rejection / change request.",
    nodes: [
      { id: "meta", label: "Meta Lead", c: 0, r: 0 }, { id: "walk", label: "Walk-in", c: 1, r: 0 }, { id: "oth", label: "Other", c: 2, r: 0 },
      { id: "rr", label: "Round robin to Sales Manager", c: 0, r: 1 }, { id: "wc", label: "Sales Manager creates lead", c: 1, r: 1 }, { id: "ma", label: "Manager assigns lead", c: 2, r: 1 },
      { id: "est", label: "Sales Manager creates Estimate", c: 1, r: 2 },
      { id: "pc", label: "Procurement checks availability & costing, confirms", c: 1, r: 3 },
      { id: "mgr", label: "Manager approval", c: 1, r: 4 },
      { id: "sc", label: "Sales Manager sends to Client", c: 1, r: 5 },
      { id: "ca", label: "Client Approval", c: 1, r: 6, kind: "client" },
      { id: "apm", label: "Manager assigns Project Manager", c: 1, r: 7 },
      { id: "pm", label: "Project Manager sends to Procurement", c: 1, r: 8, kind: "pm" },
      { id: "proc", label: "Procurement final prices vs estimate, purchase orders, approve", c: 1, r: 9 },
      { id: "inv", label: "Accounts starts invoice", c: 1, r: 10 },
      { id: "si", label: "Sales sends invoice to Client", c: 1, r: 11 },
      { id: "pay", label: "Client pays advance", c: 1, r: 12, kind: "client" },
      { id: "ver", label: "Accounts verifies payment", c: 1, r: 13 },
      { id: "go", label: "Project Manager starts work", c: 1, r: 14, kind: "pm" },
      { id: "site", label: "Site progress updates (to 100%)", c: 1, r: 15, kind: "pm" },
      { id: "ho", label: "Project Manager completes work (handover)", c: 1, r: 16, kind: "pm" },
      { id: "cs", label: "Client handover sign-off", c: 1, r: 17, kind: "client" },
    ],
    edges: [
      { from: "meta", to: "rr" }, { from: "walk", to: "wc" }, { from: "oth", to: "ma" },
      { from: "rr", to: "est" }, { from: "wc", to: "est" }, { from: "ma", to: "est" },
      { from: "est", to: "pc" }, { from: "pc", to: "est", loop: true, label: "not available" }, { from: "pc", to: "mgr" }, { from: "mgr", to: "est", loop: true, label: "reject" },
      { from: "mgr", to: "sc" }, { from: "sc", to: "ca" }, { from: "ca", to: "est", loop: true, label: "changes" },
      { from: "ca", to: "apm" }, { from: "apm", to: "pm" }, { from: "pm", to: "proc" }, { from: "proc", to: "inv" },
      { from: "inv", to: "si" }, { from: "si", to: "pay" }, { from: "pay", to: "ver" }, { from: "ver", to: "go" },
      { from: "go", to: "site" }, { from: "site", to: "ho" }, { from: "ho", to: "cs" },
    ],
  },
  {
    slug: "interior",
    title: "Interior – Fit-out pipeline",
    note: "Dashed arrows are feedback loops (revision / return).",
    nodes: [
      { id: "direct", label: "Direct", c: 0, r: 0 }, { id: "sales0", label: "Sales", c: 1, r: 0 }, { id: "ad", label: "Ad", c: 2, r: 0 },
      { id: "dsales", label: "Sales", c: 0, r: 1 }, { id: "lead", label: "Lead", c: 1, r: 1 }, { id: "auto", label: "Automate to Sales", c: 2, r: 1 },
      { id: "mgr1", label: "Manager", c: 1, r: 2 },
      { id: "design", label: "Department of Design", c: 1, r: 3 }, { id: "dmgr", label: "Manager", c: 2, r: 3 }, { id: "dsal", label: "Sales", c: 3, r: 3 }, { id: "dcl", label: "Client Approval", c: 4, r: 3, kind: "client" },
      { id: "est", label: "Estimation", c: 1, r: 4 }, { id: "emgr", label: "Manager", c: 2, r: 4 }, { id: "esal", label: "Sales", c: 3, r: 4 }, { id: "ecl", label: "Client Approval", c: 4, r: 4, kind: "client" },
      { id: "spec", label: "Client approval with specific requirement", c: 4, r: 5, kind: "alert" }, { id: "exd", label: "Sales Ex. Date", c: 3, r: 5, kind: "alert" }, { id: "drop", label: "Dropped – Manager", c: 2, r: 5, kind: "alert" },
      { id: "mgr2", label: "Manager", c: 0, r: 6 }, { id: "pm", label: "Project Manager", c: 1, r: 6, kind: "pm" }, { id: "acc", label: "Accounts", c: 2, r: 6 }, { id: "asal", label: "Sales", c: 3, r: 6 }, { id: "acl", label: "Client Approval", c: 4, r: 6, kind: "client" },
      { id: "shop", label: "Shop Drawing", c: 0, r: 7 }, { id: "site", label: "Site Visit", c: 2, r: 7 },
      { id: "join", label: "Joinery", c: 0, r: 8 }, { id: "proc", label: "Procurement", c: 1, r: 8 }, { id: "pest", label: "Estimation", c: 2, r: 8 }, { id: "pacc", label: "Accounts", c: 3, r: 8 }, { id: "psal", label: "Sales", c: 4, r: 8 },
      { id: "jsite", label: "Site Visit", c: 0, r: 9 }, { id: "apa", label: "Accounts Payment Approval", c: 3, r: 9 }, { id: "cpay", label: "Client Payment", c: 4, r: 9, kind: "client" },
      { id: "sal2", label: "Sales", c: 2, r: 10 }, { id: "ppm", label: "Project Manager", c: 3, r: 10, kind: "pm" },
    ],
    edges: [
      { from: "direct", to: "dsales" }, { from: "sales0", to: "lead" }, { from: "ad", to: "auto" }, { from: "lead", to: "mgr1" },
      { from: "mgr1", to: "design" }, { from: "mgr1", to: "est" },
      { from: "design", to: "dmgr" }, { from: "dmgr", to: "dsal" }, { from: "dsal", to: "dcl" }, { from: "dcl", to: "dsal", loop: true },
      { from: "design", to: "est" }, { from: "est", to: "emgr" }, { from: "emgr", to: "esal" }, { from: "esal", to: "ecl" }, { from: "ecl", to: "esal", loop: true },
      { from: "ecl", to: "spec", loop: true }, { from: "spec", to: "exd", loop: true }, { from: "exd", to: "drop", loop: true }, { from: "drop", to: "mgr2", loop: true },
      { from: "est", to: "pm" }, { from: "est", to: "acc" }, { from: "mgr2", to: "pm" },
      { from: "acc", to: "asal" }, { from: "asal", to: "acl" },
      { from: "pm", to: "shop" }, { from: "shop", to: "design", loop: true, label: "revision" },
      { from: "pm", to: "site" }, { from: "pm", to: "join" }, { from: "join", to: "jsite" },
      { from: "pm", to: "proc" }, { from: "proc", to: "pest" }, { from: "pest", to: "pacc" }, { from: "pacc", to: "psal" },
      { from: "psal", to: "cpay" }, { from: "cpay", to: "apa" }, { from: "apa", to: "sal2" }, { from: "apa", to: "ppm" },
    ],
  },
  {
    slug: "joinery",
    title: "Interior & Joinery",
    nodes: [
      { id: "pm", label: "Project Manager", c: 0, r: 0, kind: "pm" },
      { id: "site", label: "Site Visit", c: 0, r: 1 }, { id: "vd", label: "Visit Details / Measurement", c: 1, r: 1 }, { id: "ph", label: "Photos / Video Collected", c: 1, r: 2 },
      { id: "sd", label: "Shop Drawing – Design Team", c: 0, r: 2 }, { id: "jw", label: "Joinery Workshop", c: 0, r: 3 },
      { id: "cmp", label: "Complete", c: 1, r: 3 }, { id: "sv2", label: "Site Visit", c: 0, r: 4 }, { id: "anp", label: "Accounts – Next Payment", c: 1, r: 4 },
      { id: "ma", label: "Manager Approval", c: 3, r: 1 }, { id: "sub", label: "Out-source Sub Contractor", c: 3, r: 3 },
    ],
    edges: [
      { from: "pm", to: "site" }, { from: "site", to: "vd" }, { from: "vd", to: "ph" }, { from: "ph", to: "sd" }, { from: "site", to: "sd" },
      { from: "sd", to: "jw" }, { from: "jw", to: "cmp" }, { from: "jw", to: "sv2" }, { from: "cmp", to: "anp" }, { from: "anp", to: "pm", loop: true },
      { from: "pm", to: "ma" }, { from: "ma", to: "sub" },
    ],
  },
  {
    slug: "installation",
    title: "Installation",
    nodes: [
      { id: "sup", label: "Supervisor", c: 0, r: 0 }, { id: "pm", label: "Project Manager", c: 1, r: 0, kind: "pm" }, { id: "lab", label: "Labour", c: 2, r: 0 },
      { id: "n1", label: "Site Visit Numbers", c: 0, r: 1 }, { id: "n2", label: "Site Visit Numbers", c: 1, r: 1 },
      { id: "ins", label: "Installation", c: 1, r: 2 }, { id: "anp", label: "Accounts – Next Payment", c: 1, r: 3 },
    ],
    edges: [{ from: "sup", to: "n1" }, { from: "pm", to: "n2" }, { from: "n2", to: "ins" }, { from: "lab", to: "ins" }, { from: "ins", to: "anp" }],
  },
  {
    slug: "procurement",
    title: "Procurement",
    nodes: [
      { id: "pm", label: "Project Manager", c: 0, r: 0, kind: "pm" }, { id: "pr", label: "Procurement", c: 0, r: 1 }, { id: "es", label: "Estimation", c: 0, r: 2 },
      { id: "ac", label: "Accounts", c: 0, r: 3 }, { id: "sa", label: "Sales", c: 0, r: 4 }, { id: "cp", label: "Client Payment", c: 0, r: 5, kind: "client" },
      { id: "apa", label: "Accounts Payment Approval", c: 0, r: 6 },
    ],
    edges: [
      { from: "pm", to: "pr" }, { from: "pr", to: "es" }, { from: "es", to: "ac" }, { from: "ac", to: "sa" }, { from: "sa", to: "cp" }, { from: "cp", to: "apa" },
      { from: "apa", to: "sa", loop: true }, { from: "apa", to: "pm", loop: true },
    ],
  },
];
