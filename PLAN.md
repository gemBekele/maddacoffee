# MADDA ERP — Coffee Processing & Export Management System

**Client:** Ancient Halo Coffee Export (Ethiopia)
**System name:** MADDA
**Status:** Planning / Analysis (no code yet)
**Stack decided:** Node.js + React + PostgreSQL

---

## 1. What this is

MADDA is a full ERP for an Ethiopian coffee exporter that currently runs its whole
operation on one Excel workbook (`Ancient_Halo_Coffee_ERP_v Ebsa final.xlsx`).
The Excel tracks cherry purchases, processing, inventory, sales and payments, but it
has no access control, no audit trail, no real lot traceability, no document
generation (proforma / commercial invoice), no email, and no multi-user safety.

MADDA will replace the workbook **and expand beyond it** into a proper multi-user,
role-based, auditable system with document + email automation.

---

## 1a. Confirmed client decisions (locked)

These came from the client and override the earlier open questions.

| Topic | Decision |
|---|---|
| **Entry point of the system** | Buying coffee from farmers/sellers (cherry intake). A **Customer/Supplier profile** (name, ID, contact, bank) exists first, then intake, weighing, KG recording, then washing/drying/processing. |
| **Currency** | Every money field supports a currency **dropdown** (USD, ETB, and extensible — EUR, GBP). Store the currency per record; convert using a stored FX rate. Default ETB for local, USD for export. |
| **Numbering rules** | Client has none → **MADDA defines sane defaults**, but they are fully configurable in Admin Settings (prefix, year, padding, reset). See §8.1. |
| **Approvals** | **Default = no approval** for payments/expenses. Approval is an **opt-in per module** configured in Admin/CEO Settings with optional thresholds. When off, entries post immediately. |
| **Visibility** | Everyone sees **only what they are assigned** (record-level scoping by station/module) plus their role's read scope. |
| **Email** | Set up now; use the client's **Gmail** account for now, switch to a custom domain later. Provider interface so it's swappable. |
| **Existing data** | **No external data source.** Use whatever data exists in the Excel; otherwise start clean. (Workbook is currently empty templates except Station/Lists.) |
| **Bank/LC document tracking** | **Yes** — build LC + bank document presentation tracking. Changeable later if unused. |
| **Certifications** (Organic/Fairtrade/Rainforest/EUDR) | **Skip for now** — not in scope unless requested later. |
| **Languages** | **Afaan Oromoo + English**. Full i18n from day one (all UI strings + generated docs where needed). |
| **Deployment** | **Local now**, server later. Must run entirely on a local machine/LAN with no cloud dependency. |
| **Users / devices** | Unknown count → design **mobile-first / device-friendly**, especially phones. |
| **Offline support** | **Heavy local storage / offline-first**: many stations have no connectivity. Staff must record a full day of data locally and have it **sync/upload when internet returns**. See §15. |
| **UI direction** | Based on the provided inspiration (clean SaaS dashboard): collapsible left sidebar, top search bar, KPI stat cards, filter/sort toolbar, data table with status pills, floating bulk-action bar. **Clean, calm, generous whitespace, one accent color, rounded corners, light borders.** Phone-first layouts (bottom nav / drawer, card lists). See §16. |

---

## 2. Analysis of the current Excel workbook

The workbook has **12 sheets**. Each maps to a module.

