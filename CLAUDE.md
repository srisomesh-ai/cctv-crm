# CCTV CRM — notes for Claude

CRM for a CCTV installation business (customer: SHARESPACE CCTV). PHP 8 + MySQL backend, vanilla-JS single-page app, no build step. Hosted on Hostinger.

## Where it runs
- **Live demo:** https://sitepitch.in/crm-demo/ — a COPY of this repo lives in the `crm-demo/` folder of the `srisomesh-ai/SitePitch` repo (Hostinger deploys SitePitch from its `main`).
  After changing this repo, copy the same files into `SitePitch/crm-demo/` (never `config.php` or `uploads/` contents), commit there and merge to SitePitch `main` so the demo updates.
- **Later:** moves to the customer's own domain/hosting (see README → "Move to the customer's own domain").
- `config.php` (DB details, `DEMO_MODE`) is written by `install.php` on the server and is never in Git.

## Structure
- `api/index.php` — router: `/api/index.php?a=<action>`; GET = read, POST JSON = change (needs `X-CSRF` header).
- `api/lib/core.php` — db helpers (`q/row/rows/val/insert/update`), `pick()` typed input, sessions, roles, `next_no()` numbering, `log_activity()`.
- `api/lib/schema.php` — all tables (`CREATE TABLE IF NOT EXISTS`). New columns: add to SCHEMA **and** add an "add column if missing" step for existing installs.
- `api/lib/seed.php` — demo data, dates relative to today. `demo_reset` wipes and re-seeds.
- `api/modules/*.php` — `route('action', 'GET|POST', roles, fn)`. Roles: `[]` any logged-in user, `STAFF` = admin+manager, `OFFICE` = +sales, `null` = public.
  Technicians may only touch their own jobs (`job_access()`).
- `assets/js/core.js` — `api()`, `run()`, formatting (`money`, `fdate`…), `esc()` (ALWAYS escape user data in templates), `formModal`, `drawer`, `badge`, charts, timeline.
- `assets/js/app.js` — login, layout, hash router (`ROUTES`), Ctrl+K search. Views get a fresh `#view` element each render; call `S.reload()` to redraw after a change.
- `assets/js/views/*.js` — one file per screen (leads, customers, jobs, docs = quotes/invoices/payments, amc, inventory, reports, admin, tech, dashboard).

## Gotchas
- Always call the API as `api/index.php?a=` (Hostinger returned 403 for `api/?a=` because of the folder index setting).
- Relative URLs only — the app must work both in a sub-folder (`/crm-demo/`) and at a domain root. Session cookie path = the app folder.
- Bump `?v=N` in `index.html` when JS/CSS changes so browsers reload.
- Money: totals are calculated on the server (`doc_totals()`), discount before GST, total rounded to the rupee, CGST/SGST = tax/2.
- Stock: `stock_change()` on every job material add/remove; services have `track_stock=0`.

## Testing locally
MariaDB + `php -S 127.0.0.1:8090 -t .` with a `config.php` (DEMO_MODE true), open `/install.php`, tick demo data.
Click through with Playwright (one-tap demo logins use `[data-role="admin|manager|sales|technician"]`).
