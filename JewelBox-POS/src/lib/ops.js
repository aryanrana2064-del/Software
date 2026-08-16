import { all, one, put, putMany, uid, nowISO, nextNumber, getDB, DEVICE_ID, getSettings } from "./db";

export const money = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const log = async (action, detail, user) =>
  put("activity", {
    id: uid("log"),
    action,
    detail,
    user: user?.name || "system",
    device: DEVICE_ID,
    createdAt: nowISO(),
  });

export const queueSync = (entity, entityId, op) =>
  put("syncQueue", { id: uid("sq"), entity, entityId, op, device: DEVICE_ID, createdAt: nowISO(), status: "pending" });

export const recordMovement = async (tx, { product, qty, type, ref, user }) => {
  const prev = product.stock;
  const next = type === "in" ? prev + qty : prev - qty;
  product.stock = next;
  product.updatedAt = nowISO();
  await tx.objectStore("products").put(product);
  await tx.objectStore("movements").put({
    id: uid("mv"),
    productId: product.id,
    productName: product.name,
    qty,
    type,
    reason: ref?.reason || type,
    prevStock: prev,
    newStock: next,
    user: user?.name || "system",
    ref: ref?.id || "",
    refType: ref?.type || "",
    createdAt: nowISO(),
  });
  return next;
};

export const findByBarcodeOrCode = async (term) => {
  const t = String(term).trim();
  if (!t) return null;
  const db = await getDB();
  const byBarcode = await db.getAllFromIndex("products", "barcode", t);
  if (byBarcode.length) return byBarcode[0];
  const byCode = await db.getAllFromIndex("products", "code", t.toUpperCase());
  if (byCode.length) return byCode[0];
  return null;
};

/* ---------------- SALES ---------------- */
export const completeSale = async ({ items, customerId, discount = 0, taxPercent = 0, payments = [], note = "", user }) => {
  if (!items.length) throw new Error("EMPTY_CART");
  const settings = await getSettings();
  const db = await getDB();

  // validate stock first
  for (const it of items) {
    const p = await db.get("products", it.productId);
    if (!p) throw new Error("PRODUCT_MISSING");
    if (!settings.allowNegativeStock && p.stock < it.qty) throw new Error(`NO_STOCK:${p.name}`);
  }

  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const taxable = Math.max(subtotal - discount, 0);
  const tax = +(taxable * (taxPercent / 100)).toFixed(2);
  const total = +(taxable + tax).toFixed(2);
  const paid = +payments.reduce((s, p) => s + Number(p.amount || 0), 0).toFixed(2);
  const due = +(total - paid).toFixed(2);
  const invoiceNo = await nextNumber("invoice", settings.invoicePrefix);

  const sale = {
    id: uid("sale"),
    invoiceNo,
    customerId: customerId || "",
    customerName: "",
    items,
    subtotal,
    discount: +discount,
    taxPercent,
    tax,
    total,
    paid,
    due,
    payments,
    note,
    profit: +items.reduce((s, i) => s + (i.price - (i.purchasePrice || 0)) * i.qty, 0).toFixed(2),
    user: user?.name || "system",
    device: DEVICE_ID,
    status: "completed",
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };

  if (customerId) {
    const c = await db.get("customers", customerId);
    if (c) sale.customerName = c.name;
  }

  const tx = db.transaction(["products", "movements", "sales", "customers", "payments"], "readwrite");
  for (const it of items) {
    const p = await tx.objectStore("products").get(it.productId);
    await recordMovement(tx, { product: p, qty: it.qty, type: "out", ref: { id: sale.id, type: "sale", reason: "sale" }, user });
  }
  await tx.objectStore("sales").put(sale);
  for (const p of payments) {
    await tx.objectStore("payments").put({ id: uid("pay"), ...p, party: "customer", partyId: customerId || "", refId: sale.id, refType: "sale", createdAt: nowISO() });
  }
  if (customerId && due > 0) {
    const c = await tx.objectStore("customers").get(customerId);
    if (c) {
      c.balance = +(Number(c.balance || 0) + due).toFixed(2);
      c.updatedAt = nowISO();
      await tx.objectStore("customers").put(c);
    }
  }
  await tx.done;
  await log("SALE", `${invoiceNo} · ${money(total)}`, user);
  await queueSync("sale", sale.id, "create");
  return sale;
};