| Sheet | Columns observed | Purpose | MADDA module |
|---|---|---|---|
| CEO Dashboard | KPIs, station performance, expense breakdown, monthly revenue | Executive overview via formulas | Analytics / Executive Dashboard |
| Station Register | Station ID, Name, Region, Zone/Woreda, Location, Manager, Capacity, Start Date, Status, Notes | Master list of washing/processing stations | Stations & Facilities |
| Supplier Register | Supplier ID, Name, Type, Phone, Location, Bank info, Status, Notes | Farmers / cooperatives / collectors | Suppliers & Farmers |
| Cherry Purchases | Purchase ID, Date, Station, Supplier, Receipt No, Cherry KG, Price/Unit, Total, Payment Status, Payment ID, Harvest Year, Notes | Cherry intake + cost | Procurement |
| Processing | Batch ID, Date, Station, Lot ID, Input Ref, Process, Cherry In, Parchment Out, Dry Parchment, Green Out, Moisture %, Grade, Screen Size, Yield %, Cupping Score, Status, Notes | Conversion cherry→green | Processing / Milling |
| Payments | Payment ID, Date, Station, Payee, Type, Reference ID, Amount, Method, Status, Notes | Money out | Payments / Finance |
| Station Expenses | Expense ID, Date, Station, Category, Description, Ref, Amount, Payment ID, Status, Notes | Operating costs | Expenses |
| Inventory | Inventory ID, Date, Station, Lot ID, Coffee Type, Process, Grade, Screen Size, Qty KG, Warehouse, Unit Cost, Inventory Value, Status, Notes | Green stock | Inventory / Warehouse |
| Sales Export | Sale ID, Date, Buyer, Contract/Invoice No, Lot ID, Station, Qty KG, FOB USD/KG, Sales Value USD, FX Rate, Sales Value ETB, Export/Shipping Cost, Other Costs, Total Cost, Gross Profit, Payment Status, Notes | Export sales | Sales & Export |
| Lot Traceability | Lot ID, Station, Origin, Harvest Year, Process, Grade, Screen Size, Cherry In, Green Out, Supplier/Purchase IDs, Batch IDs, Cupping Score, Current Inventory KG, Buyer/Sale ID, Status | Farm-to-buyer traceability | Traceability |
| Lists | Dropdown values (statuses, processes, grades, expense categories, payment methods, supplier types) | Reference data | Reference / Lookups |
| Dashboard Data | Pre-aggregated expense category, process, grade, monthly revenue/gross profit | Chart feeding | Analytics backend |

### What the Excel gets right (keep these concepts)
- **Station-centric** model — everything keys back to a Station ID.
- **Chain of custody**: Purchase → Processing Batch → Inventory → Sale → Lot.
- Clear **status enums** already defined in `Lists` (use as seed data).
- Cost/profit logic per station and per lot.

### Gaps / weaknesses MADDA fixes
1. No users, roles, or permissions — anyone with the file can edit anything.
2. No audit trail — no who/what/when history.
3. Lot traceability is manual and fragile (IDs typed by hand).
4. No document generation (proforma → commercial invoice, packing list, contracts).
5. No email automation to buyers/banks.
6. No invoice numbering rules enforced.
7. No multi-currency ledger (USD/EUR FOB + ETB costs) with FX handling.
8. No approval workflows (payment approval, expense approval, credit/price approval).
9. No data validation beyond dropdowns; no referential integrity.
10. No attachments (contracts, receipts, certificates, quality reports).
11. Dashboard is formula-bound to fixed 500-row ranges.
12. No external system integration (ECTA/ECX references, bank/LC, customs).
13. Single file = single point of failure, no concurrency.

---

## 3. Domain research — how Ethiopian coffee export really works

### 3.1 Actors
- **ECTA** — Ethiopian Coffee & Tea Authority: licensing (Certificate of Competency),
  quality grading/cupping (Coffee Liquoring Unit / CLU), export contract registration
  (transferred from NBE effective May 1, 2025), export permits now processed by any
  commercial bank.
- **ECX** — Ethiopian Commodity Exchange: mandatory trading for commercial grade
  (roughly Grade 3–9); Grades 1–2 specialty may use the **Direct Specialty License (DSL)**
  / vertical integration to bypass ECX.
- **NBE** — National Bank of Ethiopia: FX rules, repatriation, blacklist monitoring.
- **MoA / EPHI** — phytosanitary certificates.
- **Ethiopian Chamber of Commerce** — certificate of origin (GSP/AGOA/EBA).
- **Ethiopian Customs Commission** — export declaration (CBE-1 / Goods Declaration).
- **Commercial bank** — LC/CAD handling, export permit, ERN (Export Registration Number).
- **Buyers/importers** — roasters, traders, importers abroad.
- **Stations / washing stations**, **suppliers/farmers/cooperatives/collectors**.

