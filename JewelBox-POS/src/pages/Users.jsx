import { useEffect, useState } from "react";
import { all, put, remove, uid, nowISO } from "@/lib/db";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";

const ROLE_INFO = {
  Owner: "Full access to everything including license & data restore",
  Manager: "Products, Inventory, Sales, Purchases, Reports, price changes",
  Cashier: "Quick Billing + Customers",
  Staff: "Restricted — Quick Billing only",
};

export default function Users() {
  const { user } = useApp();
  const [list, setList] = useState([]);
  const [form, setForm] = useState(null);

  const load = async () => setList(await all("users"));
  useEffect(() => { load(); }, []);

  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.pin.trim()) return toast.error("Name and PIN are required");
    await put("users", { ...form, id: form.id || uid("usr"), createdAt: form.createdAt || nowISO() });
    setForm(null);
    await load();
    toast.success("User saved");
  };

  return (
    <div className="space-y-4" data-testid="users-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Users & Permissions</h1>
        <button data-testid="add-user-btn" onClick={() => setForm({ name: "", pin: "", role: "Cashier" })} className="btn-gold">Add User</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="th"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Role</th><th className="text-left p-3 hidden sm:table-cell">Access</th><th className="p-3"></th></tr></thead>
          <tbody data-testid="users-table">
            {list.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-3 font-medium">{u.name}</td><td className="p-3">{u.role}</td>
                <td className="p-3 hidden sm:table-cell text-slate-500 text-xs">{ROLE_INFO[u.role]}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button data-testid={`edit-user-${u.name}`} onClick={() => setForm(u)} className="border rounded px-2 py-1 text-xs">Edit</button>
                  {u.name !== user?.name && <button data-testid={`del-user-${u.name}`} onClick={async () => { await remove("users", u.id); load(); }} className="border rounded px-2 py-1 text-xs ml-1 text-red-600">Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {form && (
        <div className="modal-bg">
          <form onSubmit={save} className="modal max-w-md space-y-3" data-testid="user-form">
            <h3 className="text-lg font-semibold">{form.id ? "Edit" : "New"} User</h3>
            <input data-testid="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" className="inp" />
            <input data-testid="u-pin" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} placeholder="PIN" className="inp" />
            <select data-testid="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="inp">
              {Object.keys(ROLE_INFO).map((r) => <option key={r}>{r}</option>)}
            </select>
            <p className="text-xs text-slate-500">{ROLE_INFO[form.role]}</p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setForm(null)} className="border rounded-lg px-4 py-2.5 text-sm">Cancel</button>
              <button data-testid="save-user" className="bg-[#d4a437] font-semibold rounded-lg px-5 py-2.5 text-sm">Save</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
