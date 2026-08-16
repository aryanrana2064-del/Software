import Papa from "papaparse";
import { all, put, uid, nowISO, byIndex } from "./db";

export const TEMPLATE_COLUMNS = [
  "Product Code",
  "Product Name",
  "Category",
  "Subcategory",
  "Purchase Price",
  "Selling Price",
  "Stock Quantity",
  "Minimum Stock",
  "Unit",
  "Barcode",
  "Supplier",
  "Location",
  "GST",
];

export const downloadFile = (filename, content, type = "text/csv;charset=utf-8;") => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const sampleTemplate = () =>
  Papa.unparse([
    TEMPLATE_COLUMNS,
    ["JR-999", "Sample Gold Ring", "Jewellery", "Rings", "800", "1400", "10", "5", "Pcs", "8901234567", "Zaveri Gold Supply", "R1", "3"],
    ["BX-999", "Sample Ring Box", "Boxes", "Ring Box", "40", "80", "100", "10", "Pcs", "8901234568", "BoxCraft Industries", "R2", "18"],
  ]);

export const parseCsv = (file) =>
  new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (res) => resolve(res.data),
      error: reject,
    });
  });

export const validateRows = async (rows) => {
  const products = await all("products");
  const byCode = new Map(products.map((p) => [String(p.code).toUpperCase(), p]));
  const seen = new Set();
  return rows.map((r, i) => {
    const errors = [];
    const code = String(r["Product Code"] || "").trim().toUpperCase();
    const name = String(r["Product Name"] || "").trim();
    const price = Number(r["Selling Price"]);
    if (!code) errors.push("Missing Product Code");
    if (!name) errors.push("Missing Product Name");
    if (!r["Selling Price"] || Number.isNaN(price)) errors.push("Invalid Selling Price");
    if (r["Stock Quantity"] && Number.isNaN(Number(r["Stock Quantity"]))) errors.push("Invalid Stock Quantity");
    const duplicateInFile = code && seen.has(code);
    if (code) seen.add(code);
    return {
      row: i + 2,
      raw: r,
      code,
      name,
      errors,
      duplicateInFile,
      existing: byCode.get(code) || null,
      valid: errors.length === 0,
    };
  });
};

export const importRows = async (checked, duplicateMode = "skip") => {
  const summary = { created: 0, updated: 0, skipped: 0, failed: 0 };
  for (const c of checked) {
    if (!c.valid || c.duplicateInFile) {
      summary.failed += 1;
      continue;
    }
    const r = c.raw;
    const base = {
      code: c.code,
      name: c.name,
      category: String(r["Category"] || "Jewellery").trim(),
      subcategory: String(r["Subcategory"] || "").trim(),
      purchasePrice: Number(r["Purchase Price"] || 0),
      price: Number(r["Selling Price"] || 0),
      stock: Number(r["Stock Quantity"] || 0),
      minStock: Number(r["Minimum Stock"] || 5),
      unit: String(r["Unit"] || "Pcs").trim(),
      barcode: String(r["Barcode"] || "").trim(),
      supplier: String(r["Supplier"] || "").trim(),
      location: String(r["Location"] || "").trim(),
      gst: Number(r["GST"] || 0),
      updatedAt: nowISO(),
    };
    if (c.existing) {
      if (duplicateMode === "skip") {
        summary.skipped += 1;
        continue;
      }
      if (duplicateMode === "update") {
        await put("products", { ...c.existing, ...base });
        summary.updated += 1;
        continue;
      }
      base.code = c.code + "-" + Math.floor(Math.random() * 900 + 100);
    }
    await put("products", { id: uid("prd"), photo: "", notes: "", createdAt: nowISO(), ...base });
    summary.created += 1;
  }
  return summary;
};

export const exportProducts = async () => {
  const products = await all("products");
  const rows = products.map((p) => ({
    "Product Code": p.code,
    "Product Name": p.name,
    Category: p.category,
    Subcategory: p.subcategory,
    "Purchase Price": p.purchasePrice,
    "Selling Price": p.price,
    "Stock Quantity": p.stock,
    "Minimum Stock": p.minStock,
    Unit: p.unit,
    Barcode: p.barcode,
    Supplier: p.supplier,
    Location: p.location,
    GST: p.gst,
  }));
  downloadFile("jewelbox-products.csv", Papa.unparse(rows));
};

export const exportRowsCsv = (filename, rows) => downloadFile(filename, Papa.unparse(rows));