### 3.2 The commercial + export lifecycle (what MADDA must model)
1. **Sourcing / sampling** — buyer requests samples; exporter sends offer sample + lot sheet.
2. **Pre-contract** — negotiation of origin, grade, process, volume, price (FOB Djibouti
   by default, CIF optional), payment terms, shipment window, Incoterms, packing/marks.
3. **Quotation → Proforma Invoice** — non-binding estimate: seller/buyer details, goods
   description, estimated qty/price, validity period, payment terms, port of loading/
   discharge, Incoterm. Used for NBE/bank review. **Has a proforma number.**
4. **Sales contract** — binding; incoterm, quality tolerances, arbitration, documents list.
   Contract registered with **ECTA** (was NBE) within 24h; copy to commercial bank.
5. **LC / payment instrument** — buyer bank issues LC, or CAD / advance / TT structure.
6. **Goods preparation** — milling, grading, CU/CLU quality certificate, bagging (60 kg
   jute/GrainPro), marking.
7. **Documentation** — commercial invoice (must reference proforma/contract no.),
   packing list, CLU quality certificate, phytosanitary cert, ICO certificate of origin,
   chamber certificate of origin, customs declaration, bank/NBE export permit, B/L or AWB,
   insurance certificate, weight + fumigation certificates, EUDR due-diligence statement
   (EU-bound, geolocation required).
8. **Customs clearance & shipment** — through Djibouti port or Bole airport.
9. **Document presentation to bank** — collect payment per LC/CAD.
10. **Payment settlement & repatriation** — repatriate proceeds; surrender/retain per NBE
    directive; close export file; post-export record retention (5 years).

### 3.3 Proforma vs Commercial invoice (key rule for MADDA)
- **Proforma** = pre-sale, **non-binding estimate**. Can be revised/reissued.
- **Commercial invoice** = post-shipment, **legally binding**, used by customs for
  valuation; exact qty/price, HS code, origin, Incoterm, references the proforma/contract.
- MADDA rule: a proforma **converts to** a commercial invoice, **keeping the same core
  invoice number** and carrying the proforma reference, with a status transition and full
  history. Quantities/prices may differ and must be logged (revision + reason).

### 3.4 Grading & processing knowledge (for validation/defaults)
- Grades: **Grade 1–5** (Excel uses 1–5; ECU/ECX scale is G1–G9). Store as configurable.
- Processes: **Natural, Washed, Honey, Anaerobic, Other**.
- Typical yields (use as sanity-check warnings, not hard rules):
  - Fresh cherry → green bean ≈ **18–22%** (washed ≈20%, natural ≈22%, honey ≈21%).
  - Cherry → parchment ≈ 50%; parchment → green ≈ 80%.
  - Dried cherry → green ≈ 44% (arabica).
- Cupping: SCA 100-point; **80+ = specialty**.
- Moisture target ≈ 10–12%.

---

## 4. Proposed architecture & tech stack

**Monorepo** (pnpm workspaces + Turborepo):

```
MADDA ERP/
├─ apps/
│  ├─ api/          NestJS + TypeScript + Prisma
│  └─ web/          React + Vite + TypeScript
├─ packages/
│  ├─ shared/       Zod schemas, types, enums, invoice-number logic
│  └─ config/       eslint/tsconfig/tailwind presets
├─ docker-compose.yml   Postgres + Redis + MinIO
├─ PLAN.md
└─ README.md
```

- **Backend:** Node.js + **NestJS** (modules align to ERP domains, first-class guards for
  RBAC, DI, validation pipes). Prisma ORM.
- **DB:** **PostgreSQL**. Prisma migrations + seed for `Lists` reference data.
- **Frontend:** React + Vite, TypeScript, **TanStack Query** + **TanStack Table**,
  React Router, **TailwindCSS + shadcn/ui**, Recharts for dashboards.
- **Offline/PWA:** installable **PWA** + **Dexie.js (IndexedDB)** local store + background
  sync engine with an outbox queue (see §15).
- **i18n:** react-i18next with `en` + `om` (Afaan Oromoo) catalogs (see §17).
- **Auth:** JWT access + refresh, argon2 password hashing, **CASL** for fine-grained
  permissions (role + resource + action).
