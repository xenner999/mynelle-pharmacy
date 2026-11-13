# Mynelle's Pharmacy

A browser-based pharmacy system: **admin dashboard** (inventory, sales, reports, analytics, alerts, accounts, settings) and a **cashier terminal** (time tracker + POS).
It is a plain static site (HTML, CSS and JavaScript). There is no build step and no server.

## Folder layout

```
index.html            Start page (choose Cashier terminal or Admin)
404.html              "Page not found" page (works on GitHub Pages sub-paths)
clear-data.html       Utility page to wipe this browser's saved data
.nojekyll             Tells GitHub Pages to serve files as-is
assets/               Logo, background image, icon font
main/
  html/               Admin pages (Login.html, dashboard.html, inventory.html, ...)
  css/                Admin styles
  js/                 Admin scripts + shared modules (settings-store.js, auth-store.js, ...)
pos/
  html/               Cashier pages (timetracker.html, pos.html, performance.html)
  css/ js/            POS styles and scripts
netlify.toml          Optional - only used if you also host on Netlify
```

## Deploy to GitHub Pages

1. Create a new repository on GitHub (for example `mynelles-pharmacy`).
2. Upload everything in this folder to it (see "Uploading" below).
3. In the repository go to **Settings -> Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose branch **main** and folder **/ (root)**, then **Save**.
5. After a minute your site is live at `https://<your-username>.github.io/<repository-name>/`.

### Uploading

This project has more than 100 files, and GitHub's drag-and-drop upload accepts at most 100 at a time. Use one of these instead:

**GitHub Desktop** - File -> Add local repository (or Clone), copy the project into the folder, commit, push.

**Command line**

```bash
cd mynelles-pharmacy          # the folder that contains index.html
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/<repository-name>.git
git push -u origin main
```

### Updating the live site later

Commit and push your changes. GitHub Pages redeploys automatically (it can take a minute; use a hard refresh - Ctrl/Cmd+Shift+R - if you still see the old version).

## Run it on your own computer

Open `index.html` directly, or serve the folder (recommended):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Important things to know

- **Data is stored in each browser (localStorage).** Products, sales, accounts and settings live only on the device and browser that created them. Another computer, another browser, or "clear site data" starts empty. Use **Settings -> Export data** to back up and **Import** to restore.
- **First admin account.** There is no public registration. On first run the app creates one admin (username `admin`, password `Mynelle@2026`). Sign in with it, then use **Profile -> Manage accounts -> Admin accounts** to create other admins and change this password under **Profile -> My account**.
- **The login is not real security.** Because this is a static site, accounts and PINs are checked in the browser. Do not store real patient or payment information, and do not treat the login as protection on a public URL.
- **No backend is called on GitHub Pages.** The app automatically uses its built-in local storage there. If you add a real backend later, set `window.MYNELLE_BACKEND = true` before `auth-store.js` loads.
- **File names are case-sensitive on GitHub Pages.** `Login.html` starts with a capital letter - keep links in the same case.
- Pages include a `noindex` tag so search engines skip the site.

## Mynelle Assistant (local chatbot)

Every admin page (except Login) has an **Ask** button at the bottom-right (shortcut: **Ctrl+/**, close with **Esc**).
It answers questions about the system's own data: sales and comparisons, best/slowest sellers, categories, payment methods, busiest hours,
cashier performance, low/out-of-stock, expiring/expired batches, expiry-loss risk, run-out forecast, reorder suggestions, purchase orders,
inventory value, estimated profit, 7-day sales forecast, product look-ups (stock, price, batches, sales) and "how do I..." pointers.

- It is **fully local**: no AI service, no internet, no API key. It reads the same browser storage as the rest of the app.
- Files: `main/js/chatbot.js` (engine + UI) and `main/css/chatbot.css`. To add it to a new admin page, put `<script src="../js/chatbot.js"></script>` after `ui-assist.js`.
- Cashiers do not get it (they only use the POS).
- The conversation is kept per browser tab (sessionStorage) so it survives page changes; use the trash icon to clear it.
- To add a new question type, add a handler to `H` and a line to `INTENTS` in `chatbot.js`.
- Profit figures are estimates (last purchase-order cost, otherwise 70% of selling price) because products don't store a purchase cost.

## Brand colors

The palette comes from the logo (Adobe Color extraction). Roles:

| Color | Hex | Used for |
|---|---|---|
| Royal blue | `#0442BF` | Main brand color: active menu item, links, POS buttons, "MYNELLE'S" lettering |
| Red | `#D90416` | "Pharmacy" lettering, danger actions, **out of stock** |
| Vivid blue | `#0511F2` | **Expiring soon**, strong accents and focus highlights |
| Sky blue | `#05AFF2` | Cart-blue highlights, charts, info tints |
| Near-black | `#0D0D0D` | Text, primary dark buttons, dark theme background |

Support colors that are not in the logo: orange `#D9640F` (**low stock**) and green `#22A06B` (healthy / success).
Lighter and darker shades of the blues and red (hover states, tints, borders) are derived from the five brand colors.
Stock status colors live at the top of `main/css/stock-status.css`; most other colors are CSS variables at the top of each stylesheet in `main/css/` and `pos/css/`.

## Customising

- Stock status colors (out of stock / low stock / expiring soon): top of `main/css/stock-status.css`.
- Minimum shelf life when adding stock (default 12 months): `MIN_EXPIRY_MONTHS` in `main/js/inventory.js`.
- Which buttons ask for confirmation: `main/js/confirm-hooks.js`.
- Phone/tablet layout: `main/css/responsive.css` (admin) and the bottom of `pos/css/pos.css` plus `pos/js/pos-mobile.js` (cashier: products-first layout, sticky order bar, bigger tap targets).
- Print buttons and print layout: `main/js/print-records.js` and `main/css/print.css`.
- Cashier "My Performance" page: `pos/html/performance.html` (daily goal is saved per cashier in the browser).

## Supabase (shared database)

Data is synced to Supabase so every device sees the same products, sales, accounts, time logs and settings.

1. In Supabase open **SQL Editor**, paste `supabase-setup.sql`, and run it (creates the `app_kv` table).
2. In `main/js/supabase-sync.js` set `SUPABASE_URL` to your project URL (Project Settings -> API). The publishable key is already filled in.
3. Deploy. Cashier sessions, held carts and goals stay per-device.

Security note: with no Supabase Auth, anyone who has the site's key can read/write `app_kv` (including account password hashes). Fine for a demo; for real use, move logins to Supabase Auth and tighten the RLS policies.
