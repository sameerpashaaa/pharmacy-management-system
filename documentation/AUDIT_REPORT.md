# PharmaCare — Complete Codebase Audit Report

> **Audit date:** 2026-09-23
> **Audited commit:** `a722f84` (branch `arena/01a0cf0e-pharmacy-management-system`, forked from `master`)
> **Scope:** 100% of the repository — application code, schema, seeds, tests, scripts, CI, docs
> **Method:** Static deep-read of every module, service, route, component, schema model, migration and test; execution of the unit test suite; cross-tracing of UI ↔ API ↔ service ↔ DB for every major workflow. **No code was modified.**
>
> **Verification performed in this audit:**
> - Unit test suite executed: **511 passed / 58 suites** (10 failing tests analyzed in §13 — 9 are sandbox artifacts of the un-generatable Prisma client, **1 is a genuine stale/broken test** in the repo).
> - Full `tsc --noEmit` / production build could not be executed in this environment because `prisma generate` requires downloading engine binaries from `binaries.prisma.sh`, which is blocked in the sandbox. CI performs this step; type errors observed locally were exclusively "Prisma namespace has no exported member …" artifacts of the missing generated client, not source defects.

---

## 1. Executive Summary

PharmaCare is a **single-organization, multi-branch Indian pharmacy management system** built as a Next.js 14 App Router monolith (server-rendered React + co-located API routes), backed by PostgreSQL via Prisma, with NextAuth (credentials + JWT) authentication and a code-based RBAC permission system. It is GST-aware (HSN, CGST/SGST/IGST, GSTR-1/GSTR-3B), India-compliance-aware (Schedule H1 register, NDPS narcotic register, DPCO ceiling fields, Form 35 PDF), and unusually strong in **transactional integrity** — the POS sale, GRN receipt, stock adjustment, return and disposal flows run inside serializable transactions with optimistic compare-and-set (CAS) updates, FEFO batch allocation, status logs and audit rows. The codebase is large (~69k LOC of TypeScript), unusually well-tested for its stage (521 unit tests + 24 real-Postgres integration test files), and extensively documented (50+ docs).

**Overall verdict: serious mid-stage engineering, roughly 60–65% of a production-ready pharmacy system.** The *core transactional spine* (sell, receive, adjust, return, dispose) is better than typical CRUD projects. However, several **workflow dead-ends and silent compliance gaps** make it unsafe to operate as-is in a real pharmacy:

1. **The POS loose-tablet flow is broken end-to-end** — the newest UI feature (strip + loose tablet input) is deliberately rejected by the server, so any cashier who uses it gets a guaranteed checkout failure.
2. **Prescriptions are never consumed.** An APPROVED prescription can satisfy the Schedule H/X gate on an unlimited number of sales, forever.
3. **Returns silently corrupt compliance and stock data** — no GST reversal on sale/purchase returns, "QUARANTINE" returns make physical stock vanish, and restocking into an expired batch inflates sellable aggregate stock that FEFO can never dispense.
4. **The notification/alerting system is a schema-only ghost** — models, enums and settings exist; not one line of code ever creates, lists or displays a notification. Low-stock and expiry alerts therefore do not exist operationally.
5. **Audit logging is write-only** — dozens of writers, zero readers: the `/audit` page is a "Coming in Phase 9" placeholder and there is no `/api/audit` endpoint.
6. **Authentication completion gaps** — no password-reset flow (model and mail dependency exist unused), MFA is enforced only for the `owner` role, and seeded production-visible credentials are weak with no forced change.
7. **The general ledger is decorative for operations** — sales, purchases and returns never post revenue/tax/inventory/COGS entries to the GL; manual journal posting is single-sided (no double-entry balancing); so "Finance" currently means party ledgers + GST registers, not accounting.
8. **Reporting is thin and scales poorly** — seven reports, all paginated **in memory** after loading full tables; stock valued at **MRP** in the stock report; no profit/margin, purchase, customer, payment, returns or mover analysis reports.

The project description "phases 0–6 complete" in `PROGRESS.md` is materially accurate for what it claims, but several features it marks complete are *backend-complete/UI-dead* (audit logs, doctors master, evidence files, credit-note redemption) or *UI-complete/backend-dead* (loose units, UPI QR, negative-stock setting, notifications).

**Readiness classification: advanced internal tool / pre-production prototype — not production-ready.** The fixes in §15–§17 are prerequisites to real-world deployment.

---

## 2. Complete Project Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ USERS / ROLES (seeded: owner, manager, pharmacist, chief_pharmacist, cashier,      │
│ purchase_manager, accountant — custom roles via /roles, 72 seeded permissions)     │
└───────┬────────────────────────────────────────────────────────────────────────────┘
        │ credentials + TOTP (owner only)
        ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│ AUTH & AUTHORIZATION                                                               │
│  NextAuth v4 (Credentials provider, JWT 30-day)  ├ mfa-service (verifyPasswordStep/ │
│  completeMfaChallenge, bcrypt-12, lockout 5-fails/15min, password history last-5)  │
│  middleware.ts (withAuth — all routes except login/register/reset-password/api/auth)│
│  auth-helpers (getSession → DB isActive recheck, requirePermission, can,           │
│  assertAssignableRoles)  ·  assertBranchAccess (org-scoped branch guard)           │
└───────┬────────────────────────────────────────────────────────────────────────────┘
        │ session { id, roles[], permissions[], branchId }
        ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│ FRONTEND — Next.js App Router (server pages + client views), Shadcn/Radix + Tailwind│