- **Documents/PDF:** React-PDF (or Puppeteer/HTML→PDF) for proforma, commercial invoice,
  packing list, contracts, certificates — branded templates.
- **Email:** Nodemailer + MJML templates, queued with **BullMQ + Redis**; provider adapter
  (Resend/SES/SendGrid). Inbound email logging if needed later.
- **Files:** S3-compatible storage (MinIO locally, S3 in prod) for contracts, certificates,
  receipts, quality reports; signed URLs.
- **Validation:** Zod schemas shared between API and web.
- **Audit:** append-only audit log table + interceptor logging every mutation.
- **Testing:** Vitest (unit), Supertest (API), Playwright (E2E).
- **Observability:** pino structured logs; request IDs.
- **Jobs:** nightly dashboard aggregation snapshots, FX-rate fetch, payment reminders,
  contract-expiry alerts, stock reorder alerts.
- **Deploy:** Docker; CI via GitHub Actions; env-based config.

---

## 5. Module breakdown (MVP → Phase 2)

Legend: **M** = MVP, **2** = later.

### Foundation
- **M** Auth & Users (login, refresh, password reset, sessions)
- **M** Roles & Permissions (RBAC + CASL policies)
- **M** Reference/Lookup data (processes, grades, statuses, expense categories, payment
  methods, supplier types — seeded from `Lists`)
- **M** Company & Branch/Station profile
- **M** Audit log
- **M** Attachments/file storage

### Supply side
- **M** **Stations & Facilities** (Station Register)
- **M** **Suppliers & Farmers** (Supplier Register; farmer/coop/collector types, bank info)
- **M** **Procurement / Cherry Purchases** (intake with receipt no, qty, price, totals)
  - Cherry reception form: farmer, station, weight, moisture, quality, price, receipt print.
  - Approval + payment status; link to Payment.
- **M** **Processing / Milling** (batches; cherry→parchment→dry parchment→green; yield %,
  grade, screen, moisture, cupping; input/output links)
- **M** **Inventory / Warehouse** (lots, qty, location, unit cost, value, status moves,
  stock ledger in/out)
- **M** **Lot Traceability** (auto-generated lot IDs; full chain purchase↔batch↔inventory↔sale;
  QR code per lot; EUDR geolocation fields)

### Sell side
- **M** **Buyers/Customers** (international buyers, contacts, Incoterms, currencies)
- **M** **Quotations** (offer to buyer, validity, sample link)
- **M** **Proforma Invoices** (build/issue, number series, email to buyer)
- **M** **Sales Contracts** (binding contract, ECTA/registration ref, document checklist)
- **M** **Commercial Invoices** (convert from proforma keeping number; ship details, HS code,
  Incoterm, B/L, exact qty/price; revision history)
- **M** **Sales / Export Orders** (Sales Export sheet: FOB USD/kg, FX, USD & ETB value,
  costs, gross profit, payment status)
- **M** **Shipping & Logistics** (container/consignment, port, B/L/AWB, cert checklist)
- **M** **Export Documentation** (auto-assembled doc set + uploaded certs; per-shipment
  status tracker)
- **2** Sample management & cupping offers
- **2** Price lists & market price tracking (ECX/daily)

### Money
- **M** **Expenses** (Station Expenses; categories, approvals)
- **M** **Payments** (in/out; methods incl. Cash, Bank Transfer, CBE Birr; links to
  purchases/expenses/sales)
- **M** **Finance / Accounting-lite** (AR/AP aging, multi-currency USD/EUR/ETB, FX gains/losses,
  repatriation tracking, profitability per lot/station/customer)
- **2** Full double-entry GL (if needed)
- **2** Tax/VAT zero-rated export handling & VAT refund tracking

### Intelligence & Comms
- **M** **Executive Dashboard** (CEO KPIs, station performance, charts) — replaces formulas
- **M** **Reports** (purchases, processing yield, inventory valuation, sales, P&L by
  station/lot/buyer, aging, traceability report)
