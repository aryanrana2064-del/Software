import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "@/context/AppContext";
import { Gem } from "lucide-react";
import { log } from "@/lib/ops";

const DEMO = [
  { name: "Owner", pin: "1234" },
  { name: "Manager", pin: "2222" },
  { name: "Cashier", pin: "1111" },
  { name: "Staff", pin: "3333" },
];

export default function Login() {
  const { login } = useApp();
  const [name, setName] = useState("Owner");
  const [pin, setPin] = useState("1234");
  const [err, setErr] = useState("");
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    const ok = await login(name, pin);
    if (!ok) return setErr("Invalid user or PIN. Please try again.");
    await log("LOGIN", `${name} signed in`, { name });
    nav("/dashboard");
  };

  return (
    <div className="min-h-screen bg-[#0b1120] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-[#d4a437]/10 blur-3xl" />
      <div className="absolute -bottom-32 -right-20 w-96 h-96 rounded-full bg-sky-500/10 blur-3xl" />
      <div className="w-full max-w-sm bg-white rounded-2xl p-7 shadow-2xl relative">
        <div className="flex items-center gap-2 mb-1">
          <Gem className="text-[#d4a437]" />
          <h1 className="text-2xl font-semibold tracking-tight">JewelBox POS</h1>
        </div>
        <p className="text-sm text-slate-500 mb-6">Jewellery & Jewellery Boxes — Billing, Stock & Business Management</p>
        <form onSubmit={submit} className="space-y-3">
          <input data-testid="login-user" className="inp py-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="User name" />
          <input data-testid="login-pin" type="password" className="inp py-3" value={pin} onChange={(e) => setPin(e.target.value)} placeholder="PIN" />
          {err && <div data-testid="login-error" className="text-sm text-red-600">{err}</div>}
          <button data-testid="login-submit" className="w-full bg-[#d4a437] hover:bg-[#c1932c] text-[#101827] font-semibold rounded-lg py-3 active:scale-[0.99] transition-all shadow-lg shadow-[#d4a437]/20">Sign In</button>
        </form>
        <div className="mt-5 text-xs text-slate-500">
          Demo logins:
          <div className="mt-2 grid grid-cols-2 gap-2">
            {DEMO.map((d) => (
              <button key={d.name} data-testid={`demo-${d.name}`} onClick={() => { setName(d.name); setPin(d.pin); }} className="border border-slate-200 rounded-lg px-2 py-2 hover:border-[#d4a437] hover:bg-[#d4a437]/5 text-left transition-colors">
                <b>{d.name}</b> · {d.pin}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
