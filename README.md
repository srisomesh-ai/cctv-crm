# CCTV CRM

A complete CRM for a CCTV / security installation business: enquiries → quotations → installation jobs → GST invoices → payments → AMC renewals, with a mobile view for technicians.

PHP 8 + MySQL, no build step. Runs on Hostinger shared hosting (or any PHP host).

## Features

| Area | What it does |
|---|---|
| **Dashboard** | Open leads & follow-ups due, jobs today, complaints past SLA, collections, billing vs collection chart, pipeline funnel, jobs by status, technician load, AMC renewals, recent activity |
| **Leads** | Drag-and-drop pipeline (New → Contacted → Site visit → Quoted → Negotiation → Won/Lost) and list view, follow-up reminders, call / WhatsApp / visit log, duplicate-phone check, one-tap convert to customer |
| **Customers** | Full history: jobs, quotations, invoices, payments, AMC, installed equipment, notes |
| **Quotations** | Line items from the product list, GST per line, discount, CGST/SGST, A4 print / PDF, share on WhatsApp, accept → invoice or installation job in one click |
| **Invoices** | GST tax invoice with amount in words, bank/UPI details, part payments, balance, overdue |
| **Jobs** | Installations, complaints, service calls, AMC visits, site surveys · assign technician, schedule, priority · Start / Hold / Complete with work notes, customer rating and payment collected · materials used (stock reduces automatically) · before/after photos |
| **Complaints** | Service tickets with age and SLA (hours, set in Settings) |
| **Schedule** | Week calendar, filter by technician |
| **AMC** | Contracts with expiry alerts, preventive visits scheduled automatically, one-tap renewal |
| **Inventory** | Cameras, DVR/NVR, HDDs, cables, power, network, services · stock in / adjust · low-stock alerts · stock history |
| **Payments** | All money received (invoices + on-site collections) by mode |
| **Reports** | Sales & GST by month, collections, lead sources & conversion, technician performance, outstanding ageing, top items, CSV export |
| **Team** | Roles: Admin, Manager, Sales, Technician |
| **Technician app** | Mobile-first: today's jobs with Call / Navigate / Start, complete with photos and payment |
| **Search** | Ctrl + K finds customers, leads, quotations, invoices and jobs |

### Roles
| Role | Access |
|---|---|
| Admin | Everything, including team and company settings |
| Manager | All office work: jobs, invoices, payments, AMC, stock, reports |
| Sales | Leads, customers, quotations, jobs (create), AMC (view) |
| Technician | Only their own jobs (mobile view), stock list |

## Install on Hostinger

1. **hPanel → Websites → Add website** (or a subdomain such as `crm.yourdomain.com`).
2. **hPanel → Databases → MySQL**: create a database and a user (note name, user, password).
3. Upload this repository to the site folder (`public_html` of that site) — or connect it with **hPanel → Git** (auto-deploy on push).
4. In **File Manager**, copy `config.sample.php` to `config.php` and fill in the database details.
   For a public demo set `define('DEMO_MODE', true);` (one-tap role logins on the login page, "Reset demo data" in Settings).
5. Open `https://your-site/install.php` → enter company name, your name, email and password → tick **Add demo data** for a demo → **Install**.
6. Open the site and log in. Add your team under **Team**, company details (GSTIN, bank, UPI, terms) under **Settings**.

Uploaded photos are saved in `uploads/` (PHP cannot run there). `config.php` and `uploads/` are never stored in Git.

### Demo logins (when demo data is installed)
All demo users have the password `demo123`: `ravi@demo.crm` (admin), `priya@demo.crm` (manager), `anil@demo.crm` (sales), `suresh@demo.crm` (technician).
With `DEMO_MODE` on, the login page shows one-tap buttons for each role.

## Structure

```
index.html            app shell (single-page app)
install.php           one-time setup
config.sample.php     copy to config.php
api/index.php         JSON API router  (/api/?a=<action>)
api/lib/core.php      database, sessions, roles, numbering, activity log
api/lib/schema.php    tables
api/lib/seed.php      demo data (dates relative to today)
api/modules/*.php     auth & team, leads & customers, quotations/invoices/payments/stock, jobs/AMC/files, dashboard & reports
assets/css/app.css    design system
assets/js/core.js     API client, formatting, UI components, charts
assets/js/app.js      login, layout, router, search
assets/js/views/*.js  one file per screen
```

Security: password hashing, session cookies (HttpOnly, SameSite), CSRF token on every change, role checks on every API action, prepared SQL statements, login throttling, upload type checks.