- **M** **Notifications & Email** (proforma/commercial invoice email, payment due, low stock,
  contract expiry, approval requests; templated, queued, logged)
- **2** In-app notification center
- **2** Export to PDF/Excel/CSV

---

## 6. Role & permission model

Use **RBAC with deny-by-default**, plus optional per-record scoping (e.g., a Station Manager
only sees their station). Roles are composable; permissions are `resource:action`.

### Roles

| Role | Who | Core responsibilities |
|---|---|---|
| **Super Admin** | IT | Users, roles, settings, integrations. No business data entry by default. |
| **CEO / Owner** | Founder | Read everything; approve high-value payments/contracts; executive dashboard. |
| **General Manager** | Ops head | Full operational oversight; approve purchases/expenses/contracts; all reports. |
| **Finance Manager** | Finance | Payments, AR/AP, FX, repatriation, profitability, financial reports. |
| **Accountant** | Finance | Enter/reconcile payments & expenses; prepare reports. |
| **Sales/Export Manager** | Sales | Buyers, quotations, contracts, pricing, approve proformas, oversee shipments. |
| **Sales/Export Officer** | Sales | Build quotations/proformas; coordinate documents & shipping. |
| **Export Documentation Officer** | Docs | Assemble export doc set, certs, customs/bank paperwork, file tracking. |
| **Procurement Manager** | Supply | Suppliers, purchase approvals, cherry pricing. |
| **Station Manager** | Station | Runs a station: cherry intake, processing, local expenses; sees own station. |
| **Cherry Receiver / Field Officer** | Station | Registers cherry deliveries, weighs, records farmer, prints receipt. |
| **Processing Supervisor** | Mill | Records processing batches & conversions. |
| **Quality / Cupping Officer (Q-grader)** | QC | Grades, moisture, cupping scores, quality certificates. |
| **Warehouse / Inventory Officer** | Stores | Stock in/out, locations, counts, lot status. |
| **Logistics / Shipping Officer** | Logistics | Containers, port, B/L, freight, shipment status. |
| **HR/Admin** | Admin | Staff records, station expense categories config (optional). |
| **Auditor** | Internal/External | Read-only access to all records + audit trail. |

### Permission matrix (excerpt)

| Capability | SuperAdmin | CEO | GenMgr | FinMgr | SalesMgr | ProcMgr | StationMgr | Reconciler | Q-grader | Warehouse | Auditor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Manage users/roles | ✅ | – | – | – | – | – | – | – | – | – | – |
| View all dashboards | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | own | ✅ | – | – | ✅ |
| Create cherry purchase | – | – | ✅ | – | – | ✅ | ✅ | ✅ | – | – | – |
| Approve purchase/payment | – | ✅ | ✅ | ✅ | – | ✅ | – | – | – | – | – |
| Enter processing batch | – | – | ✅ | – | – | – | ✅ | ✅ | – | – | – |
| Record grade/cupping | – | – | – | – | – | – | – | – | ✅ | – | – |
| Inventory movements | – | – | – | – | – | – | ✅ | – | – | ✅ | – |
| Create proforma invoice | – | – | ✅ | – | ✅ | – | – | – | – | – | – |
| Approve/send proforma | – | ✅ | ✅ | – | ✅ | – | – | – | – | – | – |
| Convert to commercial invoice | – | – | ✅ | – | ✅ | – | – | – | – | – | – |
| Manage contracts | – | ✅ | ✅ | – | ✅ | – | – | – | – | – | – |
| Record payments/expenses | – | – | ✅ | ✅ | – | – | ✅ | ✅ | – | – | – |
| View finance reports | – | ✅ | ✅ | ✅ | – | – | – | ✅ | – | – | ✅ |
| Shipments/logistics | – | – | ✅ | – | ✅ | – | – | – | – | ✅ | – |
| View audit log | ✅ | ✅ | – | – | – | – | – | – | – | – | ✅ |

(Full matrix will be finalized in `packages/shared` as CASL rules.)

---

## 7. Core workflows (state machines)

