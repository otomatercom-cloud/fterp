"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Upload } from "lucide-react";

type Prev = { cols: { key: string; label: string }[]; rows: Record<string, string>[] };
type Res = { created: number; updated: number; failed: { row: number; error: string }[] };

export function ImportExport({ entity, canImport = true }: { entity: string; canImport?: boolean }) {
  const router = useRouter();
  const [file, setFile] = useState<File>();
  const [prev, setPrev] = useState<Prev>();
  const [res, setRes] = useState<Res>();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const send = async (f: File, commit: boolean) => {
    setBusy(true); setErr("");
    const fd = new FormData(); fd.append("file", f); if (commit) fd.append("commit", "1");
    const r = await fetch(`/api/io/${entity}/import`, { method: "POST", body: fd }).then((x) => x.json()).catch(() => ({ error: "Upload failed" }));
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    if (commit) { setRes(r); setPrev(undefined); router.refresh(); } else { setPrev(r); setRes(undefined); }
  };
  const bad = prev?.rows.filter((r) => r._error).length ?? 0;
  const btn = "flex h-9 items-center gap-1.5 rounded-md border border-line px-3 text-sm hover:bg-tint";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a href={`/api/io/${entity}/export?fmt=xlsx`} className={btn}><Download className="size-4" /> Export Excel</a>
        <a href={`/api/io/${entity}/export?fmt=csv`} className={btn}><FileSpreadsheet className="size-4" /> CSV</a>
        {canImport && <button onClick={() => setOpen((o) => !o)} className={btn}><Upload className="size-4" /> Import</button>}
      </div>
      {open && canImport && (
        <div className="glass space-y-2 p-3 text-sm">
          <p className="text-xs text-muted">1) <a className="text-gold underline" href={`/api/io/${entity}/template`}>Download the Excel template</a> and fill it. 2) Upload it. 3) Check the preview and confirm. Existing codes are updated, new ones are created.</p>
          <input type="file" accept=".xlsx,.csv" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; setFile(f); setPrev(undefined); setRes(undefined); if (f) send(f, false); e.target.value = ""; }} className="text-xs" />
          {busy && <p className="text-xs text-muted">Working…</p>}
          {err && <p role="alert" className="text-xs text-danger">{err}</p>}
          {prev && (
            <div className="space-y-2">
              <p className="text-xs">{prev.rows.length} rows · {prev.rows.length - bad} ready{bad ? ` · ${bad} with errors (will be skipped)` : ""}</p>
              <div className="max-h-64 overflow-auto rounded border border-line">
                <table className="w-full text-xs"><thead className="sticky top-0 bg-tint"><tr><th className="p-1 text-left">#</th>{prev.cols.map((c) => <th key={c.key} className="p-1 text-left">{c.label}</th>)}<th className="p-1 text-left">Result</th></tr></thead>
                  <tbody>{prev.rows.map((r, i) => <tr key={i} className="border-t border-line"><td className="p-1">{i + 1}</td>{prev.cols.map((c) => <td key={c.key} className="max-w-40 truncate p-1">{r[c.key]}</td>)}<td className={`p-1 ${r._error ? "text-danger" : "text-success"}`}>{r._error || r._action}</td></tr>)}</tbody></table>
              </div>
              <div className="flex gap-2">
                <button disabled={busy || prev.rows.length === bad || !file} onClick={() => file && send(file, true)} className="h-9 rounded-md bg-primary px-4 text-white disabled:opacity-50">Import {prev.rows.length - bad} rows</button>
                <button onClick={() => setPrev(undefined)} className="h-9 px-3 text-muted">Cancel</button>
              </div>
            </div>
          )}
          {res && (
            <div role="status" className="text-xs">
              <p className="text-success">Done: {res.created} created, {res.updated} updated{res.failed.length ? `, ${res.failed.length} failed` : ""}.</p>
              {res.failed.map((f) => <p key={f.row} className="text-danger">Row {f.row}: {f.error}</p>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
