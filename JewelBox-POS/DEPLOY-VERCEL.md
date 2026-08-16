# Deploy JewelBox POS on Vercel (5 minutes)

This ZIP is already Vercel-ready: the React app is at the **project root**, so Vercel needs no extra settings.

## Option A — Vercel Dashboard (easiest)
1. Unzip `JewelBox-POS.zip`.
2. Go to https://vercel.com/new → **Import Third-Party Git Repository** or drag-drop the folder (Vercel CLI method below is more reliable for drag-drop).
3. Framework Preset: **Create React App** (auto-detected). Build command `yarn build`, output directory `build`.
4. Environment Variables (optional — only used by the License screen):
   - `REACT_APP_BACKEND_URL` = your API URL (leave empty if you don't use the license server)
5. Click **Deploy**. Done.

## Option B — Vercel CLI
```bash
npm i -g vercel
cd JewelBox-POS
vercel            # preview
vercel --prod     # production
```

## What is already configured
- `vercel.json` → rewrites every route to `index.html`, so `/dashboard`, `/billing`, `/products` … never show a 404 on refresh; `sw.js` is served with no-cache.
- `public/manifest.webmanifest` + `public/sw.js` + icons → installable PWA, works offline.
- All shop data lives in the browser (IndexedDB), so the deployed site needs **no database** to run billing.

## Optional license/API server (folder `server/`)
Only needed if you want to sell licenses. Deploy `server/` (FastAPI + MongoDB) on Render/Railway/Fly, then set `REACT_APP_BACKEND_URL` in Vercel to that host. Secrets (`LICENSE_SECRET`, `LICENSE_ADMIN_SECRET`) stay on the server — never in the frontend.

## After deploy
- Open the URL → login `Owner / 1234`.
- Chrome desktop: install icon in address bar. Android Chrome: ⋮ → Install app.
- Turn off wifi and reload — billing keeps working.
