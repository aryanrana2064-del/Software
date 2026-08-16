import { all, put, putMany, uid, nowISO, DEFAULT_SETTINGS, getDB } from "./db";
import { completeSale, completePurchase } from "./ops";

const P = (code, name, category, sub, purchasePrice, price, stock, unit = "Pcs") => ({
  id: uid("prd"),
  code,
  name,
  category,
  subcategory: sub,
  photo: "",
  purchasePrice,
  price,
  stock,
  minStock: 5,
  unit,
  supplier: "",
  barcode: "890" + Math.floor(1000000 + Math.random() * 8999999),
  location: "R" + (1 + Math.floor(Math.random() * 9)),
  gst: category === "Boxes" ? 18 : 3,
  notes: "",
  createdAt: nowISO(),
  updatedAt: nowISO(),
});

export const seedIfEmpty = async () => {
  const existing = await all("products");
  if (existing.length) return false;

  await put("settings", DEFAULT_SETTINGS);
  await putMany("users", [
    { id: uid("usr"), name: "Owner", pin: "1234", role: "Owner", createdAt: nowISO() },
    { id: uid("usr"), name: "Manager", pin: "2222", role: "Manager", createdAt: nowISO() },
    { id: uid("usr"), name: "Cashier", pin: "1111", role: "Cashier", createdAt: nowISO() },
    { id: uid("usr"), name: "Staff", pin: "3333", role: "Staff", createdAt: nowISO() },
  ]);

  const products = [
    P("JR-101", "22K Gold Plated Ring", "Jewellery", "Rings", 850, 1450, 24),
    P("JE-102", "Kundan Jhumka Earrings", "Jewellery", "Earrings", 620, 1150, 18),
    P("JB-103", "Silver Charm Bracelet", "Jewellery", "Bracelets", 540, 999, 15),
    P("JC-104", "Rose Gold Chain 18in", "Jewellery", "Chains", 1200, 2100, 9),
    P("JN-105", "Temple Necklace Set", "Jewellery", "Necklaces", 2400, 4250, 4),
    P("JG-106", "Bridal Bangles Pair", "Jewellery", "Bangles", 1500, 2650, 11),
    P("BX-201", "Velvet Ring Box (Maroon)", "Boxes", "Ring Box", 38, 75, 220),
    P("BX-202", "Earring Box Cream", "Boxes", "Earring Box", 45, 90, 160),
    P("BX-203", "Necklace Box Large", "Boxes", "Necklace Box", 95, 180, 80),
    P("BX-204", "Bangle Box 4-Slot", "Boxes", "Bangle Box", 120, 230, 45),
    P("BX-205", "Pendant Box Mini", "Boxes", "Pendant Box", 30, 60, 3),
    P("BX-206", "Custom Printed Gift Box", "Boxes", "Custom Box", 150, 290, 30),
  ];
  await putMany("products", products);

  const customers = [
    { id: uid("cus"), name: "Anita Sharma", phone: "9820011111", address: "Dadar, Mumbai", openingBalance: 0, balance: 0, createdAt: nowISO() },
    { id: uid("cus"), name: "Ravi Jewellers", phone: "9820022222", address: "Pune", openingBalance: 5000, balance: 5000, createdAt: nowISO() },
    { id: uid("cus"), name: "Meera Boutique", phone: "9820033333", address: "Surat", openingBalance: 0, balance: 0, createdAt: nowISO() },
  ];
  const suppliers = [
    { id: uid("sup"), name: "Zaveri Gold Supply", phone: "9811100001", address: "Zaveri Bazaar", balance: 0, createdAt: nowISO() },
    { id: uid("sup"), name: "BoxCraft Industries", phone: "9811100002", address: "Rajkot", balance: 0, createdAt: nowISO() },
  ];
  await putMany("customers", customers);
  await putMany("suppliers", suppliers);

  const user = { name: "Owner", role: "Owner" };
  await completePurchase({
    supplierId: suppliers[1].id,
    supplierInvoice: "BC-8891",
    items: [{ productId: products[6].id, name: products[6].name, qty: 50, price: 38 }],
    taxPercent: 18,
    paid: 1000,
    user,
  });
  await completeSale({
    items: [
      { productId: products[0].id, name: products[0].name, code: products[0].code, price: 1450, qty: 1, purchasePrice: 850 },
      { productId: products[6].id, name: products[6].name, code: products[6].code, price: 75, qty: 1, purchasePrice: 38 },
    ],
    customerId: customers[0].id,
    discount: 50,
    taxPercent: 3,
    payments: [{ mode: "Cash", amount: 1521.75 }],
    user,
  });
  await completeSale({
    items: [{ productId: products[1].id, name: products[1].name, code: products[1].code, price: 1150, qty: 2, purchasePrice: 620 }],
    customerId: customers[1].id,
    discount: 0,
    taxPercent: 3,
    payments: [{ mode: "Credit", amount: 0 }],
    user,
  });

  await put("license", {
    id: "current",
    key: "JBX-7F4K-92LM-X8Q2",
    business: "JewelBox Jewellers",
    plan: "Trial",
    status: "Active",
    deviceLimit: 2,
    activatedAt: nowISO(),
    expiry: new Date(Date.now() + 14 * 864e5).toISOString(),
  });
  return true;
};
