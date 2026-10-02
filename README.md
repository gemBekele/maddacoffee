# Ancient Halo Coffee

Coffee Processing & Export Management System for **Ancient Halo Coffee Export**.

> Full product analysis, workflows, roles and roadmap live in [`PLAN.md`](./PLAN.md).

## Stack

| Layer | Tech |
|---|---|
| API | Node.js + NestJS + Prisma |
| DB | PostgreSQL |
| Web | React + Vite + TypeScript + TailwindCSS |
| State/data | TanStack Query |
| Offline | PWA + Dexie (IndexedDB) + sync queue |
| i18n | English + Afaan Oromoo |
| Auth | JWT + role/permission (CASL-style) |

## Layout

```
MADDA ERP/
├─ apps/
│  ├─ api/       NestJS API + Prisma schema + seed
│  └─ web/       React app (mobile-first PWA)
├─ packages/
│  └─ shared/    Enums, roles/permissions, Zod schemas, numbering
├─ docker-compose.yml   optional (db/redis/minio)
└─ PLAN.md
```

## First-time setup

### 1. Install dependencies

```bash
npm install
```

### 2. Create the database

With native PostgreSQL running:

```bash
sudo -u postgres psql -c "CREATE USER madda WITH PASSWORD 'madda' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE madda OWNER madda;"
```

### 3. Configure env

```bash
cp .env.example .env
# edit .env if needed (DB URL, JWT secret, admin login, Gmail later)
```

### 4. Create schema + seed

```bash
npm run db:setup
```

This generates the Prisma client, pushes the schema, and seeds:
reference lists (`Lists` sheet), currencies, roles/permissions, and the admin user.

### 5. Run

```bash
npm run dev
```

- API: http://localhost:4000/api
- Web: http://localhost:5173
- Login: `admin@madda.local` / `Admin@12345` (from `.env`)

## Useful scripts

| Command | What |
|---|---|
| `npm run dev` | Run API + web together |
| `npm run build` | Build all workspaces |
| `npm run db:push` | Push Prisma schema to DB |
| `npm run db:seed` | Seed reference data + admin |
| `npm run db:setup` | Push + seed |

## Offline-first

The web app is an installable PWA. Writes are saved to IndexedDB first, queued in an
outbox, and synced automatically when connectivity returns. A sync status chip and a
Sync Center show pending/failed items.

## Current status (working end-to-end)

Verified locally:

- **Auth & RBAC** — JWT login, 17 roles seeded, permission checks enforced per endpoint
  (e.g. a Warehouse Officer can read inventory but gets 403 on stations/purchases).
- **Supply chain** — Cherry Purchase → Processing (auto lot id + yield %) → Inventory,
  with dashboard aggregates.
- **Sales & Export pipeline** — Buyers → Quotations → **Proforma Invoice** with workflow
  (Draft → Issued → Sent → Responded → Accepted) → **Convert to Commercial Invoice**
  (keeps the proforma reference) → Contracts → Shipments with a 12-item export document
  checklist. Emailing a proforma/commercial invoice is wired (queued until Gmail is
  configured).
- **Finance** — Payments and Expenses screens, AR/AP aging report.
- **Approvals** — Off by default; enable per item in Settings. When enabled, purchases/
  expenses/payments raise an approval request that appears in the **Approvals** queue.
- **Reports** — Purchases, Processing/yield, Inventory valuation, Sales, AR/AP aging.
- **Master data** — Stations, Suppliers/Farmers, Buyers, Users, Settings.
- **Reference data** — 50 lookups + 4 currencies + default station `ST-001` seeded.
- **Numbering** — `PUR-2026-0001`, `PRO-2026-0001`, `COM-2026-0001`, `SHP-2026-0001`, etc.
- **Web UI** — mobile-first design system, green + copper theme, EN/Afaan Oromoo switch,
  dashboard charts, workflow detail pages, offline sync chip.
- **Offline** — Dexie outbox + background sync engine (saves offline, uploads on reconnect).

### Enabling email (Gmail)
Set `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `.env` (Google account → App Passwords).
Until then, "Email to Buyer" still advances the workflow and records the message in
`email_logs` with status `Queued`.

## Demo data

To fill the whole system with realistic data (3 stations, 8 suppliers, 4 buyers,
24 purchases, 10 batches/lots/inventory, quotations, proforma invoices in every
status, commercial invoices, contracts, 3 shipments with tracking timelines and a
full document checklist, payments, expenses, approvals, users and sent emails):

```bash
npm run db:demo
```

This is safe to re-run (it clears transactional data first, keeps roles/lookups/admin).

Demo logins (all password `Password@1`): `sales@madda.local` (Sales Manager),
`finance@madda.local` (Finance Manager), `station@madda.local` (Station Manager),
`qgrader@madda.local` (QC Officer). Admin: `admin@madda.local` / `Admin@12345`.

## Run the servers

```bash
npm run db:setup   # first time only (schema + seed)
npm run dev        # API on :4000, web on :5173
```

Stop them with `Ctrl+C`, or from another shell:

```bash
fuser -k 4000/tcp 5173/tcp
```