### 7.1 Cherry → Green (production)
```
Purchase (Draft → Confirmed → Paid)
   └─> Processing Batch (Planned → Processing → Completed → QC Passed/Rejected)
          └─> Inventory Lot (Available → Reserved → Sold / Damaged → Released)
                 └─> Lot Traceability record (Active → Exported)
```

### 7.2 Sales → Export (commercial)
```
Inquiry → Quotation (Draft → Sent → Accepted/Expired)
             └─> Proforma Invoice (PRO-YYYY-####) [Draft → Issued → Sent → Accepted → Converted/Cancelled]
                    └─> Sales Contract (Draft → Signed → Registered w/ ECTA)
                           └─> Commercial Invoice (same number, COM-... status) [Draft → Issued → Sent → Paid]
                                  └─> Shipment (Preparing → Docs Ready → Cleared → Shipped → Delivered)
                                         └─> Payment (Pending → Partial → Paid) → Repatriation → Closed
```

### 7.3 Payment approval
```
Requested → Manager Approved → Finance Approved → Executed → Reconciled → Closed
```

---

## 8. Data model (high level — initial)

**Identity/System:** User, Role, Permission, UserRole, Session, AuditLog, Attachment,
Setting, Currency, ExchangeRate, NumberSequence, Notification, EmailLog.

**Master:** Company, Station, Supplier, SupplierBankAccount, Buyer, BuyerContact,
Warehouse, ExpenseCategory (lookup), CoffeeProcess (lookup), Grade (lookup), ScreenSize
(lookup).

**Supply:** CherryPurchase, CherryPurchaseLine(optional), ProcessingBatch, ProcessingStage
(cherry/parchment/dry/green measurements), QualityTest (moisture, grade, screen, cupping),
InventoryLot, InventoryMovement, LotTraceability, LotEvent.

**Sales:** Quotation, QuotationLine, ProformaInvoice, ProformaInvoiceLine,
SalesContract, ContractDocumentChecklist, CommercialInvoice, CommercialInvoiceLine,
Shipment, ShipmentDocument, DocumentType (lookup).

**Money:** Payment, PaymentAllocation, Expense, Invoice/ AR aging, RepatriationRecord,
FxTransaction.

**Numbering:** NumberSequence controls series like `ST-###`, `PUR-YYYY-####`,
`BATCH-YYYY-####`, `LOT-<station>-<region><process>-###`, `PRO-YYYY-####`, `COM-YYYY-####`,
`PAY-YYYY-####`.

Key integrity rules:
- Every child row links to a Station.
- Inventory cannot go negative for a lot.
- Cherry purchase total auto-computed (`qty × price`), editable only with reason.
- Yield % auto-computed and flagged if outside expected band.
- Commercial invoice must reference a proforma/contract; number continuity enforced.
- Soft-delete + audit on all financial records (no hard deletes).

### 8.1 Default numbering rules (configurable in Admin Settings)

The client had no existing rules, so MADDA ships these defaults. Each is editable:
prefix, include-year toggle, padding, and reset cadence (yearly/monthly/never).

| Document | Default format | Example |
|---|---|---|
| Station | `ST-###` | `ST-001` |
| Supplier/Customer | `SUP-YYYY-####` | `SUP-2026-0001` |
| Cherry Purchase / Receipt | `PUR-YYYY-####` | `PUR-2026-0001` |
| Processing Batch | `BATCH-YYYY-####` | `BATCH-2026-0042` |
| Lot ID | `LOT-<station>-<process>-###` | `LOT-ST001-NAT-003` |
| Inventory movement | `INV-YYYY-####` | `INV-2026-0100` |
| Payment | `PAY-YYYY-####` | `PAY-2026-0007` |
| Expense | `EXP-YYYY-####` | `EXP-2026-0031` |
| Quotation | `QTN-YYYY-####` | `QTN-2026-0005` |
| Proforma Invoice | `PRO-YYYY-####` | `PRO-2026-0012` |
| Commercial Invoice | `COM-YYYY-####` (carries proforma ref) | `COM-2026-0012` |
| Sales Contract | `CON-YYYY-####` | `CON-2026-0004` |
| Shipment | `SHP-YYYY-####` | `SHP-2026-0002` |

