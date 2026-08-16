import { useEffect, useState } from "react";
import { all } from "@/lib/db";
import { money } from "@/lib/ops";
import { exportRowsCsv } from "@/lib/csv";

const inRange = (d, days) => new Date(d) >= new Date(Date.now() - days * 864e5);

export default function Reports() {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("sales");

  useEffect(() => {
    (async () => {
      const [allSales, purchases, products, customers, suppliers, movements] = await Promise.all(
        ["sales", "purchases", "products", "customers", "suppliers", "movements"].map((s) => all(s))
      );
      setD({ sales: allSales.filter((s) => s.status !== "void"), purchases, products, customers, suppliers, movements });
    })();
  }, []);

  if (!d) return <div className="text-slate-500">Loading…</div>;

  const sum = (arr, k = "total") => arr.reduce((s, x) => s + Number(x[k] || 0), 0);
  const period = (days) => d.sales.filter((s) => inRange(s.createdAt, days));

  const productSales = {};
  d.sales.forEach((s) => s.items.forEach((i) => {
    productSales[i.productId] = productSales[i.productId] || { name: i.name, code: i.code, qty: 0, amount: 0 };
    productSales[i.productId].qty += i.qty;
    productSales[i.productId].amount += i.qty * i.price;
  }));

  const modes = {};
  d.sales.forEach((s) => (s.payments || []).forEach((p) => { modes[p.mode] = (modes[p.mode] || 0) + Number(p.amount || 0); }));

  const TABS = [
    ["sales", "Sales Summary"], ["purchase", "Purchases"], ["profit", "Profit"],
    ["stock", "Stock"], ["low", "Low Stock"], ["outstanding", "Outstanding"],
    ["product", "Product Sales"], ["mode", "Payment Modes"], ["movement", "Stock Movement"],
  ];

  const Table = ({ head, rows, exportName }) => (
    <div className="space-y-2">
      {exportName && <button data-testid="report-export" onClick={() => exportRowsCsv(exportName, rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))))} className="border rounded-lg px-3 py-2 text-sm bg-white">Export CSV</button>}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="th"><tr>{head.map((h) => <th key={h} className="text-left p-3">{h}</th>)}</tr></thead>
          <tbody data-testid="report-table">
            {rows.map((r, i) => <tr key={i} className="border-t border-slate-100 hover:bg-slate-50/70">{r.map((c, j) => <td key={j} className="p-3">{c}</td>)}</tr>)}
            {!rows.length && <tr><td colSpan={head.length} className="p-8 text-center text-slate-400">No data</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );

  const views = {
    sales: <Table head={["Period", "Bills", "Amount"]} rows={[["Today", period(1).length, money(sum(period(1)))], ["This Week", period(7).length, money(sum(period(7)))], ["This Month", period(30).length, money(sum(period(30)))], ["All Time", d.sales.length, money(sum(d.sales))]]} />,
    purchase: <Table exportName="purchase-report.csv" head={["No", "Supplier", "Date", "Total", "Due"]} rows={d.purchases.map((p) => [p.purchaseNo, p.supplierName, new Date(p.createdAt).toLocaleDateString("en-IN"), money(p.total), money(p.due)])} />,
    profit: <Table head={["Metric", "Value"]} rows={[["Sales", money(sum(d.sales))], ["Cost of goods sold", money(sum(d.sales) - sum(d.sales, "profit"))], ["Gross Profit", money(sum(d.sales, "profit"))], ["Purchases", money(sum(d.purchases))]]} />,
    stock: <Table exportName="stock-report.csv" head={["Code", "Product", "Stock", "Cost Value", "Sale Value"]} rows={d.products.map((p) => [p.code, p.name, p.stock, money(p.stock * p.purchasePrice), money(p.stock * p.price)])} />,
    low: <Table exportName="low-stock.csv" head={["Code", "Product", "Stock", "Minimum"]} rows={d.products.filter((p) => p.stock <= p.minStock).map((p) => [p.code, p.name, p.stock, p.minStock])} />,
    outstanding: <Table exportName="outstanding.csv" head={["Type", "Name", "Phone", "Outstanding"]} rows={[...d.customers.filter((c) => Number(c.balance) > 0).map((c) => ["Customer", c.name, c.phone, money(c.balance)]), ...d.suppliers.filter((s) => Number(s.balance) > 0).map((s) => ["Supplier", s.name, s.phone, money(s.balance)])]} />,
    product: <Table exportName="product-sales.csv" head={["Code", "Product", "Qty Sold", "Amount"]} rows={Object.values(productSales).sort((a, b) => b.qty - a.qty).map((p) => [p.code, p.name, p.qty, money(p.amount)])} />,
    mode: <Table head={["Payment Mode", "Amount"]} rows={Object.entries(modes).map(([m, v]) => [m, money(v)])} />,
    movement: <Table exportName="stock-movement.csv" head={["Date", "Product", "Reason", "Qty", "New Stock", "User"]} rows={d.movements.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200).map((m) => [new Date(m.createdAt).toLocaleString("en-IN"), m.productName, m.reason, (m.type === "in" ? "+" : "-") + m.qty, m.newStock, m.user])} />,
  };

  return (
    <div className="space-y-4" data-testid="reports-page">
      <h1 className="text-2xl font-semibold tracking-tight">Reports</h1>
      <div className="flex flex-wrap gap-2">
        {TABS.map(([k, l]) => (
          <button key={k} data-testid={`rtab-${k}`} onClick={() => setTab(k)} className={`px-3.5 py-2 rounded-lg text-sm border transition-all ${tab === k ? "bg-[#101827] text-white border-[#101827]" : "bg-white border-slate-300 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>
      {views[tab]}
    </div>
  );
}
