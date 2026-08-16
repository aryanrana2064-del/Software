import { useEffect, useMemo, useState } from "react";
import { all, put, remove, uid, nowISO, CATEGORY_TREE } from "@/lib/db";
import { money, log } from "@/lib/ops";
import { barcodeSvgMarkup, generateCode128Value } from "@/lib/print";
import { exportProducts } from "@/lib/csv";
import { useApp } from "@/context/AppContext";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Download, QrCode } from "lucide-react";
import { useNavigate } from "react-router-dom";

const empty = {
  code: "", name: "", category: "Jewellery", subcategory: "Rings", photo: "",
  purchasePrice: 0, price: 0, stock: 0, minStock: 5, unit: "Pcs", supplier: "",
  barcode: "", location: "", gst: 3, notes: "",
};

export default function Products() {
  const { user, can, refresh } = useApp();
  const [items, setItems] = useState([]);
  const [term, setTerm] = useState("");
  const [cat, setCat] = useState("All");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState(null);
  const nav = useNavigate();
  const editable = can("products") || can("*") || user?.role === "Owner" || user?.role === "Manager";

  const load = async () => setItems(await all("products"));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    return items.filter(
      (p) =>
        (cat === "All" || p.category === cat) &&
        (!t || p.name.toLowerCase().includes(t) || String(p.code).toLowerCase().includes(t) || String(p.barcode).includes(t))
    );
  }, [items, term, cat]);

  const perPage = 12;
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const view = filtered.slice((page - 1) * perPage, page * perPage);

  const save = async (e) => {
    e.preventDefault();
    const f = form;
    if (!f.code.trim() || !f.name.trim()) return toast.error("Product code and name are required");
    const dupCode = items.find((p) => p.code.toUpperCase() === f.code.trim().toUpperCase() && p.id !== f.id);
    if (dupCode) return toast.error("Product code already exists");
    if (f.barcode) {
      const dupBar = items.find((p) => p.barcode === f.barcode && p.id !== f.id);
      if (dupBar) return toast.error("Duplicate barcode — already used by " + dupBar.name);
    }
    const payload = {
      ...f,
      code: f.code.trim().toUpperCase(),
      purchasePrice: Number(f.purchasePrice) || 0,
      price: Number(f.price) || 0,
      stock: Number(f.stock) || 0,
      minStock: Number(f.minStock) || 0,
      gst: Number(f.gst) || 0,
      id: f.id || uid("prd"),
      createdAt: f.createdAt || nowISO(),
      updatedAt: nowISO(),
    };
    await put("products", payload);
    await log(f.id ? "PRODUCT_UPDATE" : "PRODUCT_CREATE", payload.name, user);
    setForm(null);
    await load();
    refresh();
    toast.success("Product saved");
  };

  const del = async (p) => {
    if (!window.confirm(`Delete ${p.name}?`)) return;
    await remove("products", p.id);
    await log("PRODUCT_DELETE", p.name, user);
    await load();
    refresh();
  };

  return (
    <div className="space-y-4" data-testid="products-page">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-sm text-slate-500">{items.length} products · {filtered.length} shown</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button data-testid="export-products-btn" onClick={exportProducts} className="btn-ghost"><Download size={15} /> Export CSV</button>
          <button data-testid="goto-import-btn" onClick={() => nav("/import-export")} className="btn-ghost">Import Stock</button>
          {editable && <button data-testid="add-product-btn" onClick={() => setForm({ ...empty, barcode: generateCode128Value() })} className="btn-gold"><Plus size={15} /> Add Product</button>}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <input data-testid="product-search" value={term} onChange={(e) => { setTerm(e.target.value); setPage(1); }} placeholder="Search name / code / barcode" className="flex-1 min-w-[200px] border rounded-lg px-3 py-2.5 text-sm" />
        <select data-testid="category-filter" value={cat} onChange={(e) => { setCat(e.target.value); setPage(1); }} className="border rounded-lg px-3 py-2.5 text-sm">
          {["All", ...Object.keys(CATEGORY_TREE)].map((c) => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="th">
            <tr>
              <th className="text-left p-3">Code</th><th className="text-left p-3">Product</th>
              <th className="text-left p-3 hidden md:table-cell">Category</th>
              <th className="text-right p-3 hidden sm:table-cell">Cost</th>
              <th className="text-right p-3">Price</th><th className="text-right p-3">Stock</th>
              <th className="text-left p-3 hidden lg:table-cell">Barcode</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody data-testid="products-table">
            {view.map((p) => (
              <tr key={p.id} data-testid={`product-row-${p.code}`} className="border-t border-slate-100 hover:bg-slate-50/70">
                <td className="p-3 font-mono text-xs">{p.code}</td>
                <td className="p-3 font-medium">{p.name}</td>
                <td className="p-3 hidden md:table-cell text-slate-500">{p.category} / {p.subcategory}</td>
                <td className="p-3 text-right tabular-nums hidden sm:table-cell">{money(p.purchasePrice)}</td>
                <td className="p-3 text-right tabular-nums">{money(p.price)}</td>
                <td className={`p-3 text-right tabular-nums font-semibold ${p.stock <= p.minStock ? "text-red-600" : ""}`}>{p.stock}</td>
                <td className="p-3 hidden lg:table-cell"><span className="font-mono text-[11px] text-slate-500">{p.barcode}</span></td>
                <td className="p-3 text-right whitespace-nowrap">
                  {editable && <button data-testid={`edit-${p.code}`} onClick={() => setForm(p)} className="icon-btn"><Pencil size={15} /></button>}
                  {editable && <button data-testid={`delete-${p.code}`} onClick={() => del(p)} className="icon-btn text-rose-600"><Trash2 size={15} /></button>}
                </td>
              </tr>
            ))}
            {!view.length && <tr><td colSpan={8} className="p-8 text-center text-slate-400">No products found</td></tr>}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex justify-center gap-2">
          <button data-testid="prev-page" disabled={page === 1} onClick={() => setPage(page - 1)} className="border rounded-lg px-3 py-1.5 text-sm bg-white disabled:opacity-40">Prev</button>
          <span className="text-sm py-1.5">Page {page} / {pages}</span>
          <button data-testid="next-page" disabled={page === pages} onClick={() => setPage(page + 1)} className="border rounded-lg px-3 py-1.5 text-sm bg-white disabled:opacity-40">Next</button>
        </div>
      )}

      {form && (
        <div className="modal-bg">
          <form onSubmit={save} data-testid="product-form" className="modal max-w-2xl space-y-3">
            <h3 className="text-lg font-semibold">{form.id ? "Edit" : "New"} Product</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="Product Code *"><input data-testid="f-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className="inp" /></Field>
              <Field label="Product Name *"><input data-testid="f-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="inp" /></Field>
              <Field label="Category">
                <select data-testid="f-category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: CATEGORY_TREE[e.target.value]?.[0] || "" })} className="inp">
                  {Object.keys(CATEGORY_TREE).map((c) => <option key={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Subcategory">
                <input data-testid="f-subcategory" list="subcats" value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })} className="inp" />
                <datalist id="subcats">{(CATEGORY_TREE[form.category] || []).map((s) => <option key={s}>{s}</option>)}</datalist>
              </Field>
              <Field label="Purchase Price"><input data-testid="f-purchase" type="number" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} className="inp" /></Field>
              <Field label="Selling Price"><input data-testid="f-price" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} className="inp" /></Field>
              <Field label="Stock Quantity"><input data-testid="f-stock" type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} className="inp" /></Field>
              <Field label="Minimum Stock"><input data-testid="f-minstock" type="number" value={form.minStock} onChange={(e) => setForm({ ...form, minStock: e.target.value })} className="inp" /></Field>
              <Field label="Unit"><input data-testid="f-unit" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="inp" /></Field>
              <Field label="Supplier"><input data-testid="f-supplier" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} className="inp" /></Field>
              <Field label="Location / Rack"><input data-testid="f-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="inp" /></Field>
              <Field label="GST %"><input data-testid="f-gst" type="number" value={form.gst} onChange={(e) => setForm({ ...form, gst: e.target.value })} className="inp" /></Field>
              <Field label="Barcode (Code 128)">
                <div className="flex gap-2">
                  <input data-testid="f-barcode" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} className="inp" />
                  <button type="button" data-testid="generate-barcode" onClick={() => setForm({ ...form, barcode: generateCode128Value() })} className="border rounded-lg px-2 text-xs flex items-center gap-1"><QrCode size={14} /> Gen</button>
                </div>
              </Field>
              <Field label="Notes"><input data-testid="f-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="inp" /></Field>
            </div>
            {form.barcode && <div className="border rounded-lg p-2 flex justify-center" dangerouslySetInnerHTML={{ __html: barcodeSvgMarkup(form.barcode) }} />}
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" data-testid="cancel-product" onClick={() => setForm(null)} className="btn-ghost">Cancel</button>
              <button data-testid="save-product" className="btn-gold">Save Product</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const Field = ({ label, children }) => (
  <label className="block">
    <span className="text-xs text-slate-500">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);