Numbers are generated atomically (DB sequence) to avoid duplicates under concurrency/offline.

---

## 9. Dashboards & reporting (replacing Excel formulas)

- **CEO Dashboard:** active stations, cherry purchased (kg), green output (kg), inventory
  (kg), purchase cost, station expenses, sales revenue, gross profit, pending payments/
  expenses/customer payments, completed batches, active lots — all live from DB.
- **Station performance table:** cherry kg, green kg, cost, expenses, revenue, profit per
  station (drill-down to batches/lots).
- **Charts:** expense by category, green kg by process, green kg by grade, monthly revenue &
  gross profit, yield trends, top buyers, aging AR/AP.
- **Reports:** purchase register, processing/yield, inventory valuation, sales register,
  lot profitability, traceability certificate, export document register, payment/expense
  registers, NBE repatriation report.
- All exports to PDF/Excel/CSV.

---

## 10. Email & document automation

- Branded PDF templates: Cherry Receipt, Proforma Invoice, Commercial Invoice, Packing List,
  Sales Contract, Lot Traceability Certificate, Statement of Account.
- Email templates (MJML): send proforma to buyer, commercial invoice + doc pack, payment
  reminders, approval requests, low-stock/contract-expiry alerts.
- Every generated document gets a unique number, PDF stored, and an `EmailLog` entry.
- Queue-based sending with retry and delivery status.

---

## 11. Security, compliance & audit

- RBAC + record-level scoping; deny by default.
- Full audit trail: actor, action, entity, before/after, IP, timestamp.
- Encrypted secrets, hashed passwords, signed file URLs.
- Data retention (5-year export records), soft delete, backups.
- Input validation everywhere (Zod), server-side authorization on every endpoint.
- Optional 2FA for privileged roles (Phase 2).

---

## 12. Build roadmap

**Phase 0 — Foundations (this plan).** Repo, stack, Docker, CI, ADRs.
**Phase 1 — Core MVP:** auth/RBAC, reference data, stations, suppliers, cherry purchases,
processing, inventory, lot traceability, basic payments & expenses, audit log.
**Phase 2 — Sales & Export:** buyers, quotations, proforma invoices, PDF generation, email,
commercial invoice conversion, contracts, shipments, export docs.
**Phase 3 — Finance & Intelligence:** multi-currency, AR/AP, repatriation, executive
dashboard, all reports, charts.
**Phase 4 — Advanced:** 2FA, GL, EUDR geolocation pack, price/market tracking, sample
management, integrations (ECTA/ECX/bank/customs), mobile-friendly station app.

---

## 13. Decisions log status

All previously open questions are **resolved** (see §1a). Only minor items remain, to be
confirmed during build (defaults are set so nothing blocks coding):

1. Default admin login email (use `admin@madda.local` until changed).
2. Gmail address + app password for sending (client to provide when email module is built).
3. Whether station staff may also edit supplier bank details (default: no, finance only).
4. Exact default currencies list (default: **ETB, USD**; EUR/GBP addable in settings).

---

## 14. Immediate next steps

1. ✅ Client decisions captured (§1a).
2. ✅ UI inspiration captured (§16).
3. Freeze MVP scope + permission matrix (§5, §6).
4. **Scaffold monorepo, Docker, Prisma schema, seed `Lists`.**
5. Build Phase 1 module by module (vertical slices: DB → API → UI → tests), mobile-first.

---

## 15. Offline-first & heavy local storage (critical requirement)

Many stations have **no internet**. MADDA must let staff work offline all day and sync later.

### 15.1 Strategy — "local-first with sync queue"
- **Web app = installable PWA.** Service worker caches the app shell + reference data
  (stations, suppliers, lookups, currencies) so it opens with no connection.
- **Local database in the browser** using **IndexedDB** (via **Dexie.js**). All writes go
  to IndexedDB first (instant, never blocked by network).
- **Outbox / sync queue:** every create/update is written to a local `sync_queue` table with
  a client-generated UUID, timestamp, entity, and payload.
