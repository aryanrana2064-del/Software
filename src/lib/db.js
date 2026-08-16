import { openDB } from "idb";

const DB_NAME = "jewelbox-pos";
const DB_VERSION = 1;

export const STORES = [
  "products",
  "categories",
  "customers",
  "suppliers",
  "sales",
  "purchases",
  "payments",
  "returns",
  "movements",
  "priceHistory",
  "activity",
  "users",
  "settings",
  "counters",
  "syncQueue",
  "license",
];

export const DEVICE_ID = (() => {
  let d = localStorage.getItem("jbx_device_id");
  if (!d) {
    d = "DEV-" + Math.random().toString(36).slice(2, 10).toUpperCase();
    localStorage.setItem("jbx_device_id", d);
  }
  return d;
})();

export const uid = (p = "id") =>
  `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const nowISO = () => new Date().toISOString();

let dbp;
export const getDB = () => {
  if (!dbp) {
    dbp = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        STORES.forEach((name) => {
          if (db.objectStoreNames.contains(name)) return;
          const keyPath = name === "settings" || name === "counters" ? "key" : "id";
          const store = db.createObjectStore(name, { keyPath });
          if (name === "products") {
            store.createIndex("barcode", "barcode");
            store.createIndex("code", "code");
            store.createIndex("category", "category");
          }
          if (name === "sales" || name === "purchases" || name === "movements") {
            store.createIndex("createdAt", "createdAt");
          }
        });
      },
    });
  }
  return dbp;
};

export const all = async (store) => (await getDB()).getAll(store);
export const one = async (store, id) => (await getDB()).get(store, id);
export const put = async (store, value) => {
  const db = await getDB();
  await db.put(store, value);
  return value;
};
export const putMany = async (store, values) => {
  const db = await getDB();
  const tx = db.transaction(store, "readwrite");
  values.forEach((v) => tx.store.put(v));
  await tx.done;
  return values;
};
export const remove = async (store, id) => (await getDB()).delete(store, id);
export const clearStore = async (store) => (await getDB()).clear(store);
export const byIndex = async (store, index, value) =>
  (await getDB()).getAllFromIndex(store, index, value);

export const nextNumber = async (key, prefix) => {
  const db = await getDB();
  const tx = db.transaction("counters", "readwrite");
  const cur = (await tx.store.get(key)) || { key, value: 0 };
  cur.value += 1;
  await tx.store.put(cur);
  await tx.done;
  return `${prefix}${String(cur.value).padStart(4, "0")}`;
};

export const DEFAULT_SETTINGS = {
  key: "settings",
  businessName: "JewelBox Jewellers",
  logo: "",
  address: "12 Zaveri Bazaar, Mumbai 400002",
  phone: "+91 98200 11223",
  gstin: "27ABCDE1234F1Z5",
  invoicePrefix: "INV-",
  purchasePrefix: "PUR-",
  defaultTax: 3,
  defaultPayment: "Cash",
  autoPrint: false,
  minStock: 5,
  allowNegativeStock: false,
  receiptWidth: "80mm",
  currency: "₹",
};

export const CATEGORY_TREE = {
  Jewellery: ["Rings", "Earrings", "Chains", "Necklaces", "Bracelets", "Bangles", "Accessories"],
  Boxes: ["Ring Box", "Earring Box", "Necklace Box", "Bangle Box", "Pendant Box", "Custom Box"],
};

export const getSettings = async () => (await one("settings", "settings")) || DEFAULT_SETTINGS;