│  (dashboard) 63 pages │ Sidebar permission-filtered nav │ POS fullscreen client    │
│  Modules w/ UI: Dashboard, POS, Products, Categories, Inventory, Adjustments,       │
│  Movements, Batches, Expiry, Store (walls/locate), Purchases, GRN receive,          │
│  Purchase Returns, Suppliers, Sales, B2B Wholesale, Prescriptions, Customers,       │
│  Sale Returns + Credit Notes, Finance (overview/receivables/payables), GST,         │
│  Reports (4), Compliance Form35, Users, Roles, Settings (approval policy/MFA/org/   │
│  WhatsApp)                                                                          │
│  Placeholder UIs: /audit, /settings/general ("Coming in Phase 9")                   │
│  UI-absent backends: Doctors master, Notifications, Audit viewer, GRN list,         │
│  Credit-note redemption, Evidence upload, /reports/purchases, /reports/financial    │
└───────┬────────────────────────────────────────────────────────────────────────────┘
        │ fetch JSON (no react-query; no global data layer)
        ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│ API LAYER — 96 route files under src/app/api/*                                     │
│  Uniform-ish pattern: requirePermission(code) → zod parse → service call →         │
│  { success, data | error } envelope; error MESSAGE text mapped to HTTP status      │
│  ("/api/eod/send" is the only non-session route: Bearer EOD_REPORT_SECRET)         │
└───────┬────────────────────────────────────────────────────────────────────────────┘
        ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│ BUSINESS LOGIC — src/lib/*-service.ts (server-authority)                            │
│  sales-service (createSale/cancelSale: FEFO•CAS•serializable•invoice counter)       │
│  pricing (pure GST math) · fefo (pure allocation) · batch-service · expiry-service  │
│  inventory-service (adjustments + 3-tier approvals) · purchase-service (PO/GRN/     │
│  3-way match/payments/returns) · sale-return-service · finance-service (COA/GL/     │
│  party ledgers) · gst-service (posting/sync/GSTR) · prescription-service ·          │
│  product-service/import · customer-service · org-service · settings-service ·       │
│  rack-service (Wall→Rack→Shelf→Bin→BinStock) · narcotic-service · eod-service ·     │
│  dashboard/queries · mfa/totp/password-history · retry wrapper (P2034/P2002)        │
└───────┬────────────────────────────────────────────────────────────────────────────┘
        ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│ DATABASE — PostgreSQL via Prisma 5.17 (60 models, 24 enums, 11 migrations)          │
│  Identity: users/accounts/sessions/roles/permissions/user_roles/password_*          │
│  Org: organizations/branches/org_settings/system_settings                           │
│  Catalog: categories/products/product_barcodes/hsn_codes/tax_rates/products_imports │
│  Stock: inventory/inventory_movements/stock_adjustments/batches/batch_status_log /  │
│   batch_disposals/walls/racks/rack_shelves/store_bins/bin_stocks                    │
│  Commerce: sales/sale_items/sale_item_batches/payments/held_bills/prescriptions(+img)│
│   purchases/purchase_items/purchase_returns(+items)/sale_returns(+items)/credit_notes│
│  Finance: customers/customer_ledgers/suppliers/supplier_ledgers/ledgers/            │
│   ledger_entries/gst_transactions                                                   │
│  Compliance: doctors/schedule_h1_register/narcotic_register                         │
│  System: notifications(+preferences — UNUSED) · files · audit_logs (viewer ABSENT)  │
└───────┬────────────────────────────────────────────────────────────────────────────┘
        ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│ EXTERNAL SERVICES / INTEGRATIONS (actual, not documented-only)                      │
│  Meta WhatsApp Cloud API (EOD report sender — fetch-based, secrets in org_settings) │
│  Meta OAuth: none · Email (nodemailer): INSTALLED, UNUSED · File storage: NONE      │
│  (files are URL-strings only) · jspdf: used only for Form-35 PDF · Barcode scan:    │
│  via keyboard-wedge input at POS · No payment gateway, no e-invoice/e-way bill,     │
│  no drug database/interaction API, no SMS, no backup jobs                           │
└────────────────────────────────────────────────────────────────────────────────────┘
```

**Runtime topology:** one Next.js node process serves UI + API + a separately-run `scripts/eod-cron.ts` scheduler (`npm run cron:eod`) that must run alongside the app server to fire the daily WhatsApp report. No background worker/queue exists; the batch-expiry sweep is lazy (runs on read).

---

## 3. Complete Module Inventory

| # | Module | Existing Features | Backend | Database | UI | Status |
|---|---|---|---|---|---|---|
| 1 | Authentication | Credentials login, lockout (5/15min), bcrypt-12, password history, owner-only TOTP MFA, sign-out audit | ✅ auth-config, mfa-*, jwt/session callbacks | ✅ users/accounts/sessions/password_reset_tokens(ORPHANED)/password_histories | ✅ login page, MFA enrollment card | **Partial** — no password reset, MFA owner-only, no login audit |
| 2 | Users & Roles | User CRUD (deactivate-only), role CRUD, permission matrix, assign-roles guard, last-owner guards | ✅ routes + services | ✅ roles/permissions/user_roles | ✅ /users, /roles (+new/detail) | **Mostly complete** — no self-service profile/password |
| 3 | Organization & Branches | Org profile, branch CRUD, per-branch invoice prefix/counter, branch scoping | ✅ routes, org-service, branch-access | ✅ organizations/branches/org_settings | ✅ settings/organization | **Mostly complete** — no branch switcher; global-only suppliers/customers |
| 4 | Store Layout (Walls/Racks/Bins) | Wall→Rack→Shelf→Bin CRUD, bin stock assign/remove, product locator | ✅ rack-service + 10 routes | ✅ walls/racks/rack_shelves/store_bins/bin_stocks | ✅ /store/walls, /store/locate | **Partial** — assignment coverage thin, `currentFill` maintenance unverified, cold-chain monitoring absent |
| 5 | Product Master | CRUD, category tree, multi-barcode, HSN, GST rates, schedule/storage class, CSV import (2MB/1000 rows, atomic) | ✅ product-service, import, routes | ✅ products/categories/product_barcodes/hsn_codes/tax_rates | ✅ catalog, form, categories, import dialog | **Mostly complete** — no variants/units, no image upload, DPCO not enforced |
| 6 | Inventory & Adjustments | Per-branch aggregates, movements, adjustments, 3-tier approval (self/manager/chief) + evidence rule, FEFO negative-reconciliation, CAS | ✅ inventory-service + routes | ✅ inventory/movements/stock_adjustments | ✅ overview, movements, adjustments | **Mostly complete** — evidence upload unreachable in UI; reservedQuantity dead; no transfers |
| 7 | Batches & Expiry | Lifecycle ACTIVE/BLOCKED/EXPIRED/DISPOSED/EXHAUSTED, status log, disposal (partial/full), lazy expiry sweep, FEFO, expiring/expired views | ✅ batch/expiry/fefo services + routes | ✅ batches/batch_status_log/batch_disposals | ✅ batches, detail, expiry hub | **Mostly complete** — no expiry alerts; re-receipt of same batch number impossible (unique) |
| 8 | POS / Sales | Server-authority pricing (never trusts client money), FEFO/oldest-first toggle, serializable tx + CAS, discount gates, credit-sale gates → customer ledger, prescription gate, H1+NDPS capture, held bills, per-branch invoice counter, browser-print receipt, barcode search, cancel (full-void) | ✅ sales-service, pricing, pos routes | ✅ sales/sale_items/sale_item_batches/payments/held_bills | ✅ fullscreen POS, sales history/detail | **Partial** — loose units broken; batch-MRP ignored; IGST never on sales; UPI QR dead; payment voiding destructive |
| 9 | Prescriptions | Register (metadata + image-URL), approve/reject, stats, branch-scope, POS association | ✅ prescription-service + routes | ✅ prescriptions/prescription_images | ✅ list/pending/new/detail | **Partial** — no items, never DISPENSED, unlimited reuse, no expiry sweep |
| 10 | Purchases & Suppliers | Supplier CRUD, PO create/cancel, GRN receiving (batch+inventory+payable+GST posting, QC/cold-chain gates), 3-way match (compute-only), supplier payments, purchase returns | ✅ purchase-service + routes | ✅ suppliers/supplier_ledgers/purchases/purchase_items/purchase_returns(+items)/payments | ✅ lists, detail, PO form, GRN form, returns forms | **Partial** — GRN not a persisted entity; over-receive race documented; return math client-trusted; no supplier delete |
| 11 | Sales Returns & Credit Notes | Per-line caps vs sold qty, RESTOCK/QUARANTINE/DAMAGE_WRITE_OFF, sale status cascades, credit note issuance + customer ledger | ✅ sale-return-service + routes | ✅ sale_returns(+items)/credit_notes | ✅ returns hub, wizard, detail, credit-notes table | **Partial** — no GST reversal; QUARANTINE no-op; RESTOCK-into-expired divergence; credit notes not redeemable |
| 12 | Customers | CRUD (guarded delete), credit limit/days fields, ledger, receivables + settlement (GL cash/AR posting), B2B wholesale type | ✅ customer-service, finance-service | ✅ customers/customer_ledgers/payments | ✅ list/new/detail, receivables view | **Partial** — credit limit never enforced; no aging |
| 13 | Finance / GL | 18-account COA auto-seed, ledgers + entries, manual journal, party statements, finance summary KPIs | ✅ finance-service + routes | ✅ ledgers/ledger_entries | ✅ finance overview, payables, receivables | **Partial** — single-sided manual entries; sales/purchases never post to GL; no expense workflow |
| 14 | GST | HSN master, line-level GST posting (sale/purchase), B2B/B2C/NIL detection, sync/backfill, GSTR-1/GSTR-3B JSON, period filing marker | ✅ gst-service + routes | ✅ gst_transactions/hsn_codes/tax_rates | ✅ gst pages, reports | **Partial** — interstate IGST only on purchases; returns ignored; no portal-format export |
| 15 | Reports & Dashboard | KPI cards (+charts, low-stock & expiring tables, pending Rx), stock position, near-expiry, consumption, supplier performance, sales financials, narcotic register → JSON APIs + 4 pages | ✅ report-service, dashboard/queries | (aggregations only) | ✅ dashboard + 4 report pages | **Partial** — in-memory pagination; MRP valuation; many standard reports missing; no export |
| 16 | Notifications & Alerts | **None beyond schema/settings** | ❌ | ✅ notifications/notification_preferences (untouched) | ❌ | **Missing** — ghost module |
| 17 | Audit Trail | Writers across ~30 flows (JSON old/new, metadata) | ✅ writes only | ✅ audit_logs | ❌ placeholder | **Incomplete** — no API, no viewer, no login audit, cancel wipes payment amounts |
| 18 | Compliance (India) | Doctors master (API only), Schedule H1 register on sale, NDPS narcotic register (opening balance + chained balances), Form-35 PDF | ✅ services + routes | ✅ doctors/schedule_h1_register/narcotic_register | ✅ form35 page, narcotics report | **Partial** — no Doctors UI; H1 register sale-cancel creates negative rows (unusual but auditable) |
| 19 | Files & Evidence | File metadata rows; chief-tier evidence rule | ⚠ POST /api/files stores URL strings only | ✅ files | ❌ | **Incomplete** — no upload endpoint/storage; adjustment UI can't attach evidence |
| 20 | EOD WhatsApp Report | Daily KPI message, settings UI (Meta creds), cron script, secret-guarded route | ✅ eod-service/formatter/sender + routes | (org_settings) | ✅ settings/whatsapp | **Mostly complete** — secrets plaintext in DB; cron is a manual side-process |
| 21 | Settings | System settings read model + POS accessors, approval-policy editor, MFA enrollment, org editor, WhatsApp editor | ✅ settings-service + routes | ✅ system_settings | ⚠ partial (general page placeholder) | **Partial** — POS toggles (max discount, FEFO, tax mode…) have no editor UI |
| 22 | DevEx/CI/Docs | ESLint+Prettier+Husky, Jest unit/integration split, Playwright, GH Actions, 50+ docs, graphify architecture generator | — | — | — | **Partial** — CI branch mismatch; 1 broken unit test; docs partially aspirational/stale |

---

## 4. Feature Audit (what exists, and how well)

Legend: ✅ Working · 🟡 Works with limitations · 🔴 Broken/unsafe for purpose · ⛔ Absent

### 4.1 Identity & Access
- ✅ Login with bcrypt(12), per-account lockout after 5 failures (15 min), `isActive` re-validated from DB on **every** server call (`getSession`).
- ✅ JWT carries roles + permission codes + branchId; owner/admin get all permissions injected at auth time.
- ✅ TOTP MFA with AES-256-GCM-encrypted secret, QR provisioning, pending-token challenge — **but only enforced when the user has the `owner` role** (`mfa-service.ts:97` — "owner accounts with MFA"). Managers/pharmacists with MFA enrolled silently log in password-only.
- ✅ Password history (last 5) enforced on admin-set password changes.
- 🔴 No password reset: `PasswordResetToken` model + `EMAIL_SERVER_*` envs + `nodemailer` exist; no API, no `/reset-password` page (middleware whitelists a route that doesn't exist). `verifyPasswordStep` even tells password-less users to "use the password reset flow to set a password" — a dead end.
- 🟡 `User.mustChangePassword` field exists but is never set or checked anywhere.
- 🟡 No audit row on successful/failed LOGIN (only LOGOUT, mfa setup/verify).
- ⛔ No rate limiting anywhere (PROGRESS.md admits it).

### 4.2 Product & Catalog
- ✅ Product CRUD with server-side SKU/barcode uniqueness, category tree, multiple barcodes, HSN linkage, GST rate quad (cgst/sgst/igst), schedule (NONE/H/H1/X/G/J/NDPS), storage condition, reorder levels, PTR/PTS.
- ✅ CSV import — atomic all-or-nothing, in-file + DB duplicate detection, category slugging, 2MB/1000-row cap, audit row, tests.
- 🟡 No pack/variant model (a "strip of 10" vs "box of 10 strips" distinction exists only as `tabsPerStrip` integer + free-text `packSize`).
- 🟡 `dpcoCeiling` (price-control cap) stored on Product/Batch but **never enforced** at sale time.
- ⛔ Product images are URL strings (`imageUrl`), no upload.
- ⛔ No product edit history/audit on UPDATE (only create/delete audited — see routes).

### 4.3 Inventory, Batches, Expiry
- ✅ Per-branch `Inventory` aggregate + `InventoryMovement` audit stream with before/after quantities.
- ✅ Stock adjustments with computed approval tier (SELF ≤ policy selfMax, MANAGER, CHIEF) — tier frozen on the row at creation, evidence-file mandatory for CHIEF, CAS everywhere, FEFO reconciliation for negative adjustments.
- ✅ Batch lifecycle with `BatchStatusLog` on every transition (incl. lazy expiry sweep `expireDueBatches()` invoked on reads), partial/full disposal with inventory write-off movement + NDPS DESTRUCTION chain.
- ✅ FEFO allocation is pure, deterministic, tested; POS consumes it transactionally with per-batch CAS and EXHAUSTED flip.
- 🟡 `Inventory.reservedQuantity` / `Batch.reservedQuantity` / `BinStock.reservedQty` are **never incremented anywhere** — the entire reservation subsystem is dead schema; `availableQuantity` is maintained but reserved semantics are decorative. Held bills do not reserve stock.
- 🟡 Expired batches still count into `Inventory.availableQuantity` — disposal is manual; aggregate stock ≠ FEFO-eligible stock once expiry passes (dashboard "out of stock" and POS stock badges can disagree with sellability). The POS gates on FEFO allocation so oversell still can't happen, but the Inventory list misleads.
- 🔴/🟡 Batch uniqueness is `(productId, batchNumber)` globally — re-receiving the same batch number from a supplier (normal in India when re-ordering) or receiving the same batch at a different branch collides in GRN (`createGrn` → `tx.batch.create`) and surfaces as a raw 400 with no recovery path.
- ⛔ No inter-branch stock transfer despite `MovementType.TRANSFER` enum and multi-branch schema.
- ⛔ No expiry/low-stock alert generation of any kind (see Notifications).

### 4.4 POS / Sales
- ✅ Server-authority: client sends product/qty/discount%; all money recomputed from DB product values; permission-gated discounts with `maxDiscountPercent` ceiling + override permission.
- ✅ Serializable transaction + per-batch CAS + inventory CAS + per-branch invoice counter CAS + P2034/P2002 retry — oversell/double-charge protection is genuinely strong (integration-tested).
- ✅ Prescription gate: `isPrescriptionRequired` or Schedule X requires an APPROVED prescription **of the same branch**; H1/NDPS requires patient/doctor capture → ScheduleH1Register rows + chained NarcoticRegister balances.
- ✅ Credit sales gated by permission + settings, write Customer debit + ledger row; customer payments settle via finance receivables with GL cash/AR posting.
- ✅ Held bills (24h `expiresAt`) — but expiry is never enforced or cleaned; expired carts remain restorable.
- 🔴 **Loose-unit dispensing is wired in the UI and rejected by the server.** POS cart supports strip + loose tablets (`pos-client.tsx:628-637, 1575`), computes fractional billing (`1513-1515`), sends `looseUnits` in the payload (`888`) — and `createSale` throws `Loose-unit dispensing is not supported for {name}` for any `looseUnits > 0` (`sales-service.ts:618-622`). Guaranteed user-facing failure on a visible feature.
- 🔴 **Batch MRP is ignored at sale time.** SaleItemBatch records `unitPrice: batch.mrp` (display only) while the actual price is always `product.mrp` (`sales-service.ts: ~680-700`, `pricing.ts`). In India the printed MRP of the dispensed batch is the legal price; batch-level price changes are silently flattened to the product master value — under/overcharging whenever a batch's MRP differs, and no margin per batch is possible.
- 🔴 **Sale cancellation destroys payment evidence**: `cancelSale` rewrites every `Payment.amount` to `0` and prefixes reference with "VOIDED:" (`sales-service.ts:1098-1104`) instead of recording refund/void semantics — the original amounts/methods are erased from the database. Financial reconciliation after a void is impossible from data.
- 🟡 Cancel leaves depleted batches EXHAUSTED: `soldQuantity` is decremented but status/EXHAUSTED→ACTIVE restoration and BatchStatusLog are missing — a cancelled sale can leave stock stuck un-sellable in an EXHAUSTED batch until manual intervention.
- 🟡 `derivePaymentStatus` returns CREDIT if *any* CREDIT-method line exists even when cash covers 100% (mixed payments mislabeled).
- 🟡 `Sale.upiQrData`, `Sale.thermalSlipPrinted` — dead fields (never written/read).
- ⛔ No invoice PDF (jsPDF installed, used only for Form 35), no thermal-printer integration beyond `window.print()`, no UPI QR generation (`qrcode` dep used only for MFA), no email/SMS/WhatsApp bill to customer.
- ✅/🟡 B2B wholesale path (`/sales/new`): batch-pinned selling with its own client; honest but duplicates a lot of POS logic; GST still intra-state (see GST).

### 4.5 Prescriptions
- ✅ Register, approve/reject with reason, stats endpoint, branch scoping, POS auto-suggest of approved Rx.
- 🔴 **Prescriptions are never consumed.** `createSale` validates `status === 'APPROVED'` but never transitions it to `DISPENSED` (grep: no writer sets DISPENSED anywhere). One approved prescription can gate unlimited H/X sales indefinitely — a controlled-drug audit hole. `EXPIRED` status likewise never set (no sweep).
- 🔴 The Prescription model has **no line items** — nothing records *which medicines/quantities* were prescribed, so the "gate" only checks that *some* approved Rx exists, not that the sold item matches the prescription.
- 🟡 Images are URL strings (no upload; the form placeholder literally suggests typing `https://... or /uploads/prescription.jpg`).
- 🟡 `prescriptionNumber` is `Math.random()`-suffixed (`RX-YYYYMMDD-####`) — retry handles P2002, but random-space collisions grow with volume (same pattern for returns/credit notes).

### 4.6 Purchases, Suppliers, GRN
- ✅ Supplier CRUD + ledger; PO create with server-computed line/header totals; status machine (DRAFT→ORDERED→RECEIVED→INVOICED, plus cancel).
- ✅ GRN receive: per-item batch creation with QC gate (`qualityCheckPassed=false` → batch born BLOCKED), cold-chain temp required for REFRIGERATED/DEEP_FREEZE products (2–8 °C range enforced fail-closed), expiry ≥ 6 months hard rule, per-item over-receive re-check **inside** the transaction with CAS on `receivedQuantity`, supplier payable accrual per receipt delta, purchase-GST posting (delete-and-recreate per receipt — idempotent accumulations), narcotic PURCHASE_RECEIPT chain.
- 🟡 **GRN is not a persisted entity** — no GRN table; the passed `grnNumber` is validated for uniqueness against `Purchase.purchaseNumber` (nonsensical cross-field check) and *never stored*; `listGrns` returns the PO number as the GRN number (code comment: "Using purchaseNumber as GRN number for now"). Multiple partial receipts of one PO are indistinguishable; GRN printing/audit trail impossible.
- 🟡 Concurrent double-GRN over-receive remains possible (documented in PROGRESS.md as a known integration-test finding): pre-transaction reads + per-item CAS leave a window where two GRNs both pass remaining-qty checks against distinct uncommitted snapshots (fix: row lock / serializable — code acknowledges).
- 🔴 Purchase returns: `unitCost` (and thus refund value) comes **from the client** (`createPurchaseReturnSchema`), not from the PO line's server-side cost — a clerk can over-state supplier debit; GST on the returned goods is never reversed (ITC misstated); batch quantity is decremented without a floor (can go negative) while aggregate inventory is `Math.max(0,…)`-clamped — ledger/stock divergence; supplier ledger records a **DEBIT that decreases balance** while GRN records a DEBIT that increases it (sign convention inconsistent).
- 🟡 Three-way match computes but persists nothing; its GET route is a stub returning an empty list with a TODO; supplier-payments GET likewise (both return fabricated "success/empty" payloads).
- 🟡 PO numbering `PO-${Date.now()}` — millisecond collision → P2002 → raw 400; non-monotonic, non-branch-scoped.

### 4.7 Returns & Credit Notes
- ✅ Sale return with per-line caps (`quantity - returnedQuantity`), unit-price prorating incl. discount/tax share, sale status cascade (PARTIALLY/FULLY_RETURNED), serializable tx + retry, RESTOCK path re-credits inventory + batch + movement, credit-note issuance with 1-year expiry + customer ledger credit; narcotic RESTOCK chains register.
- 🔴 **No GST adjustment on sale returns.** `cancelSale` reverses GST via negative NIL_RATED mirror entries; `createSaleReturn` creates **no** GST rows at all — output tax stays over-stated in GSTR-1 after every partial/full return. (Purchase returns likewise.)
- 🔴 **QUARANTINE restock decision is a no-op.** Inventory not re-credited, no movement, no batch block, no quarantine record — the refunded goods vanish from every ledger. `DAMAGE_WRITE_OFF` writes a movement with `quantityAfter = quantityBefore` (no quantity change), inflating movement history meaninglessness.
- 🔴 **RESTOCK into expired/blocked batches diverges aggregates.** Restock increments `Inventory.availableQuantity` and batch quantity regardless of batch status/expiry (only EXHAUSTED+unexpired flips back to ACTIVE). Returned stock becomes sellable per the aggregate but un-allocatable per FEFO → phantom availability and later "insufficient stock" errors at POS.
- 🔴 **Credit notes cannot be redeemed.** No POST/redeem endpoint; `createSale` doesn't accept a credit note; `balanceUsed`/PARTIALLY_USED/FULLY_USED states are unreachable → customers can never spend their credit.
- 🟡 Return numbering via `Math.random()` suffix; return has no approver workflow (`returns:approve` permission exists and is seeded, but no route ever requires it).

### 4.8 Finance & GST
- ✅ COA auto-seed (18 accounts), ledger CRUD, party ledgers with running balances + statements, settlements posting GL cash/bank vs AR/AP pairs, finance summary aggregates, GST posting per sale/purchase line with B2B/B2C/NIL detection + unique line constraint, backfill sync, GSTR-1/GSTR-3B JSON builders, filing marker.
- 🔴 Manual GL entries are **single-sided** (`createLedgerEntry` posts one leg; no debit=credit pairing/balancing) — the general ledger can be put out of balance by design. Trial balance/P&L from this GL is meaningless.
- 🔴 Operational events never post to the GL: sales revenue, output GST, purchase cost, input GST, COGS and inventory movement have **no journal entries** (only party ledgers + gst_transactions). Combined with the above, the Finance module is a receivables/payables tracker wearing a GL costume.
- 🟡 Interstate logic exists only on the purchase side (`createGrn` compares branch/supplier state). **Sales always split CGST+SGST** (pricing.ts hardcodes `igstPercent = 0` with a "documented limitation" comment) — wrong tax for any interstate B2B wholesale sale, which the new `/sales/new` wholesale flow invites.
- 🟡 `gst/file` marks a period as filed but nothing re-computes or locks the period afterwards; post-filing edits freely mutate filed transactions (`isFiled` not enforced).
- 🟡 `Supplier.outstandingBalance`/`Customer.outstandingBalance` are global (no branch dimension) while ledgers are global too — fine for single-org, but reports can't attribute balances per branch.

### 4.9 Reports & Dashboard
- ✅ Dashboard: monthly sales + delta, inventory value (see bug), out-of-stock count, top product, sales trend & category charts (recharts), low-stock table, expiring-soon table, pending-Rx, quick actions.
- ✅ JSON APIs: stock position, consumption (sales-only OUT movements), supplier performance, sales financials (business-day bucketing by org timezone), narcotic register.
- 🔴 Dashboard inventory value is wrong: `getInventoryValue` computes `available = quantity - reservedQuantity` and **forgets `- soldQuantity`** (`dashboard/queries.ts:26-28`) → overstates inventory value by cumulative lifetime sales.
- 🔴 Stock report values inventory at **MRP** (`report-service.ts:100`) instead of cost/purchase price — materially overstates assets; dashboard and report disagree (dashboard uses purchasePrice — two different "inventory value" truths).
- 🔴 Every report loads the **entire result set** and paginates in memory (`paginate(rows.slice…)` after `findMany` without skip/take, e.g. `getDailyStockPosition`, `getNarcoticRegister`, `getConsumptionReport`, `getSupplierPerformance`). At 100k+ sales/batches these will fall over.
- ⛔ Missing: profit/margin (COGS), purchase reports, customer reports/aging, payment-mode reports, returns reports, fast/slow movers, dead-stock, tax summary beyond GST registers, export (CSV/PDF) anywhere — `reports:export` permission is permanently gate-keeping nothing (used only by Form-35 route), and `ROUTES.REPORTS_PURCHASES`/`REPORTS_FINANCIAL` point to pages that don't exist.

### 4.10 Notifications & Audit
- ⛔ **Notifications: entirely absent.** `Notification` + `NotificationPreference` models, `NotificationType` enum (LOW_STOCK/EXPIRY_ALERT/PURCHASE_DUE/PAYMENT_DUE/PRESCRIPTION_PENDING), seeded `notifications.*` settings — zero `notification.create` in the codebase, no API route, no UI surface, no email sender (nodemailer unused). Reorder alerts, expiry alerts, payment reminders: none fire.
- 🔴 **Audit: write-only.** ~30 writers but no `/api/audit*` route; `/audit` page renders "Coming in Phase 9". The seeded `audit:read` permission is unused (one of four dead permission constants). For a system already carrying drug-compliance registers this is a material gap — the data exists and cannot be retrieved through the product.

### 4.11 EOD WhatsApp
- ✅ Well-isolated: data service + pure formatter (tested) + Meta Cloud fetch sender + settings UI + secret-or-admin-guarded route + node-cron side script.
- 🟡 Meta access token stored **plaintext** in `organization_settings` (DB) — no encryption at rest for this credential (the MFA secret shows they know how; `Data_Encryption_Standards.md` promises more).
- 🟡 EOD delivery depends on a human keeping `npm run cron:eod` alive in a terminal; no retry/DLQ if Meta is down at 20:00.

---

## 5. Missing Features (verified absent from code)

Checked each of these against the codebase; "missing" means no implementation exists (not "didn't see it"). Where a stub/schema exists, it is listed in §6 instead.

**A. Alerts & engagement**
1. Low-stock alert generation + notification center (schema only).
2. Expiry alert generation (30/60/90-day classifications exist as *views*; no proactive alert, badge, email or WhatsApp push).
3. Payment-due reminders (customer credit due dates from `creditDays`; supplier due from GRN+creditDays) — no due-date computation anywhere.
4. Email subsystem entirely (password reset, alerts, invoice delivery) despite `EMAIL_SERVER_*` envs + nodemailer.

**B. Money & compliance**
5. Password reset / forgot-password flow end-to-end.
6. Profit & loss / margin reporting (COGS from SaleItemBatch × batch.purchasePrice is computable today; nothing computes it).
7. Invoice PDF generation & printable GST tax-invoice layout (only browser print of a receipt; `invoice.pdf` at repo root is a stray artifact, not a feature).
8. Credit-note redemption (apply credit to a later sale / refund settlement).
9. GST export (GSTR-1/3B in portal-acceptable CSV/Excel; `xlsx` dep installed unused) and post-filing period lock.
10. Interstate (IGST) computation on sales.
11. DPCO ceiling-price enforcement (fields exist; no check).
12. Expense management (EXPENSE ledgers exist in COA; no expense entry workflow/UI).

**C. Inventory operations**
13. Inter-branch stock transfer (enum exists; no service/route/UI).
14. Stock reservation on held bills (reserved* fields all static zero).
15. Reorder suggestions/PO-from-reorder (reorderLevel data exists; dashboard flags low stock; no workflow to act on it).
16. Stock-taking/cycle-count sessions (single adjustments exist; no counted-vs-system batch count sheets, variance approval in bulk).
17. Real file upload/storage (evidence, prescription scans, product images). `UPLOAD_DIR` env + `File` model exist; no upload endpoint exists anywhere.

**D. Clinical/pharmacy-domain**
18. Prescription line items + dispense-tracking against them (partial filling, remaining quantities).
19. Drug-interaction / allergy / duplicate-therapy checks (no drug database integration at all).
20. Patient/medical-history profile (Customer is a billing entity; no patient record linkage beyond name/phone on Rx).
21. Doctor management UI (full CRUD API + audit exists and is orphaned — no pages).

**E. Operations & admin**
22. Audit-log viewer (API + filtering UI) — auditors cannot see the audit trail.
23. Audit-log integrity protection (hash-chaining is described in `Audit_Trail_Policy.md`; nothing implements it; rows are mutable via DB/business actions).
24. Data export/import beyond product CSV (sales/purchases/inventory export; backup & restore tooling — docs describe plans, no scripts).
25. Barcode *generation*/label printing (scan-in only).
26. Rate limiting / API throttling; login CAPTCHA-equivalent protection.
27. API for third-party integration (no API keys, no webhooks, no OpenAPI; `Integration_Design_Document.md` describes an EHR/MQTT world that does not exist in code).
28. Branch switcher in the UI (branch-bound users are fine; global/manager users cannot switch operating branch in the header).
29. Multi-organization tenancy (deliberately single-org; documented).
30. Software update/rack utilization analytics for the store-layout module (Walls→Bins exist; `currentFill`/`capacity` never drive utilization views).