- **Sync engine (background):**
  - Listens for `online` events + periodic retry (e.g. every 30s while online).
  - Pushes queued mutations to the API in order (idempotent via UUID).
  - Pulls server changes since last sync (cursor/`updatedAt` based).
  - Resolves conflicts with **last-write-wins per field + audit**, and flags true conflicts
    for a human to review.
- **Explicit "Save"** button per form (client asked for this): save locally immediately,
  show a clear status chip — `Saved on device` / `Syncing…` / `Synced` / `Sync failed (retry)`.
- **Sync status center:** list of pending uploads, failed items, retry all, and a manual
  "Sync now" button.
- **PWA install** on phone (Add to Home Screen); app works from a local server on the LAN
  when available, and fully offline otherwise.

### 15.2 Local server option
- Because deployment is **local now**, run the whole stack via **Docker Compose** on one
  machine (Postgres + Redis + API + web). Stations on the LAN hit that machine.
- For truly remote/offline stations: the PWA stores locally and syncs when they reach
  network, or via a lightweight **desktop agent** (Phase 4) that can sync over USB/import
  if needed.
- Also support **JSON/CSV export of the local outbox** as a last-resort manual transfer.

### 15.3 Data integrity rules
- Never lose a local write; never auto-discard on conflict.
- Each synced record keeps: local UUID, server ID, created-at-local, synced-at.
- Barcode/QR scan support for lot + bag labels to speed up offline entry.

---

## 16. UI / UX design system (from the client's inspiration)

Reference style: clean SaaS dashboard (Userflow/Orbit-like) — calm, white, one accent,
soft borders, rounded cards, status pills, bulk-action bar. **Mobile-first.**

### 16.1 Layout
- **Desktop:** collapsible **left sidebar** with icon + label nav and section groups
  (Main Menu / Tools / Workspace), a top bar with global search + notifications + avatar,
  a page header with primary action button on the right.
- **Tablet:** sidebar collapses to icons.
- **Phone:** sidebar becomes a **slide-in drawer**; primary navigation via a **bottom tab
  bar** (Dashboard, Purchases, Processing, Inventory, More). Forms are full-screen sheets.

### 16.2 Components
- **KPI stat cards** row (big number, label, trend chip).
- **Toolbar:** Table/Card view toggle, Filter, Sort, "Show Statistics" toggle, Customize,
  Export, primary Add button.
- **Data table** (desktop): name + subtitle, columns, multi-select checkboxes, colored
  **status pills** (`Pending`, `Paid`, `In Stock`, `Out of Stock`, `Restock`), row actions.
- **On phone:** tables become **card lists** (title, key values, status pill, chevron).
- **Floating bulk-action bar** when rows are selected (Apply, Edit, Delete, …).
- **Status pill palette:** green = positive/done, amber = warning/pending, red = negative,
  blue/gray = neutral/info.
- **Forms:** clear sections, sticky save bar with sync status chip, currency dropdown next to
  every money input, inline validation, large tap targets (≥44px).

### 16.3 Visual language
- White/very light gray background, subtle 1px borders, rounded `xl` corners, soft shadows.
- **One accent color** (default indigo/blue) used sparingly for primary actions + active nav.
- Typography: clean sans (Inter), clear hierarchy, generous whitespace.
- Icons: single icon set (e.g. Lucide).
- Dark mode optional later.

### 16.4 Design principles
- **Phone screen is a first-class target** — every screen must be usable on a medium phone.
- Keep it **clean**: hide advanced options behind "More", no dense clutter.
- Always show **where you are** (breadcrumbs) and **what's assigned to you**.
- Consistent **status + sync indicators** everywhere (because of offline use).

---

## 17. Internationalization (Afaan Oromoo + English)

- i18n from day one: `react-i18next` on the web, message catalogs on the API for emails/PDFs.
- Locale files: `en.json`, `om.json` (Afaan Oromoo). User picks language in profile; default
  follows device then falls back to English.
- All **UI labels, validation messages, status names, nav, and email/PDF templates** are
  translatable. Numbers/dates/currency formatted per locale (`Intl`).
- Reference data gets a `name_en` + `name_om` pair where it's user-facing (processes, grades,
  expense categories, stations) so data reads naturally in both languages.
