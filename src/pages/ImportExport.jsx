import { useState } from "react";
import { sampleTemplate, parseCsv, validateRows, importRows, exportProducts, downloadFile } from "@/lib/csv";
import { all, putMany, clearStore, STORES } from "@/lib/db";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";

export default function ImportExport() {
  const { refresh, user } = useApp();
  const [checked, setChecked] = useState(null);
  const [mode, setMode] = useState("skip");
  const [summary, setSummary] = useState(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const rows = await parseCsv(f);
      setChecked(await validateRows(rows));
      setSummary(null);
    } catch {
      toast.error("Could not read the file. Please use the sample template.");
    }
  };

  const doImport = async () => {
    setBusy(true);
    try {
      const s = await importRows(checked, mode);
      setSummary(s);
      setChecked(null);
      refresh();
      toast.success(`Import done · ${s.created} created, ${s.updated} updated`);
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally { setBusy(false); }
  };

  const backup = async () => {
    const data = {};
    for (const s of STORES) data[s] = await all(s);
    downloadFile(`jewelbox-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ app: "JewelBox POS", version: 1, exportedAt: new Date().toISOString(), data }, null, 2), "application/json");
    toast.success("Backup downloaded");
  };

  const restore = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const json = JSON.parse(await f.text());
      if (json.app !== "JewelBox POS" || !json.data) return toast.error("Invalid backup file");
      const replace = window.confirm("Replace existing data with backup? Click Cancel to MERGE instead (existing records kept).");
      for (const s of STORES) {
        const rows = json.data[s] || [];
        if (replace) await clearStore(s);
        if (rows.length) await putMany(s, rows);
      }
      refresh();
      toast.success("Backup restored. Reloading…");
      setTimeout(() => window.location.reload(), 900);
    } catch {
      toast.error("Could not restore this file");
    }
  };

  const stats = checked && {
    valid: checked.filter((c) => c.valid && !c.duplicateInFile && !c.existing).length,
    invalid: checked.filter((c) => !c.valid).length,
    duplicates: checked.filter((c) => c.existing || c.duplicateInFile).length,
  };

  return (
    <div className="space-y-4" data-testid="import-export-page">
      <h1 className="text-2xl font-semibold tracking-tight">Import / Export</h1>

      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-sm">Import Stock (CSV)</h3>
        <div className="flex flex-wrap gap-2 items-center">
          <button data-testid="download-template" onClick={() => downloadFile("jewelbox-import-template.csv", sampleTemplate())} className="border rounded-lg px-3 py-2 text-sm">Download Sample Template</button>
          <input data-testid="import-file" type="file" accept=".csv,text/csv" onChange={onFile} className="text-sm" />
        </div>

        {checked && (
          <div className="space-y-3" data-testid="import-preview">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="border rounded-lg p-3"><div className="text-xs text-slate-500">Valid new rows</div><div className="text-lg font-semibold text-emerald-600" data-testid="valid-count">{stats.valid}</div></div>
              <div className="border rounded-lg p-3"><div className="text-xs text-slate-500">Invalid rows</div><div className="text-lg font-semibold text-red-600" data-testid="invalid-count">{stats.invalid}</div></div>
              <div className="border rounded-lg p-3"><div className="text-xs text-slate-500">Duplicates</div><div className="text-lg font-semibold text-amber-600" data-testid="dup-count">{stats.duplicates}</div></div>
            </div>
            <div className="border rounded-lg overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left p-2">Row</th><th className="text-left p-2">Code</th><th className="text-left p-2">Name</th><th className="text-left p-2">Status</th></tr></thead>
                <tbody>
                  {checked.map((c) => (
                    <tr key={c.row} className="border-t">
                      <td className="p-2">{c.row}</td><td className="p-2 font-mono">{c.code}</td><td className="p-2">{c.name}</td>
                      <td className="p-2">{!c.valid ? <span className="text-red-600">{c.errors.join(", ")}</span> : c.duplicateInFile ? <span className="text-red-600">Duplicate in file</span> : c.existing ? <span className="text-amber-600">Existing product</span> : <span className="text-emerald-600">OK</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm text-slate-600">Duplicates:</span>
              {[["skip", "Skip"], ["update", "Update Existing"], ["new", "Create New"]].map(([k, l]) => (
                <button key={k} data-testid={`dup-${k}`} onClick={() => setMode(k)} className={`text-sm border rounded-lg px-3 py-1.5 ${mode === k ? "bg-[#d4a437] font-semibold" : ""}`}>{l}</button>
              ))}
              <button data-testid="confirm-import" disabled={busy} onClick={doImport} className="bg-[#101827] text-white rounded-lg px-4 py-2 text-sm ml-auto disabled:opacity-50">Import Now</button>
            </div>
          </div>
        )}

        {summary && (
          <div className="border rounded-lg p-3 text-sm bg-emerald-50" data-testid="import-summary">
            Created <b>{summary.created}</b> · Updated <b>{summary.updated}</b> · Skipped <b>{summary.skipped}</b> · Failed <b>{summary.failed}</b>
          </div>
        )}
      </div>

      <div className="card p-4 space-y-3">
        <h3 className="font-semibold text-sm">Export</h3>
        <div className="flex flex-wrap gap-2">
          <button data-testid="export-products" onClick={exportProducts} className="border rounded-lg px-3 py-2 text-sm">Export Products CSV</button>
          <button data-testid="export-backup" onClick={backup} className="border rounded-lg px-3 py-2 text-sm">Export Full Backup (JSON)</button>
        </div>
      </div>

      <div className="card p-4 space-y-2">
        <h3 className="font-semibold text-sm">Restore Backup</h3>
        <p className="text-xs text-slate-500">Backup is validated first. You can choose Replace or Merge — nothing is deleted silently.</p>
        <input data-testid="restore-file" type="file" accept="application/json,.json" onChange={restore} className="text-sm" />
      </div>
    </div>
  );
}
