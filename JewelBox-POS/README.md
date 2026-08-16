# JewelBox POS

**Jewellery & Jewellery Boxes — Billing, Stock & Business Management**

Offline-first, installable (PWA) point-of-sale for jewellery shops, wholesalers and jewellery-box manufacturers. All daily shop operations run fully offline from a local **IndexedDB** database — internet is optional.

## Features
- Dashboard with live figures (updates after every transaction)
- ⚡ Quick Billing: barcode scan, continuous scan mode, per-bill price change, permanent price change (Owner/Manager only), discount, tax, Cash/UPI/Card/Credit/Other, duplicate-submit protection
- Thermal receipt (58/80mm), A4 tax invoice, WhatsApp share, Auto Print toggle
- Products with categories/subcategories, GST, rack, min stock, Code 128 barcode generation + duplicate detection
- CSV Import (template → validate → preview → duplicate handling skip/update/create → summary) and CSV Export
- Bulk barcode label printing (name, code, Code 128, price)
- Purchases (stock increases), Returns (sale return +stock, purchase return −stock)
- Inventory: current stock, low stock, manual/damaged adjustments, full stock-movement ledger (prev → new stock, user, reference)
- Customers / Khata ledger with credit sales, payments, outstanding; Suppliers with outstanding
- 12 reports with CSV export
- Roles: Owner / Manager / Cashier / Staff + Activity Log
- Full JSON backup & validated restore (replace or merge — never silent deletion)
- License system: server-verified activation → local token → offline operation. Data is never deleted on expiry.

## Stack
React 19 + React Router, Tailwind CSS, IndexedDB (`idb`), Service Worker PWA, JsBarcode (Code 128), PapaParse (CSV).
Optional server: FastAPI + MongoDB for license activation/validation and the admin license API.

## Run locally
```bash
cd frontend && yarn install && yarn start     # http://localhost:3000
cd backend && pip install -r requirements.txt && uvicorn server:app --port 8001
```

## Environment variables
`frontend/.env`
```
REACT_APP_BACKEND_URL=https://your-api-host      # only used by the License screen
```
`backend/.env`
```
MONGO_URL=mongodb://localhost:27017
DB_NAME=jewelbox
LICENSE_SECRET=change-me                 # signs offline activation tokens
LICENSE_ADMIN_SECRET=change-me           # required by /api/admin/licenses (server-side only)
CORS_ORIGINS=*
```
No secret is ever shipped to the browser.

## Vercel deploy
Root directory `frontend`, build `yarn build`, output `build`. `frontend/vercel.json` rewrites all routes to `index.html`, so `/dashboard`, `/billing`, `/products` … never 404 on refresh, and `sw.js` is served without caching.

## PWA install
Android Chrome → ⋮ → *Install app*. Desktop Chrome/Edge → install icon in the address bar. After first load the app shell is cached and works offline.

## Demo logins
| User | PIN | Access |
|---|---|---|
| Owner | 1234 | Everything |
| Manager | 2222 | Products, Inventory, Sales, Purchases, Reports |
| Cashier | 1111 | Quick Billing + Customers |
| Staff | 3333 | Quick Billing only |

Demo license key: `JBX-7F4K-92LM-X8Q2` (Trial, 14 days, 2 devices).
Demo products, customers, suppliers, one purchase and two sales are seeded on first run.

## Multi-device note
Each device keeps its own IndexedDB database, so two disconnected devices do **not** share live stock. Every record carries an id, device id and timestamps, and writes are mirrored into a `syncQueue` store, so a LAN server or cloud sync can be added later with conflict detection instead of blind overwrites.

## Printing note
Printing uses the browser print dialog (thermal 58/80mm CSS page sizes and A4). Browsers do not allow silent direct printer access from a web page; select your thermal printer in the dialog once and enable "remember".
