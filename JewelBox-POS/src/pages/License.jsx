import { useEffect, useState } from "react";
import { one, put, DEVICE_ID, nowISO } from "@/lib/db";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PLANS = [
  { plan: "Trial", price: "Free · 14 days", devices: 2 },
  { plan: "Starter", price: "₹299 / month", devices: 1 },
  { plan: "Pro", price: "₹599 / month", devices: 3 },
  { plan: "Business", price: "₹999 / month", devices: 10 },
  { plan: "Lifetime", price: "₹14,999 one-time", devices: 5 },
];

export default function License() {
  const { online } = useApp();
  const [lic, setLic] = useState(null);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => setLic(await one("license", "current"));
  useEffect(() => { load(); }, []);

  const status = (() => {
    if (!lic) return "Not Activated";
    if (lic.status === "Revoked") return "Revoked";
    const days = Math.ceil((new Date(lic.expiry) - Date.now()) / 864e5);
    if (days < 0) return "Expired";
    if (days <= 7) return `Expiring in ${days} day(s)`;
    return "Active";
  })();

  const activate = async () => {
    if (!key.trim()) return toast.error("Enter your license key");
    setBusy(true);
    try {
      const { data } = await axios.post(`${API}/license/activate`, { licenseKey: key.trim().toUpperCase(), deviceId: DEVICE_ID });
      await put("license", { id: "current", ...data.license, token: data.token, activatedAt: nowISO() });
      await load();
      toast.success("License activated. Offline use enabled.");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not activate. Check your key or connection.");
    } finally { setBusy(false); }
  };

  const revalidate = async () => {
    if (!online) return toast.warning("Offline — validation will run when internet is available.");
    try {
      const { data } = await axios.post(`${API}/license/validate`, { licenseKey: lic.key, deviceId: DEVICE_ID });
      await put("license", { ...lic, ...data.license, lastValidatedAt: nowISO() });
      await load();
      toast.success("License revalidated");
    } catch {
      toast.error("Could not revalidate right now. Your data stays safe.");
    }
  };

  return (
    <div className="space-y-4 max-w-3xl" data-testid="license-page">
      <h1 className="text-2xl font-semibold tracking-tight">License</h1>

      <div className="card p-4 space-y-2" data-testid="license-card">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">Status</span>
          <span className={`text-sm font-semibold ${status === "Active" ? "text-emerald-600" : status.startsWith("Expiring") ? "text-amber-600" : "text-red-600"}`} data-testid="license-status">{status}</span>
        </div>
        {lic && (
          <div className="grid sm:grid-cols-2 gap-2 text-sm">
            <div><span className="text-slate-500">Key:</span> <b className="font-mono">{lic.key}</b></div>
            <div><span className="text-slate-500">Business:</span> {lic.business}</div>
            <div><span className="text-slate-500">Plan:</span> {lic.plan}</div>
            <div><span className="text-slate-500">Device limit:</span> {lic.deviceLimit}</div>
            <div><span className="text-slate-500">Expiry:</span> {new Date(lic.expiry).toLocaleDateString("en-IN")}</div>
            <div><span className="text-slate-500">This device:</span> <span className="font-mono">{DEVICE_ID}</span></div>
          </div>
        )}
        <p className="text-xs text-slate-500 pt-2">Activation is verified once online, then a local activation token allows fully offline billing. Your business data is never deleted if the license expires.</p>
        <div className="flex gap-2 flex-wrap pt-2">
          <input data-testid="license-key-input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="JBX-XXXX-XXXX-XXXX" className="inp flex-1 min-w-[200px] font-mono" />
          <button data-testid="activate-btn" disabled={busy} onClick={activate} className="btn-gold disabled:opacity-50">Activate</button>
          {lic && <button data-testid="revalidate-btn" onClick={revalidate} className="btn-ghost">Revalidate</button>}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="th"><tr><th className="text-left p-3">Plan</th><th className="text-left p-3">Price</th><th className="text-right p-3">Devices</th></tr></thead>
          <tbody>
            {PLANS.map((p) => (
              <tr key={p.plan} className="border-t"><td className="p-3 font-medium">{p.plan}</td><td className="p-3">{p.price}</td><td className="p-3 text-right">{p.devices}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-500">License creation, extension, plan change and revocation are handled by the server-side admin API (<span className="font-mono">/api/admin/licenses</span>) protected by the <span className="font-mono">LICENSE_ADMIN_SECRET</span> environment variable. No secret is stored in this frontend.</p>
    </div>
  );
}