---

## 6. Incomplete Features (exist but partially implemented)

For each: what exists → what's missing/broken → files involved → layer at fault.

### 6.1 POS loose-tablet dispensing 🔴
- **Exists:** full cart model for strips+loose tabs, partial-strip stock capping, fractional price preview, payload field `looseUnits` (`src/components/pos/pos-client.tsx`).
- **Missing/broken:** server rejects every `looseUnits > 0` (`src/lib/sales/sales-service.ts:618`); inventory is strip-denominated; SaleItem fields (`billedUnits/looseUnits/totalBaseQty`) hardcoded `looseUnits: 0`.
- **Expected:** either strip-only UI (remove controls) or real base-unit inventory (`tabsPerStrip` conversion) with FEFO in base units.
- **Layer:** frontend ↔ backend contract mismatch. **Result: clicking the visible loose-units input guarantees checkout failure.**

### 6.2 Prescription lifecycle 🔴
- **Exists:** register → approve/reject; POS association gate (`prescription-service.ts`, `sales-service.ts`).
- **Missing:** `DISPENSED` transition on sale (no writer), `EXPIRED` sweep, line items, per-item dispense quantities, dispense history beyond Sale.prescriptionId join.
- **Layer:** service + schema (no PrescriptionItem model).

### 6.3 Credit notes 🟡→🔴
- **Exists:** issuance on CREDIT refunds, 1-year expiry, customer ledger credit, list/detail APIs + table (`sale-return-service.ts`, `/api/credit-notes`).
- **Missing:** redemption (no POST, `createSale` can't consume them), expiry sweep (EXPIRED status unreachable), cancellation.
- **Layer:** API + service (no redeem function).

### 6.4 Chief-tier adjustment evidence 🔴
- **Exists:** evidence-required rule + uniqueness check at service level (`inventory-service.ts:621-641`), `File` model + `POST /api/files` (URL registration).
- **Missing:** upload endpoint; `adjustment-form.tsx` has **no evidence field**; approve dialog doesn't attach evidence. Chief-tier approvals are unposable through the UI.
- **Layer:** frontend + file subsystem.

### 6.5 GRN as an entity 🟡
- **Exists:** receive workflow creating batches/inventory/payables (`purchase-service.ts createGrn`).
- **Missing:** GRN table, stored GRN number, multi-GRN history per PO, GRN print; `listGrns` masquerades PO numbers as GRN numbers; uniqueness check compares grnNumber against `purchaseNumber` (wrong field).
- **Layer:** schema + service.

### 6.6 Notifications/alerts ⛔(schema-only)
- **Exists:** models, enum, preferences, seeded toggles (`schema.prisma`, `prisma/seeds/settings.ts`).
- **Missing:** everything else — generators, API, UI, delivery. 
- **Layer:** full vertical absence.

### 6.7 Audit trail visibility 🔴
- **Exists:** rich writers with old/new JSON + metadata across ~30 flows.
- **Missing:** read API, viewer page (`/audit` = "Coming in Phase 9" placeholder), filters, export, tamper-evidence (docs promise hash chains).
- **Layer:** API + UI.

### 6.8 Held bills 🟡
- **Exists:** 24h `expiresAt`, per-user CRUD (`sales-service.ts`, `/api/pos/held-bills`).
- **Missing:** expiry enforcement (list includes expired rows; no cleanup job), stock reservation, cross-register visibility policy, restore re-validation messaging.
- **Layer:** service + housekeeping.

### 6.9 GST on returns & IGST on sales 🔴
- **Exists:** solid per-line posting for sales+purchases, negative mirror entries on cancel, interstate split on purchases.
- **Missing:** any GST row for sale/purchase returns; IGST branch for sales; period lock after filing.
- **Layer:** gst-service + return services.

### 6.10 Finance GL 🟡
- **Exists:** COA, ledgers, manual entries, settlement postings.
- **Missing:** double-entry enforcement, automatic journals for sales/purchases/returns/expenses, trial balance/P&L views, expense workflows.
- **Layer:** finance-service.

### 6.11 Supplier payments & 3-way match history 🟡
- **Exists:** POST endpoints function.
- **Missing:** GET list endpoints are stubbed to return `data: []` with `TODO` comments (`src/app/api/supplier-payments/route.ts:52`, `src/app/api/three-way-match/route.ts:52`) — fake-success placeholders.
- **Layer:** API.

### 6.12 Purchase-return integrity 🔴
- **Exists:** RTV flow with inventory reversal + supplier debit.
- **Broken/weak:** client-priced refunds; no GST ITC reversal; negative batch quantities possible; ledger DEBIT sign inconsistency; no dispatch tracking transitions beyond status strings.
- **Layer:** service.

### 6.13 Store layout 🟡
- **Exists:** full Wall/Rack/Shelf/Bin CRUD APIs, bin stock assignment service, locator.
- **Missing:** assignment UI depth (dialogs exist but bin-assignment from GRN/put-away flow absent), `StoreBin.currentFill` never updated (grep: only schema/default), utilization/over-capacity warnings, cold-chain telemetry (doc-only).
- **Layer:** UI + service instrumentation.

### 6.14 Settings 🟡
- **Exists:** typed POS accessors with defaults, approval-policy + WhatsApp + org + MFA editors.
- **Missing:** editor for POS toggles (`pos.max_discount_percent`, `inventory.fefo_enabled`, `gst.tax_inclusive`, etc.) — `/settings/general` is a placeholder; several seeded keys (`expiry_alert_days`, `negative_stock`, `low_stock_enabled`, `payment_due_enabled`, `date_format`, `decimal_places`, `default_gst_rate`) are never read → dead configuration.
- **Layer:** UI + dead settings.

### 6.15 Password reset ⛔(adapters-only)
- **Exists:** token model, email envs, nodemailer dep, middleware whitelist, user-facing error text pointing at it.
- **Missing:** the flow itself.
- **Layer:** API + UI + mailer.

### 6.16 MFA 🟡
- **Exists:** TOTP crypto (AES-GCM), setup/verify routes, enrollment card, pending-token challenge.
- **Missing:** enforcement for every non-owner role (`mfa-service.ts:97` `isOwner && user.mfaEnabled`), backup/recovery codes, admin reset of a user's MFA.
- **Layer:** auth service.

### 6.17 Doctors master 🟡
- **Exists:** CRUD API with org scoping + audit (`/api/doctors*`).
- **Missing:** any UI page; sidebar has no entry. H1 register links doctor by `registrationNo` (string) — doctors are invisible to operators.
- **Layer:** UI.

### 6.18 Dead vertical slices (intentionally built, never connected)
- `Inventory.reservedQuantity`, `Batch.reservedQuantity`, `BinStock.reservedQty` — reservation subsystem.
- `Sale.upiQrData`, `Sale.thermalSlipPrinted`, `User.mustChangePassword`, `Product.dpcoCeiling`/`Batch.dpcoCeiling` (enforcement), `MovementType.TRANSFER`, PurchaseStatus `'SENT'` transitions in `updatePurchase`/`createGrn` (enum lacks SENT — unreachable code), `NotificationPreference`, `decision=QUARANTINE` pathway semantics.

---

## 7. Functional / Business Logic Problems

Workflow traces (UI → API → service → DB) — end-to-end verdicts:

### 7.1 Purchasing: Supplier → PO → GRN → Batch → Inventory → Payment
- End-to-end **works** for the happy path with good discipline (over-receive guard, QC gates, payable accrual).
- **Problems:** (a) GRN identity not persisted (§6.5); (b) concurrent over-receive window (§4.6); (c) batch re-receipt uniqueness collision (§4.3🔴); (d) 6-month expiry acceptance rule is hardcoded — slow-moving but legal short-dated stock cannot be received at all; (e) payable accrues at PO cost formula forever — supplier invoice price variances (the reason 3-way match exists) never adjust the accrued payable; (f) supplier payments reduce balance even below zero without warning (unbounded `decrement`).

### 7.2 Selling: Customer → Search → Batch → Rx → Cart → Discount/Tax → Payment → Invoice → Deduction
- Core **works** with strong transactional guarantees.
- **Problems:** (a) batch-MRP ignored → legal price per batch not honored (🔴 compliance + margin); (b) loose-units UI guaranteed failure (🔴); (c) prescription gate satisfiable infinitely by one stale Rx (🔴 controlled drugs); (d) Rx item match not validated (no Rx items exist); (e) credit-limit never checked → unlimited exposure per customer (🔴 business rule field decorative); (f) IGST never on interstate wholesale (🔴 tax); (g) `derivePaymentStatus` marks any-CREDIT-line sale as CREDIT even when fully cash-covered; (h) invoice-level discount absent (line-level only); (i) expired-aggregate inventory shown as available can lead cashiers into "insufficient at FEFO" dead ends (UX/business mismatch); (j) same-day expiry boundary: batch expiring *today* is sellable (`gte now`) — regulatory grey zone, undocumented.

### 7.3 Returns: Sale → Return → Validation → Refund/Credit → Stock → Audit
- Flow exists with per-line caps.
- **Problems:** (a) no GST reversal (🔴 statutory misstatement); (b) QUARANTINE decision silently voids stock tracking (🔴); (c) RESTOCK into expired/blocked batch — aggregate/batch divergence (🔴); (d) refund has no Payment record at all (returns reduce nothing in cash terms — the refund money movement is untracked; only a ledger/credit-note entry exists); (e) returned expired goods can go back to EXPIRED batch + available aggregate (see (c)); (f) `returns:approve` permission/per-row approval state unused — returns are self-approved at creation; (g) sale status PARTIALLY/FULLY_RETURNED blocks `cancelSale` correctly ✅ but no partial-cancel exists.

### 7.4 Expiry: Batch → Monitor → Warn → Block → Dispose → Report
- Monitor (views/reports/sweep) + block sale (FEFO exclusion) + dispose **work**.
- **Problems:** (a) **Warn never happens** — no alerts/notifications (🔴 operational: the 30/60/90 classifications exist only if someone opens the page); (b) expired stock keeps inflating `availableQuantity` until manually disposed (misleading stock KPIs); (c) disposal writes inventory write-off movement ✅ but no GST/stock-value reporting hook, and disposal reason audit depends on route-layer audit only; (d) lazy sweep means stale ACTIVE statuses persist between reads (acceptable, but "expired" listing is the only enforcement trigger — no scheduled job).

### 7.5 Inventory: Purchase → Stock Entry → Batch → Movement → Adjustment → Current Stock → Report
- **Works** with CAS.
- **Problems:** (a) positive adjustments inflate aggregate stock with **no batch** (aggregate vs FEFO divergence by design — later sales of adjusted-only stock fail at allocation: `reconcileBatchesForNegativeAdjustment` even throws "possible diverged inventory" when divergence exceeds batch availability); (b) `computeStockStatus`/status filter in memory (perf); (c) opening stock via adjustment has no batch capture → same divergence; (d) negative adjustment approval pre-check reads availability **outside** the transaction for create (benign, re-checked inside apply ✔).

### 7.6 Cross-cutting rule violations documented above (consolidated)
| Rule | State | Where |
|---|---|---|
| Cannot sell expired/blocked stock | ✅ enforced (FEFO filter + pinned-batch guard) | sales-service.ts |
| Cannot oversell | ✅ enforced (aggregate check + batch CAS + serializable) | sales-service.ts |
| Cannot sell loose units | ❌ UI allows, server rejects | pos-client vs sales-service |
| Sell at batch printed MRP | ❌ product MRP always used | sales-service.ts / pricing.ts |
| Discount ceiling | ✅ enforced server-side (settings + permissions) | sales-service.ts |
| Credit limit per customer | ❌ never checked | sales-service.ts |
| One Rx → one dispense | ❌ Rx never consumed | sales-service.ts |
| H1/NDPS register on sale/cancel/return/dispose/GRN | ✅ chained with balances | all services |
| Interstate GST split | ⚠ purchases only | gst vs pricing |
| GST reversal on returns | ❌ absent | sale-return-service.ts |
| Double-entry balance in GL | ❌ single-sided manual entries | finance-service.ts |
| No negative inventory | ⚠ aggregate guarded; batch can go negative on purchase return | purchase-service.ts |
| Posted-filed GST immutable | ❌ isFiled not enforced | gst-service.ts |

---

## 8. Database Audit

**Strengths:** broad, thoughtful coverage (60 models); line-level GST identity with a real unique constraint; narcotic register uniqueness keyed to (reference, product, batch); per-branch invoice counter moved into the Branch row (good CAS anchor); snapshot columns on SaleItem (productName/sku/hsn at sale time); indexes on the hot paths (batch expiry, product name/sku/barcode, sale branch+date, ledgers by party+date, movement reference).

**Weaknesses:**

| # | Issue | Evidence | Impact |
|---|---|---|---|
| D1 | `StockAdjustment.productId/branchId` are **plain strings with no FK relations** (service comment admits "StockAdjustment has no product relation") → dangling references possible; service compensates with second queries and "Unknown product" fallbacks | `schema.prisma` StockAdjustment; `inventory-service.ts:getAdjustments` | integrity + query cost |
| D2 | `Batch @@unique([productId, batchNumber])` is **global across branches and time** — blocks legitimate re-receipt of a batch number and cross-branch same-batch stock | schema.prisma:695 | GRN failures |
| D3 | No GRN table (GRN number/date stored on Purchase as a singular `receivedAt`; detail only inside movement notes/audit metadata) | purchase-service.ts:createGrn | lost receipt history |
| D4 | No PrescriptionItem table; no RX itemization | schema.prisma | dispense validation impossible |
| D5 | `Payment` has no status/voided/reversal fields — cancel flow overwrites `amount=0`, destroying data | sales-service.ts cancelSale | financial audit loss |
| D6 | `Expiry sweep` & `HeldBill.expiresAt` & `CreditNote.expiresAt` & `Prescription EXPIRED` — 4 time-based state machines ship with **zero scheduled jobs** (only lazy sweep on batch reads) | schema + services | stale states accumulate |
| D7 | No DB-level CHECK constraints (negative quantities prevented only at app level; batch already reachable negative via purchase return) | migration SQL review | integrity reliance on app |
| D8 | `Reservation` columns ×3 permanently zero — dead weight signaling an unfinished design | schema + grep | confusion |
| D9 | Audit/history tables lack TTL/partition strategy; `inventory_movements`, `audit_logs`, `batch_status_log` grow unbounded with no archival plan | schema (no archival models) | growth at scale |
| D10 | Missing indexes: `Notification(userId,isRead)` exists but module unused; `Sale(createdById)`, `Payment(customerId/supplierId)`, `SaleReturn(saleId)` unindexed (FK-ish lookups used in joins/filters); `HeldBill(expiresAt)` unused anyway | schema.prisma | slow look-ups at scale |
| D11 | `GstTransaction.returnPeriod` string with no enum; `Purchase.invoiceNumber` not unique per supplier (duplicate supplier bill entry possible) | schema.prisma | duplicates |
| D12 | `Customer/Supplier/Payment` have no `branchId` — party balances are org-global by schema (documented), but this hard-blocks per-branch finance views and any future multi-org evolution | schema + finance-service scope comments | design ceiling |
| D13 | No `deletedAt`/soft-delete pattern anywhere except `isActive`; Customer/Doctor/Product deletes are physical or guarded-physical | services | recovery/compliance |
| D14 | Migration `20260917155251_merge_master_compliance_pos_schema_gap` name says "merge" — content fine, but the codebase has **one squashed commit** (git history lost) making forensic schema archaeology impossible | prisma/migrations + git log | maintainability |

## 9. Backend / API Audit

**Strengths:** every session route permission-gated (only `/api/eod/send` legitimately uses a shared secret — checked all 96 files); zod validation on virtually every mutating route (25 validation modules, all unit-tested); server money-authority in sales; serializable transactions + CAS + retry wrapper in the 4 danger zones (sale/sale-return/cancel/adjust); org-scoped branch guard centralized in `branch-access.ts` and consistently applied in services.

**Weaknesses:**

| # | Issue | Evidence | Severity |
|---|---|---|---|
| B1 | **Error mapping by message-prefix string matching** — every route re-implements `message.startsWith('Forbidden')→403 …` with slightly different tables; some routes fall through to 400 and some to 500 for the same service error; stack-free but inconsistent and fragile (rename a message → wrong status) | e.g. `api/sales/route.ts` vs `api/files/route.ts` (`:500` default) vs `api/store/locate/route.ts` (always 400, leaks raw message) | M |
| B2 | Raw service/Zod error **messages returned to clients verbatim** (`error.message` passthrough) — leaks internals (FK names, "Conflict: …" details) and makes API contract = English prose | all routes | M |
| B3 | Stub endpoints returning fabricated success (`/api/supplier-payments GET`, `/api/three-way-match GET`) | TODO comments | M |
| B4 | No pagination caps enforced consistently — report APIs cap at 2000 but in-memory; POS search caps 60; list APIs accept arbitrary `limit` up to schema max (typically 100) | validations/*.ts | M |
| B5 | No rate limiting / throttle / lockout-by-IP on auth or API (account lockout is per-account only; credential stuffing across many accounts unimpeded) | global | **H** |
| B6 | **No request-id/structured logging**; only `console.log` in eod route and Prisma query logs in dev; no error tracking hook (Sentry envs commented) | global | M |
| B7 | Long-running transactions: `createSale` runs interactive serializable tx performing N×(batch reads+CAS)+registers+GST — 15s timeout; with many lines/batches under contention, abort→retry storms possible | sales-service.ts (integration tests cover small-N) | M |
| B8 | Race: `POST /api/users` checks email uniqueness **outside** transaction then inserts (benign rare P2002 → 400); `createSupplier` has no gstin uniqueness check (duplicates possible) | routes/services | L |
| B9 | Narcotic balance chain uses `orderBy entryDate desc` "latest balance" as chain anchor — entries written with `new Date()` vs backdated `entryDate` inputs (GRN passes `command.grnDate`!) can interleave out of order → wrong running balances when backdated receipts occur | gst/purchase/narcotic writers | **H** (data correctness in compliance register) |
| B10 | `requirePermission` runs `getSession()` = session decode + **per-request DB user lookup** on every API call (necessary for isActive, but doubles DB load without cache) | auth-helpers.ts | M (perf) |
| B11 | Dead API surface: `/api/batches POST` absent by design but `createBatch` service exists for tests; `/api/pos/config` exposes settings to any sales:create user (low risk); `/api/permissions` lists all codes to any `roles:manage` — fine | routes | L |
| B12 | Inconsistent error codes (`success:false, error:{code:'ERROR'|'VALIDATION'|'CONFLICT'|'NOT_FOUND'}` chosen ad hoc per route) | all routes | L |

## 10. Frontend / UI / UX Audit

**Strengths:** consistent Shadcn/Radix design system; permission-filtered sidebar; server-rendered pages with permission gates on ~49/63 dashboard pages (the rest are client components that call gated APIs — acceptable but renders chrome before failing); shared DataTable with debounced search/pagination; empty-state + spinner + confirmation-dialog primitives; receipt dialog with auto-print; form validation via react-hook-form + zod; POS genuinely optimized for keyboard/barcode flow.

**Weaknesses:**

| # | Issue | Evidence | Severity |
|---|---|---|---|
| F1 | Loose-units control visible & guaranteed to fail (server) — worst UX bug in the product | pos-client.tsx:1575 vs sales-service.ts:618 | **C** |
| F2 | Placeholder pages shipped in nav: `/audit`, `/settings/general` ("Coming in Phase 9"); dead route constants for `/reports/purchases`, `/reports/financial` rendered nowhere but exported from `ROUTES` | pages + routes.ts | M |
| F3 | No global toast for API 401/403 distinction — most views show generic "Failed to load"; error states rely on `toast.error(message)` with server prose | components/*-view.tsx | M |
| F4 | No skeleton/loading strategy on several server pages (blocking SSR fetches → blank waits); client views inconsistently use spinners vs nothing (e.g., wholesale client price totals show placeholder math `cartGst() = cartSubtotal() + 0 // placeholder`) | wholesale-invoice-client.tsx:95 | M |
| F5 | `/* eslint-disable */` at the top of `sidebar.tsx` and `no-unsafe-*` disables in `approval-policy-form.tsx`, broad eslint suppression in pos-client — lint safety deliberately weakened on key UI files | file headers | L |
| F6 | No accessibility pass: custom `<table>` + dialogs fine, but POS modal focus traps unverified; aria coverage spotty; `eslint-plugin-jsx-a11y` is configured yet negated where convenient (see F5) | config + components | M |
| F7 | No dark-mode toggle despite `next-themes` dep; no responsive (mobile) POS layout work — tables overflow below md breakpoints (desktop-first) | components | L |
| F8 | Branch context invisible — header shows no branch; global users can't tell which branch a sale/adjustment targets until each form's own selector | header.tsx | M |
| F9 | Dead component `customers-table.tsx` (orphan; the live one is `customer-table.tsx`), dead `fefo-service.ts` (80 lines); suggests merge debris | grep | L |
| F10 | Print CSS: receipt is `window.print()` of a dialog — no @media print stylesheet, no 58/80mm thermal width control; invoice-type setting (thermal/a4) switches almost nothing | pos-client receipt | M |
| F11 | Date/currency formatting partly hardcoded (`en-IN`, `₹`) despite seeded `date_format`/`currency_symbol`/`decimal_places` settings — settings are dead (see 6.14) | utils/currency.ts, date.ts | L |

## 11. Security Audit

Verified by reading auth plumbing, all routes, seeds and configs. Nothing was executed against the app.

| # | Risk | Evidence / Where | Severity |
|---|---|---|---|
| S1 | **Seed credentials weak & forced change absent**: `Admin@123`/`Manager@123` etc. printed in seeds + PROGRESS.md; `mustChangePassword` never set; a forgotten seed in prod = trivial takeover with **publicly documented usernames/passwords** | `prisma/seeds/users.ts` | **C** (if deployed unrotated) |
| S2 | **Password reset missing + error hints point to it** — password-less users told to "use the password reset flow" that doesn't exist; recovery requires another admin | mfa-service.ts; no route | H |
| S3 | **MFA enforced for owner role only** — any other role with mfaEnabled gets no challenge; enrollment UI implies protection that isn't there | mfa-service.ts:97 | H |
| S4 | No rate limiting on `/api/auth/*`, login, or any API (per-account lockout ≠ stuffing/DOS protection); no WAF/reverse-proxy config shipped | global | H |
| S5 | **Audit trail not tamper-evident & partially destructive**: rows updatable/deletable by DB role; cancelSale zeroes payment amounts; no login auditing; no viewer (so nobody would notice) | §4.10 | H |
| S6 | Meta WhatsApp **access token stored plaintext** in `organization_settings` (readable by anyone with org-settings read; DB dump = token leak); contrast with properly-encrypted TOTP secret (`mfa-crypto.ts`) | eod settings route + whatsapp-sender | M |
| S7 | Middleware matcher excludes any path starting with `public` → anything placed under `public/uploads/` (the configured `UPLOAD_DIR`) would be served **unauthenticated** (prescription scans/evidence are medical documents). Uploads don't exist yet, so this is latent — but the config + File URL model makes the unsafe outcome likely when uploads are added | `src/middleware.ts` matcher; `.env.example` | M |
| S8 | Broad `next/image` remotePatterns `https://**` + prescription images by arbitrary URL → SSRF-ish resource fetching & tracking-pixel vectors when images render (low for Next image, but policy is wide open) | next.config.js | L |
| S9 | `EOD_REPORT_SECRET` compared with `===` (non-constant-time; theoretical timing oracle on a server route) and documented default "your-random-secret-here" | eod/send/route.ts | L |
| S10 | JWT valid 30 days; **role/permission changes don't propagate to live tokens** except when permissions array is empty (heal path) — de-authorized users keep elevated rights until re-login; isActive IS checked per request ✅ (that part is right) | auth-config.ts jwt callback | M |
| S11 | CSRF: mutations are same-origin JSON APIs behind session cookies — NextAuth CSRF covers login only; JSON+Bearer-style cookie session on POST routes relies on SameSite=Lax cookie default (acceptable) but no explicit Origin checks anywhere | routes | L |
| S12 | Security headers only on `/api/*` (nosniff/XFO/XXSSP); HTML pages get none (no CSP, no HSTS, no Referrer-Policy) | next.config.js | M |
| S13 | Error messages to clients carry internals (B2) — user-enumeration resisted at login ("Invalid email or password" ✅) but 404/403 distinction leaks resource existence everywhere else | routes | L |
| S14 | `Session`/`Account` NextAuth tables exist but JWT strategy means server sessions unused; `password` column nullable-by-design with no policy gate when creating users without passwords | schema + auth | L |
| S15 | Locked-out timing: lock count increments before lock evaluation `failedCount >= 4` (5th failure locks) — fine; but **no audit of lockouts** and no unlock-by-admin path documented in UI | mfa-service.ts | L |

**No critical injection/exposure found**: Prisma parameterized queries everywhere (no raw SQL interpolated), zod validation pervasive, no secrets in git (`.env*` ignored; only `.env.example` with placeholders — verified), bcrypt-12, encrypted TOTP, good branch-org scoping.

---

## 12. Performance & Scalability Audit

**Will strain at 10k products / 100k+ sales / multi-user load:**

| # | Hot spot | Evidence | Risk |
|---|---|---|---|
| P1 | **All reports load full tables then slice in memory** (`getDailyStockPosition`, `getNearExpiry`, `getNarcoticRegister`, `getConsumptionReport` (every SALE movement in range with product join), `getSupplierPerformance` (every supplier + purchases), `getSalesFinancials` (every completed sale in range)) | report-service.ts | 100k rows → multi-second APIs / OOM on node |
| P2 | Inventory **status filter** loads entire branch inventory then filters in memory ("acceptable at this scale" comment) | inventory-service.ts:200-218 | same |
| P3 | `getExpiringBatches` loads all window batches + in-memory severity filter | expiry-service.ts | same |
| P4 | `searchPosProducts` does `barcodes: {some: {contains}}` relation search with leading-wildcard `%term%` `contains` — PG trigram-less ILIKE across 10k products × per-keystroke debounced calls; inventory second query per search (fine) but no caching, no materialized stock view | sales-service.ts | POS latency creep |
| P5 | `fullTextSearch` Prisma preview feature enabled but **never used** — search is `contains/insensitive` everywhere | schema header + grep | missed index opportunity |
| P6 | Dashboard is ~10 sequential-ish queries/page including `batch.findMany` of **all ACTIVE batches** summing in JS (getInventoryValue) + all low-stock + all expiring + groupBys | dashboard/queries.ts | dashboard TTFB grows linearly |
| P7 | Per-request double DB hit for auth (session user isActive) with no short-lived cache | auth-helpers.ts | ×2 queries per API call at high RPM |
| P8 | No DB indexes noted in D10; no read replicas/connection pooling guidance; Prisma default pool on serverless will exhaust PG fast (deployment doc suggests traditional server) | prisma.ts | prod reliability |
| P9 | Frontend: product grids/tables fetch per keystroke with debounce ✅, but no virtualized tables for 10k-row inventories; recharts re-renders whole datasets client-side | components | UI jank |
| P10 | No caching anywhere (no unstable_cache/Redis); POS product search, HSN lists, category options re-queried constantly | global | load |

**Verdict:** fine for a single store today (≈ thousands of SKUs, tens of thousands of sales). Not fine for the stated growth scenarios without P1–P6 fixes (DB-side pagination/aggregation, trigram or FTS indexes, and at minimum aggregate pre-computation for reports).

## 13. Testing Audit

**Executed during this audit:** `npx jest --selectProjects unit` → **58 suites / 521 tests: 511 passed, 10 failed.**

Failure analysis:
- **9 failures are environment artifacts**: this sandbox cannot run `prisma generate` (binary download blocked), so `Prisma.Decimal`, `Prisma.PrismaClientKnownRequestError`, and enum objects like `NarcoticMovementType` don't exist at runtime (failures in `gst-service.test.ts` ×6-ish, `batch-service.test.ts`, `product-import.test.ts` ×2). In a normal dev environment with a generated client these pass (CI confirms the pattern historically — 449 tests green per PROGRESS.md).
- **1 genuine repo failure: `src/lib/settings/settings-service.test.ts`** — `getPosSettings()` gained a `lowStockThreshold` field (code) but the test's expected object was never updated → test suite **red in the repository itself**. Small, but it means "npm run test" fails on master as committed (also signals no enforced branch protection with the current CI).

**Coverage reality vs targets:**
- Test infrastructure: excellent dual Jest projects (unit mocks + **24 real-Postgres integration suites** for sales/purchase/returns/finance/adjustments/POS/concurrency/compliance chains — genuinely rare quality), Playwright e2e ×4 specs (smoke, api-validation, comprehensive-validation, full-audit — but full-audit/comprehensive look like one-off generated harnesses rather than maintained user flows).
- Gaps (PROGRESS.md Phase 8 admits 15%): auth helpers/permissions (partial), users/roles/org/branches routes **untested**, most UI components untested (only ~5 component tests exist: product-table, import-dialog, adjustments-table, empty-state + validations), dashboard/report UIs untested, e2e requires manual DB seed and `npm run start` (no CI e2e), no coverage threshold configuration in Jest (run `jest --coverage` ad hoc), visual/accessibility tests none.
- **CI is misconfigured:** `.github/workflows/ci.yml` triggers only on branch `pharmacare-phase2` — pushes/PRs to `master` or feature branches **run nothing**. Also CI runs unit tests with `--passWithNoTests`, never the 24 Postgres integration suites despite provisioning a Postgres service, never Playwright, never `type-check` failures relevant to e2e. So the red settings test + any regression currently merge silently.
- Husky pre-commit runs lint-staged (ESLint+Prettier only) — no type-check/test gate locally.

## 14. Production Readiness Audit

| Area | State | Gap |
|---|---|---|
| Env config | `.env.example` complete incl. MFA_ENCRYPTION_KEY/EOD secret | No env validation at boot (missing MFA key throws only when encrypting); `SHADOW_DATABASE_URL` required for migrate dev only |
| Secrets mgmt | gitignored envs; encrypted TOTP | WhatsApp token plaintext in DB; no rotation strategy |
| Logging | Prisma query logs in dev | No structured logging, request IDs, or log sinks in prod |
| Error tracking | None | Sentry envs present but unwired |
| Monitoring/health | None | No `/healthz`, no uptime/readiness endpoints |
| Migrations | 11 committed Prisma migrations + `migrate deploy` script | No CI gate for schema drift; advisory-lock/rollback runbook is doc-only |
| Backup/recovery | Docs only (Backup_Disaster_Recovery_Plan.md) | **No scripts, no schedules, no restore tests** |
| Deployment | `start.bat` (Windows local helper) + PROGRESS setup steps | **No Dockerfile, no docker-compose, no PM2/systemd unit, no reverse-proxy config, no PaaS manifest**; Deployment_Guide_Runbook.md is generic; EOD cron requires an extra hand-run process with no supervisor |
| Security | §11 | rate limiting, headers on pages, audit integrity, seed password rotation runbook |
| Testing | 521 unit + 24 integration + 4 e2e locally | CI broken-branch trigger; 1 red test committed; no coverage gates |
| Documentation | 50+ files | Materially stale/aspirational in places (see §17-L); docs describe React-SPA+Express+Redis architecture and features (EHR, MQTT, alert dashboards) that don't exist; IMPLEMENTATION_BASELINE.md refresh needed |
| Reliability | CAS+transactions strong in mutations | No scheduled jobs (expiry/held-bill/credit-note sweeps), no queue, no retry for Meta API failures |
| Data lifecycle | — | No archival/partitioning/TTL for audit_logs/movements; no GDPR/DPDP data-subject workflows (docs promise them) |
| Scalability | §12 | DB-side reporting + indexes + caching needed |

**Production-ready?** **No.** Realistic path: fix Critical/High in §15, then Phase-9 items (deployment, monitoring, backups, audit viewer, notifications). The foundation is solid enough that this is weeks of disciplined work, not a rewrite.

---

## 15. Priority Matrix

Issues reference earlier sections. Each entry maps to the full template (Category, Current→Expected, Why it matters, Files, Dependencies, Suggested fix). Grouped by priority, ordered by implementation sequence within each tier.

### 🔴 CRITICAL
| # | Issue | Current → Expected | Why it matters | Files/Modules | Depends on | Suggested solution |
|---|---|---|---|---|---|---|
| C1 | POS loose-units guaranteed failure | UI sells loose tabs; server throws `Loose-unit dispensing is not supported` | Cashiers hit a wall at the counter; silent regression of a shipped feature | `pos-client.tsx`, `sales-service.ts:618`, `sale.ts` validation | — | Choose one: (a) hide loose controls until supported, or (b) implement base-unit (tablet) inventory: convert qty×tabsPerStrip through FEFO, store totalBaseQty per batch. (b) is domain-correct for Indian retail pharmacy |
| C2 | Prescriptions never consumed | APPROVED Rx gates unlimited H/X sales | Controlled-drug audit hole; regulator (Drugs & Cosmetics Rules Sch H1) expects Rx-dispense linkage | `sales-service.ts` (add DISPENSED transition + item match), `prescription-service.ts`, schema (PrescriptionItem) | — | On sale: verify Rx status, mark DISPENSED, record items; add PrescriptionItem model; block re-use |
| C3 | Sale cancel wipes payment data | `cancelSale` sets `Payment.amount=0` | Destroys financial audit; refunds unreconcilable | `sales-service.ts` cancel; `Payment` schema (+status fields) | — | Add payment status/void + explicit `REFUND` payment rows; never mutate original amounts |
| C4 | Sale/purchase returns skip GST | No GstTransaction rows on returns | GSTR-1/3B misstated; ITC not reversed → statutory exposure | `sale-return-service.ts`, `purchase-service.ts`, `gst-service.ts` | — | Post negative/credit-note GST rows keyed to return docs (extend unique key), mirror cancelSale pattern with proper doc type |
| C5 | QUARANTINE return decision silently voids stock | No batch block, no inventory movement, no quarantine record for returned goods | Returned medicines physically exist but digitally vanish — diversion/theft risk; DAMAGE_WRITE_OFF records a zero-delta movement | `sale-return-service.ts` | — | Model a quarantine state (batch BLOCKED w/ reason or dedicated QuarantineStock table + movement), require disposition decision, audit |
| C6 | Seed/default credentials unfenced | Weak public passwords, `mustChangePassword` unused | Instant compromise if deployed seeded | `prisma/seeds/users.ts`, users API, login gate | — | Set `mustChangePassword=true` on seeded/admin-created users; enforce change flow before dashboard access; document rotation |

*(C2+C4+C5 are also legal-compliance issues for an Indian pharmacy; C1/C3/C6 are operational/security.)*

### 🟠 HIGH
| # | Issue | Current → Expected | Files/Modules | Depends on | Suggested solution |
|---|---|---|---|---|---|
| H1 | Password reset flow absent | → token-based email reset + page (adapters exist) | auth API+UI, nodemailer | mail config | POST /api/auth/reset/*, reset page, TTL+single-use tokens, audit |
| H2 | MFA owner-only | → MFA honored for every role that enables it (+policy to require for privileged roles) | `mfa-service.ts:97` | — | Drop `isOwner &&` gate; add role-policy; recovery codes |
| H3 | No rate limiting | → IP+account throttling on auth & public POSTs | middleware/auth routes | — | Add edge/DB-backed limiter (token bucket), 429 with retry-after |
| H4 | Audit viewer absent (`/audit` placeholder, no API, dead `audit:read` permission) | → filterable read API + page + export | new `/api/audit*`, audit page | — | GET with entity/user/date filters, pagination, permission-gated |
| H5 | Notifications ghost module | → generators (low-stock sweep, expiry, payment due), list/read API, bell UI, at least in-app delivery | new services+routes+UI | H4 pattern | Sweep service (cron/Node-cron or lazy-on-login), Notification writes, per-user prefs honored |
| H6 | Credit notes can't be redeemed | → apply CN to a sale / refund settlement; balanceUsed/status transitions | sales-service, credit-notes API | C3 | Accept creditNoteId in createSale payments; FEFO-oldest CN auto-apply option |
| H7 | Batch MRP not used at sale | → price = dispensed batch's MRP (product MRP as fallback); multi-price batches priced legally | sales-service, pricing | — | Price per allocation slice from batch.mrp; keep product.mrp for display |
| H8 | IGST never on sales | → interstate split via branch.state vs customer.state (purchase side already does) | pricing.ts, sales-service, gst-service | — | Resolve states at sale; set igst/cgst+sgst accordingly |
| H9 | Customer credit limit decorative | → block/override credit sales beyond limit+balance | sales-service, settings | — | Pre-check outstanding+new due vs creditLimit with manager-override audit |
| H10 | RESTOCK into expired/blocked batch | → validate batch sellability before restock; expired stock → quarantine/expiry-adjustment path, not available stock | sale-return-service.ts | C5 | Status+expiry check; route to EXPIRED-adjustment or quarantine |
| H11 | Purchase return math client-trusted + unbounded batch decrement | → unitCost from PO line server-side, taxed totals, batch floor guard, GST ITC reversal, ledger sign fix | purchase-service.ts | C4 | Server recompute; CAS floor; DEBIT/CREDIT convention doc + migration-safe fix |
| H12 | GRN not persisted | → GRN table (number, date, items, QC) with per-PO history + print | schema + purchase-service + listGrns fix | — | New model + migration; store grnNumber; keep transition on Purchase as rollup |
| H13 | Concurrent GRN over-receive (documented) | → row lock or serializable + in-tx remaining re-check | purchase-service.ts createGrn | H12 | `SELECT … FOR UPDATE` on purchase items inside tx (raw) or serializable isolation |
| H14 | Batch unique re-receipt collision | → uniqueness (productId,batchNumber,branchId) (+ allow re-receipt merging quantities) | schema migration + GRN logic | H12 | Relax constraint; on re-receipt update qty/expiry instead of failing |
| H15 | Finance GL single-sided & ops don't post | → double-entry journals for sales/purchases/returns/expenses; balanced manual journal form | finance-service, journal UI | C4, H11 | Journal entry model (header + ≥2 balanced legs); auto-post on ops |
| H16 | Narcotic chain anchors on wall-clock/backdated entryDate | → chain on strictly ordered sequence (id/serial), tolerate backdated GRNs | narcotic writers (4 files) | — | Add monotonic seq column; order by it; recompute-on-insert for backdates or reject backdates |
| H17 | Positive adjustments create batchless, un-sellable-at-allocation stock | → require batch capture (or auto-batch) on positive adjustments/opening stock | inventory-service.ts | H12 | Mandatory batch on positive qty; mirror GRN batch creation |
| H18 | Dashboard inventory value bug | → subtract soldQuantity | `dashboard/queries.ts:26` | — | One-line fix + test |
| H19 | Broken committed test + CI watches wrong branch | → green suite; CI on master+PRs, run integration suites on PG service | settings-service.test.ts, ci.yml | — | Update expected object; set branches [master]; add integration job |
| H20 | Report stock valuation at MRP | → value at purchase/cost price; align dashboard & report | report-service.ts | H18 | Cost-based valuation; offer MRP as secondary column |

### 🟡 MEDIUM
| # | Issue | Where | Suggested solution |
|---|---|---|---|
| M1 | In-memory pagination/report loads | report-service, inventory/expiry/inventory list | push filters+pagination to SQL; `_count` + skip/take; aggregates via groupBy |
| M2 | Error contract: prose-based status mapping, raw messages to client | all routes | central error classes → `errorResponse(e)` helper; stable codes; client-safe messages |
| M3 | Stub GET endpoints (supplier-payments, 3-way-match) + 3-way-match persistence | routes | implement lists; persist match results |
| M4 | Expired held bills never cleaned/enforced | sales-service | filter `expiresAt>now`; nightly cleanup job |
| M5 | No time-based jobs (expiry sweep is lazy-only; credit-note/prescription expiry unhandled) | services | one scheduler entrypoint (node-cron or cron API route guarded like EOD) running sweeps + notifications |
| M6 | Branch switcher absent; header shows no branch context | header/layout | branch selector for global users; show badge |
| M7 | Suppliers/customers/payments lack branchId (per-branch finance impossible) | schema | optional branchId + backfill (single-org default) |
| M8 | Manual journal single-sided (subsumed by H15) | finance | balanced editor |
| M9 | Security headers on pages (CSP/HSTS/Referrer-Policy), uploads confined+authenticated | next.config, middleware, future upload route | headers for `/` routes; serve files via signed, permission-checked route not `public/` |
| M10 | JWT role/permission staleness until re-login | auth-config | short `maxAge` or version-claim revalidation (e.g., user.permissionVersion in token vs DB) |
| M11 | Missing indexes D10 (Sale.createdById, Payment FK columns, SaleReturn.saleId) | schema | add in migration |
| M12 | Doctor master UI | new page + nav | reuse users-table patterns |
| M13 | POS print: no thermal width/@media print, invoice-type setting inert, no PDF invoice | pos receipt, jspdf | printable invoice component + jspdf A5/A4; respect `pos.invoice_type` |
| M14 | GST period lock after filing | gst-service | block edits/mark filed periods read-only |
| M15 | Duplicate supplier bill guard (supplier+invoiceNumber) | purchases | soft-unique check with warning |
| M16 | `purchaseNumber`/`RX/CN/SR/OB` random or epoch numbering → collision + ugly for auditors | services | per-branch/document-type counters like sales invoices |
| M17 | Deactivate-vs-delete hygiene (doctors hard delete with FK risk; suppliers PATCH-only) | routes | uniform isActive soft-delete + dependency guards |
| M18 | A11y/eslint suppression creep on key UI (`sidebar.tsx` eslint-disable) | components | remove blanket disables, fix real violations |
| M19 | `getInventory` status filter & POS search need trigram indexes/`pg_trgm` or FTS (fullTextSearch enabled but unused) | schema+queries | enable trigram indexes (Prisma `@@fulltext`/raw migration) at 10k+ |
| M20 | No API versioning/deprecation pattern (all routes v1-implicit) | api | document; `/api/v1` when integrating externally |

### 🟢 LOW
| # | Issue | Where | Fix |
|---|---|---|---|
| L1 | Repo junk: `invoice.pdf` (118KB), `generate_dummy.ts` (unsafe `.env` reader), `start.bat`, `scripts/build_section_*.py` one-off doc generators | repo root/scripts | remove/move to tools/, gitignore artifacts |
| L2 | Dead code: `customers-table.tsx`, `fefo-service.ts`, dead enums (SENT/TRANSFER), dead settings keys, dead permission constant uses | src | delete or wire |
| L3 | Unused deps: nodemailer(until H1), axios, handlebars, qs, nanoid, next-themes(maybe), cmdk, react-day-picker, xlsx(until export), @tanstack/react-query(+devtools), @types accordingly | package.json | prune or implement features that use them |
| L4 | Docs decay & architecture-fiction (SPA/Express/Redis style + EHR/MQTT/alert features that don't exist); `Known_Issues_Log` tracks phantom features; README count drift acknowledged in PROGRESS | documentation/ | baseline rewrite as part of next phase |
| L5 | `next.config.js` `images.domains` deprecated, env block redundant | next.config.js | tidy |
| L6 | console.log in eod route; no structured logger | global | pino/winston wrapper |
| L7 | Dark mode toggle absent despite next-themes | layout | enable ThemeProvider |
| L8 | `Batch.soldQuantity` vs SaleItemBatch double bookkeeping can drift — no reconciliation job | services | nightly reconciliation report (later) |

---

## 16. Master Missing-Features Backlog

| # | Missing / Weak Area | Module | Priority | Why Needed | Dependencies |
|---|---|---|---|---|---|
| 1 | Loose-unit (tablet-level) dispensing end-to-end | POS/Inventory | 🔴 C1 | Indian pharmacies sell loose tablets daily; UI promises it, checkout fails | Base-unit inventory decision |
| 2 | Prescription items + consumption (DISPENSED) | Prescriptions | 🔴 C2 | Schedule H/X compliance; no stale-Rx reuse | Schema migration |
| 3 | Payment void/refund records (non-destructive cancel) | Sales/Finance | 🔴 C3 | Financial audit integrity | Payment.status migration |
| 4 | GST adjustments on sale/purchase returns | Returns/GST | 🔴 C4 | Statutory correctness (GSTR-1/3B, ITC) | GstTransaction key extension |
| 5 | Quarantine stock state for returns | Returns/Inventory | 🔴 C5 | Returned goods must stay tracked | New table or batch state |
| 6 | Forced password change + rotation of seed creds | Auth | 🔴 C6 | Deployment blocker | mustChangePassword gate |
| 7 | Password reset (forgot/reset) | Auth | 🟠 H1 | Only recovery path today is admin | Nodemailer wiring (dep present) |
| 8 | MFA for all roles + policy + recovery codes | Auth | 🟠 H2 | Privileged roles unprotected today | — |
| 9 | Rate limiting (auth + APIs) | Security | 🟠 H3 | Credential stuffing/DOS | Limiter store |
| 10 | Audit-log viewer API + UI | Audit | 🟠 H4 | Compliance evidence & forensics | — |
| 11 | Notification engine + alert generation + UI | Notifications | 🟠 H5 | Low-stock/expiry/payment alerts are core pharmacy ops | Sweeps (M5) |
| 12 | Credit-note redemption | Returns/Sales | 🟠 H6 | Issued credit is unusable = money owed customers trapped | C3 |
| 13 | Batch-MRP pricing at POS | Sales | 🟠 H7 | Legal pricing per printed MRP; margin tracking | FEFO slices |
| 14 | Interstate IGST on sales | GST/Sales | 🟠 H8 | Wholesale B2B correctness | — |
| 15 | Credit-limit enforcement | Sales/Customers | 🟠 H9 | Receivables control | — |
| 16 | Restock validation (no expired-batch restock) | Returns | 🟠 H10 | Stock integrity | C5 |
| 17 | Purchase-return server pricing + floor + ITC reversal | Purchases | 🟠 H11 | Fraud/ledger accuracy | C4 |
| 18 | GRN entity + multi-GRN history + numbering | Purchases | 🟠 H12 | Real receipt audit trail | Migration |
| 19 | GRN over-receive serialization fix | Purchases | 🟠 H13 | Stock/liability overstatement | H12 |
| 20 | Batch uniqueness relaxation (re-receipt, branch) | Inventory | 🟠 H14 | Supplier reality breaks GRN today | H12 |
| 21 | Double-entry GL + auto journals + balanced manual entry | Finance | 🟠 H15 | Real accounting/P&L/trial balance | C4, H11 |
| 22 | Narcotic register monotonic sequencing | Compliance | 🟠 H16 | Register balance correctness under backdating | Migration |
| 23 | Batch capture on positive adjustments/opening stock | Inventory | 🟠 H17 | Ends aggregate-vs-FEFO divergence | H12 |
| 24 | Dashboard inventory-value soldQuantity fix | Dashboard | 🟠 H18 | KPI accuracy (wrong today) | — |
| 25 | CI branch fix + green suite + integration job | DevOps | 🟠 H19 | Regressions merge silently today | — |
| 26 | Cost-based stock valuation in reports (+ align dashboard) | Reports | 🟠 H20 | Asset value currently inflated at MRP | H18 |
| 27 | SQL-side pagination/aggregation for all reports + trigram/FTS search | Reports/Perf | 🟡 M1/M19 | 100k+ scale | Indexes |
| 28 | Unified error-handling helper + safe client messages | API | 🟡 M2 | Contract stability | — |
| 29 | Supplier-payment & 3-way-match history lists + persistence | Purchases | 🟡 M3 | Money trails | — |
| 30 | Held-bill expiry enforcement + cleanup | POS | 🟡 M4 | Cart hygiene | M5 |
| 31 | Scheduled jobs runner (expiry/credit-note/Rx expiry/held bills/notifications) | Platform | 🟡 M5 | All time-based state machines | — |
| 32 | Branch switcher + header branch badge | UX | 🟡 M6 | Multi-branch ops | — |
| 33 | branchId on customers/suppliers/payments | Schema | 🟡 M7 | Per-branch finance floor | Migration |
| 34 | Page-level security headers + authenticated file serving | Security | 🟡 M9 | XSS/data protections | (17) |
| 35 | Token freshness after permission changes | Auth | 🟡 M10 | De-authorization latency | — |
| 36 | Missing DB indexes (payments, sale.createdById, saleReturn.saleId) | DB | 🟡 M11 | Query plans | Migration |
| 37 | Doctors master UI | Compliance | 🟡 M12 | Orphaned CRUD API | — |
| 38 | Proper invoice PDF/thermal formats + pos.invoice_type honored | POS | 🟡 M13 | Real-world billing | jspdf present |
| 39 | GST filed-period lock | GST | 🟡 M14 | Post-filing integrity | — |
| 40 | Duplicate supplier-invoice guard | Purchases | 🟡 M15 | Double-pay prevention | — |
| 41 | Sequential document numbering everywhere (PO/PR/RX/CN) | All docs | 🟡 M16 | Auditability, no random collisions | Counter table |
| 42 | Uniform soft-delete & dependency guards | All masters | 🟡 M17 | Data recovery | — |
| 43 | Remove eslint blanket disables + a11y pass | Frontend | 🟡 M18 | Code safety/wcag | — |
| 44 | API versioning policy | API | 🟡 M20 | External integrations later | — |
| 45 | Repo hygiene (artifacts/one-off scripts) | Repo | 🟢 L1 | Cleanliness | — |
| 46 | Dead code/enum/settings cleanup | Various | 🟢 L2 | Confusion removal | — |
| 47 | Dependency prune (axios/qs/nanoid/cmdk/day-picker/handlebars/react-query…) | package.json | 🟢 L3 | Supply-chain & install weight | — |
| 48 | Documentation baseline rewrite | docs | 🟢 L4 | Onboarding truth | — |
| 49 | Expense management workflow | Finance | 🟢→🟡 (new) | Real P&L | H15 |
| 50 | Inter-branch stock transfer | Inventory | 🟢→🟡 (new) | Multi-branch ops | M7 recommended |
| 51 | Stock-taking/cycle-count sessions | Inventory | 🟢→🟡 (new) | Physical reconciliation | H17 |
| 52 | Reorder suggestions → draft PO | Purchasing | 🟢→🟡 (new) | Procurement efficiency | H5 data |
| 53 | Barcode label generation/printing | Catalog | 🟢 L3-linked | Store ops | — |
| 54 | Real file upload (S3/local) + prescription scan capture | Platform | 🟡 (foundational for 4-modules' evidence) | Evidence, scans, images | M9 |
| 55 | Backup/restore scripts + tested restore runbook | DevOps | 🟠 (prod blocker) | DR | — |
| 56 | Dockerfile/compose + process supervisor + health endpoint | DevOps | 🟠 (prod blocker) | Deploy | — |
| 57 | Data export (CSV) for masters/reports + full backup export | Platform | 🟡 | Owner control of data | M1 |
| 58 | Customer/patient profile + history view | Patients | 🟢→🟡 | Repeat dispensing | C2 |
| 59 | Drug interaction/allergy checks (external DB) | Clinical | 🟢 (later) | Safety | External provider |
| 60 | Audit-log hash-chain/tamper evidence | Audit | 🟢→🟡 (compliance hardening) | 21 CFR Part 11 aspirations | H4 |

---

## 17. Recommended Development Order

Dependency-aware sequence (foundation → core → advanced → hardening → reporting → testing → production → polish). Each step lists what unblocks next.

### Stage 0 — Safety net first (1–2 days)
1. **H19** Fix CI trigger (`master` + PRs), fix the red settings test, add integration job on the provisioned Postgres, add `--passWithNoTests` removal.
2. **L1/L2/L3** Repo hygiene: delete junk artifacts, dead components (`customers-table.tsx`, `fefo-service.ts`), prune unused deps.
   - *Unblocks: trustworthy green builds for everything after.*

### Stage 1 — Foundation: auth & data integrity (1–2 weeks)
3. **C6** Force-change on seeded/admin-created accounts; rotation runbook.
4. **H1** Password reset flow end-to-end (nodemailer finally used).
5. **H2** MFA for all roles + recovery codes; **H3** rate limiting on auth/APIs.
6. **C3** Payment void/refund rows (schema migration: Payment.status).
7. **C2** PrescriptionItem model + DISPENSED transition on sale + item matching.
8. **C5** Quarantine state for returns; **H10** restock validation; **H17** batch capture on positive adjustments/opening stock → ends all aggregate/batch divergence classes.
   - *Unblocks: correct stock accounting everywhere downstream.*

### Stage 2 — Core pharmacy operations (2–3 weeks)
9. **C1** Loose-unit dispensing (decide strip-only vs base-unit; implement chosen path through FEFO + pricing + returns).
10. **H7** Batch-MRP pricing; **H9** credit-limit enforcement.
11. **C4/H8/H11** GST completion: return adjustments, IGST on sales, purchase-return ITC reversal + server-priced returns + batch floor.
12. **H12/H13/H14** GRN entity migration, over-receive serialization, batch uniqueness relaxation (one combined migration window).
13. **H16** Narcotic register monotonic sequencing (same migration window).
14. **H6** Credit-note redemption in `createSale`.
   - *Unblocks: a legally correct selling/returning/purchasing loop.*

### Stage 3 — Advanced features (2 weeks)
15. **H5** Notification engine + sweeps (**M5** scheduler entrypoint) + bell UI; expiry/low-stock/payment alerts.
16. **H15** Double-entry GL + post-on-ops journals + expense workflow (49).
17. **M3/M15/M16** Purchases polish: match history, duplicate-bill guard, sequential doc numbering (all types).
18. **M12** Doctors UI; **(50)** inter-branch transfers (**M7** optional schema prep now); **(51)** cycle counts.
19. **(54)** Real file upload + evidence UI (chief approvals finally usable) + prescription scan capture — with authenticated serving (**M9**).
   - *Unblocks: the "complete product" feature set.*

### Stage 4 — Security hardening (1 week, overlapping)
20. **M9/M10** page security headers, token freshness, uploads hardening; **S6** encrypt WhatsApp token at rest; **(60)** audit hash-chain.
21. **M18** remove eslint blanket-disables; a11y pass.

### Stage 5 — Reporting & analytics (1–2 weeks)
22. **H18/H20** valuation fixes; **M1/M19** SQL pagination + indexes/trigram.
23. New reports: profit/margin (COGS via SaleItemBatch×purchasePrice), purchases, customer aging, payments, returns, movers, dead stock; CSV export (**(57)**); GST portal export.
24. Regenerate reports hub; implement `/reports/purchases` & `/reports/financial` or remove dead constants.

### Stage 6 — Testing & quality (continuous from Stage 1, formalize here)
25. Route tests for users/roles/org/branches; component tests for top-10 views; Playwright happy-path suite in CI (login→sell→receive→return→report) with seeded test DB; coverage gates at 70%→85%.
26. Concurrency regression pack for the fixes in Stage 2 (mirror existing integration patterns).

### Stage 7 — Production readiness (1–2 weeks)
27. **(55)** Backup/restore scripts + rehearsed restore; **(56)** Dockerfile/compose, health checks, supervisor for app + EOD cron; structured logging (**L6**) + Sentry wiring.
28. Env boot validation; secret rotation playbook; deploy runbook refresh (**L4** docs baseline rewrite ships here too).
29. Load test (k6) at target scale (10k products / 1M sale items); fix fallout from Stage 5 indexes.

### Stage 8 — UI/UX polish (1 week)
30. **M6** branch switcher + header badge; **M13** invoice/thermal print formats; **L7** dark mode; responsive tables; empty/error-state standardization sweep.
31. Dead route constants/placeholder pages resolved; docs (Training, User Manual) updated to reality.

> Effort estimate above assumes 1–2 senior engineers; it is sequencing guidance, not a commitment.

---

# WHAT THIS PROJECT NEEDS NEXT

**The ten most important things, in order:**

1. **Stop the bleeding in sales/returns (Critical C1–C5):** loose-units UI/server mismatch, prescription consumption, non-destructive cancel, GST on returns, quarantine stock. These are correctness and legal-compliance issues in the module the pharmacy touches most. *Everything else waits on these being right.*
2. **Close the authentication loop (C6, H1–H3):** forced password changes + rotation of seeded creds, a real reset flow, MFA for all roles, rate limiting. Cheap, fast, and they unlock safe deployment.
3. **Make stock accounting converge (H10, H17, H14, H12, H13):** batch capture on positive adjustments, quarantine for non-restockable returns, batch re-receipt, real GRN entities under row-lock. One coordinated migration kills the whole class of aggregate-vs-batch divergence.
4. **Turn on the lights: notifications + audit viewer (H4, H5, M5):** the system already *collects* everything (audit rows, low-stock math, expiry classes, balances due) — build the scheduler, the generators, the read APIs and the two screens. Highest business-value-per-effort in the entire backlog.
5. **Price legally and completely (H7–H9, C4):** batch-MRP pricing, IGST for interstate, credit limits, GST-complete returns.
6. **Make Finance real (H15, M3):** balanced journals, postings from operations, expense workflow, then P&L/trial-balance become possible.
7. **Fix the data-plane before growth (M1, M19, H18, H20, M11):** SQL-side reporting, index pass, valuation fixes — while data is still small.
8. **Repair engineering safety nets (H19, then Stage 6):** CI on master, green suite, integration + e2e in CI, coverage gates.
9. **Write the production story (Stage 7):** Docker, backups + restore rehearsal, health/monitoring, secret hygiene (incl. the plaintext WhatsApp token), env validation, EOD cron under a supervisor.
10. **Then the roadmap features (Stage 3→8):** file uploads, doctors UI, transfers, cycle counts, reorder→PO automation, exports, branch switching, print formats, dark mode/responsive — and prune the aspirational documentation to match reality.

**Bottom line:** the transactional core is trustworthy; the *seams* (returns, lifecycle consumption, alerts, audit visibility) and the *last mile to production* (auth completion, deployment, observability) are where this project currently fails a real pharmacy. Execute Stage 0–2 and the system becomes safe to pilot; execute through Stage 7 and it becomes operable at scale.

---

## Appendix — Audit Method & Evidence

- **Files inspected:** all 96 API routes; all 60 service/lib modules under `src/lib` (fully read: sales, pricing, fefo, batch, expiry, inventory, purchases, returns, finance, gst, reports, prescriptions, customers, doctors, narcotic, org, settings, store, eod, mfa, branch-access, retry, dashboard queries); 63 dashboard pages (all headers + permission gates grepped, ~25 read fully); ~97 components (all imported references resolved); full Prisma schema (1,528 lines) + all 11 migrations (names/dates/purpose); all seed files; all test configs, CI workflow, husky/lint-staged, env template, next/tailwind/tsconfig; `PROGRESS.md` + sampled 12 of 58 documentation files (incl. IMPLEMENTATION_BASELINE, Known_Issues_Log which track features absent from code).
- **Executed:** `npm ci` (952 pkgs clean install — reproducible), full unit suite (results in §13).
- **Not executable in sandbox:** `tsc --noEmit`, `next build`, integration & e2e suites (Prisma engine binaries blocked; requires live PostgreSQL) — flagged where relevant rather than assumed.
- **Repository state after audit:** unchanged (`git status` clean; `node_modules` + partial Prisma client generated locally are gitignored).
- **Dead code proof:** `customers-table.tsx` (no importers), `fefo-service.ts` (no importers), `Notification*` models (0 writers/readers), `reservedQuantity` fields (0 mutators), `MovementType.TRANSFER`/PurchaseStatus `SENT` (unreachable), `Sale.upiQrData`/`thermalSlipPrinted`/`User.mustChangePassword` (0 producers/consumers), `reports:export`-style dead constants (`AUDIT_READ`, `INVOICES_PRINT`, `REPORTS_FINANCIAL` unused in api/lib).

*End of audit report — generated for documentation purposes only. No production code was modified.*