export const voidSale = async ({ saleId, reason, user }) => {
  const db = await getDB();
  const sale = await db.get("sales", saleId);
  if (!sale) throw new Error("SALE_MISSING");
  if (sale.status === "void") throw new Error("ALREADY_VOID");

  const tx = db.transaction(["products", "movements", "sales", "customers"], "readwrite");
  for (const it of sale.items) {
    const p = await tx.objectStore("products").get(it.productId);
    if (!p) continue;
    await recordMovement(tx, { product: p, qty: it.qty, type: "in", ref: { id: sale.id, type: "void", reason: "bill-void" }, user });
  }
  if (sale.customerId && sale.due > 0) {
    const c = await tx.objectStore("customers").get(sale.customerId);
    if (c) {
      c.balance = +(Number(c.balance || 0) - sale.due).toFixed(2);
      c.updatedAt = nowISO();
      await tx.objectStore("customers").put(c);
    }
  }
  const voided = {
    ...sale,
    status: "void",
    voidReason: reason,
    voidedBy: user?.name || "system",
    voidedAt: nowISO(),
    total: 0,
    paid: 0,
    due: 0,
    profit: 0,
    originalTotal: sale.total,
    updatedAt: nowISO(),
  };
  await tx.objectStore("sales").put(voided);
  await tx.done;
  await log("BILL_VOID", `${sale.invoiceNo} · ${money(sale.total)} · ${reason}`, user);
  await queueSync("sale", sale.id, "void");
  return voided;
};

/* ---------------- PURCHASE ---------------- */
export const completePurchase = async ({ supplierId, supplierInvoice = "", items, taxPercent = 0, paid = 0, user }) => {
  if (!items.length) throw new Error("EMPTY_ITEMS");
  const settings = await getSettings();
  const db = await getDB();
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const tax = +(subtotal * (taxPercent / 100)).toFixed(2);
  const total = +(subtotal + tax).toFixed(2);
  const purchaseNo = await nextNumber("purchase", settings.purchasePrefix);
  const purchase = {
    id: uid("pur"),
    purchaseNo,
    supplierId: supplierId || "",
    supplierName: "",
    supplierInvoice,
    items,
    subtotal,
    taxPercent,
    tax,
    total,
    paid: +paid,
    due: +(total - paid).toFixed(2),
    user: user?.name || "system",
    device: DEVICE_ID,
    createdAt: nowISO(),
  };
  if (supplierId) {
    const s = await db.get("suppliers", supplierId);
    if (s) purchase.supplierName = s.name;
  }
  const tx = db.transaction(["products", "movements", "purchases", "suppliers"], "readwrite");
  for (const it of items) {
    const p = await tx.objectStore("products").get(it.productId);
    if (!p) continue;
    p.purchasePrice = it.price;
    await recordMovement(tx, { product: p, qty: it.qty, type: "in", ref: { id: purchase.id, type: "purchase", reason: "purchase" }, user });
  }
  await tx.objectStore("purchases").put(purchase);
  if (supplierId && purchase.due > 0) {
    const s = await tx.objectStore("suppliers").get(supplierId);
    if (s) {
      s.balance = +(Number(s.balance || 0) + purchase.due).toFixed(2);
      await tx.objectStore("suppliers").put(s);
    }
  }
  await tx.done;
  await log("PURCHASE", `${purchaseNo} · ${money(total)}`, user);
  return purchase;
};

/* ---------------- RETURNS ---------------- */
export const createReturn = async ({ kind, refId, items, user }) => {
  const db = await getDB();
  const ret = { id: uid("ret"), kind, refId: refId || "", items, total: items.reduce((s, i) => s + i.price * i.qty, 0), user: user?.name || "system", createdAt: nowISO() };
  const tx = db.transaction(["products", "movements", "returns"], "readwrite");
  for (const it of items) {
    const p = await tx.objectStore("products").get(it.productId);
    if (!p) continue;
    await recordMovement(tx, { product: p, qty: it.qty, type: kind === "sale" ? "in" : "out", ref: { id: ret.id, type: "return", reason: kind === "sale" ? "sale-return" : "purchase-return" }, user });
  }
  await tx.objectStore("returns").put(ret);
  await tx.done;
  await log("RETURN", `${kind} return · ${money(ret.total)}`, user);
  return ret;
};

/* ---------------- STOCK ADJUST ---------------- */
export const adjustStock = async ({ productId, qty, type, reason, user }) => {
  const db = await getDB();
  const tx = db.transaction(["products", "movements"], "readwrite");
  const p = await tx.objectStore("products").get(productId);
  await recordMovement(tx, { product: p, qty: Math.abs(qty), type, ref: { type: "adjustment", reason } });
  await tx.done;
  await log("STOCK_ADJUST", `${p.name} ${type === "in" ? "+" : "-"}${Math.abs(qty)} (${reason})`, user);
};

/* ---------------- CUSTOMER PAYMENT ---------------- */
export const recordCustomerPayment = async ({ customerId, amount, mode = "Cash", note = "", user }) => {
  const db = await getDB();
  const tx = db.transaction(["customers", "payments"], "readwrite");
  const c = await tx.objectStore("customers").get(customerId);
  c.balance = +(Number(c.balance || 0) - Number(amount)).toFixed(2);
  c.updatedAt = nowISO();
  await tx.objectStore("customers").put(c);
  await tx.objectStore("payments").put({ id: uid("pay"), party: "customer", partyId: customerId, amount: +amount, mode, note, refType: "receipt", createdAt: nowISO() });
  await tx.done;
  await log("CUSTOMER_PAYMENT", `${c.name} · ${money(amount)}`, user);
};

export const changeProductPrice = async ({ product, newPrice, user }) => {
  await put("priceHistory", { id: uid("ph"), productId: product.id, productName: product.name, oldPrice: product.price, newPrice: +newPrice, user: user?.name || "system", createdAt: nowISO() });
  await put("products", { ...product, price: +newPrice, updatedAt: nowISO() });
  await log("PRICE_CHANGE", `${product.name}: ${money(product.price)} → ${money(newPrice)}`, user);
};

/* ---------------- DASHBOARD ---------------- */
const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

export const dashboardStats = async () => {
  const [products, allSales, purchases, customers, settings] = await Promise.all([
    all("products"),
    all("sales"),
    all("purchases"),
    all("customers"),
    getSettings(),
  ]);
  const sales = allSales.filter((s) => s.status !== "void");
  const today = dayKey(new Date());
  const todaySales = sales.filter((s) => dayKey(s.createdAt) === today);
  const todayPurchases = purchases.filter((p) => dayKey(p.createdAt) === today);
  const lowStock = products.filter((p) => p.stock <= (p.minStock ?? settings.minStock));

  const perDay = {};
  sales.forEach((s) => {
    const k = dayKey(s.createdAt);
    perDay[k] = (perDay[k] || 0) + s.total;
  });
  const series = [...Array(7)].map((_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const k = dayKey(d);
    return { day: d.toLocaleDateString("en-IN", { weekday: "short" }), sales: +(perDay[k] || 0).toFixed(2) };
  });

  const topMap = {};
  sales.forEach((s) => s.items.forEach((i) => {
    topMap[i.productId] = topMap[i.productId] || { name: i.name, qty: 0, amount: 0 };
    topMap[i.productId].qty += i.qty;
    topMap[i.productId].amount += i.price * i.qty;
  }));
  const top = Object.values(topMap).sort((a, b) => b.qty - a.qty).slice(0, 5);

  const catSplit = { Jewellery: 0, Boxes: 0 };
  sales.forEach((s) => s.items.forEach((i) => {
    const p = products.find((x) => x.id === i.productId);
    const cat = p?.category === "Boxes" ? "Boxes" : "Jewellery";
    catSplit[cat] += i.price * i.qty;
  }));

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - 6);
  const monthStart = new Date();
  monthStart.setDate(monthStart.getDate() - 29);

  return {
    todaySales: todaySales.reduce((s, x) => s + x.total, 0),
    todayPurchases: todayPurchases.reduce((s, x) => s + x.total, 0),
    todayProfit: todaySales.reduce((s, x) => s + (x.profit || 0), 0),
    weekSales: sales.filter((s) => new Date(s.createdAt) >= weekStart).reduce((s, x) => s + x.total, 0),
    monthSales: sales.filter((s) => new Date(s.createdAt) >= monthStart).reduce((s, x) => s + x.total, 0),
    totalProducts: products.length,
    totalUnits: products.reduce((s, p) => s + p.stock, 0),
    stockValue: products.reduce((s, p) => s + p.stock * (p.purchasePrice || 0), 0),
    lowStockCount: lowStock.length,
    lowStock: lowStock.slice(0, 8),
    customers: customers.length,
    outstanding: customers.reduce((s, c) => s + Number(c.balance || 0), 0),
    outstandingCustomers: customers.filter((c) => Number(c.balance) > 0).sort((a, b) => b.balance - a.balance).slice(0, 6),
    recentSales: [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6),
    recentPurchases: [...purchases].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
    series,
    top,
    catSplit,
  };
};
