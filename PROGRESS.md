# PharmaCare — Development Progress

> **Project:** Pharmacy Management System  
> **Stack:** Next.js 14 · TypeScript · Prisma · PostgreSQL · Shadcn/ui · NextAuth.js  
> **Started:** September 2026  
> **Target:** 22 weeks (9 phases)

---

## 📊 Overall Progress

```
Phase 0: Foundation           ████████████████████ 100% ✅
Phase 1: Core Infrastructure  ████████████████████ 100% ✅
Phase 2: Product & Inventory  ████████████████████ 100% ✅
Phase 3: Point of Sale        ████████████████████ 100% ✅
Phase 4: Purchase Management  ░░░░░░░░░░░░░░░░░░░░   0% ⏳
Phase 5: Prescriptions/Returns░░░░░░░░░░░░░░░░░░░░   0% ⏳
Phase 6: Financial & GST      ░░░░░░░░░░░░░░░░░░░░   0% ⏳
Phase 7: Reporting & Analytics░░░░░░░░░░░░░░░░░░░░   0% ⏳
Phase 8: Testing & Refinement ████░░░░░░░░░░░░░░░░   15% 🔧
Phase 9: Deployment & Launch  ░░░░░░░░░░░░░░░░░░░░   0% ⏳
```

---

## ✅ Phase 0: Foundation — COMPLETE

**Goal:** Project setup, architecture decisions, database design

| Task                                 | Status | Notes                            |
| ------------------------------------ | ------ | -------------------------------- |
| Next.js 14 project initialized       | ✅     | TypeScript strict mode           |
| package.json with all dependencies   | ✅     | 952 packages installed           |
| tsconfig.json (strict, path aliases) | ✅     | `@/*` → `src/*`                  |
| tailwind.config.ts                   | ✅     | PharmaCare green brand colors    |
| ESLint + Prettier config             | ✅     | Tailwind plugin included         |
| .gitignore, .env.example             | ✅     | All secrets documented           |
| components.json (Shadcn/ui)          | ✅     | Default slate style              |
| Complete Prisma Schema               | ✅     | **35+ models, all 20 modules**   |
| Prisma seed scripts                  | ✅     | Roles, users, org, HSN, products |

### 📦 Database Schema Coverage (all 20 modules)

| Module        | Tables                                                                | Status |
| ------------- | --------------------------------------------------------------------- | ------ |
| Auth          | users, accounts, sessions, verification_tokens, password_reset_tokens | ✅     |
| Users & Roles | roles, permissions, role_permissions, user_roles                      | ✅     |
| Organization  | organizations, branches, organization_settings                        | ✅     |
| Products      | products, categories, product_categories, product_barcodes, hsn_codes | ✅     |
| Inventory     | inventory, inventory_movements, stock_adjustments                     | ✅     |
| Batches       | batches, batch_status_log, batch_disposals                            | ✅     |
| POS           | sales, sale_items, sale_item_batches, payments, held_bills            | ✅     |
| Prescriptions | prescriptions, prescription_images                                    | ✅     |
| Purchases     | purchases, purchase_items, purchase_returns, purchase_return_items    | ✅     |
| Returns       | sale_returns, sale_return_items, credit_notes                         | ✅     |
| Customers     | customers, customer_ledgers                                           | ✅     |
| Suppliers     | suppliers, supplier_ledgers                                           | ✅     |
| Finance       | ledgers, ledger_entries                                               | ✅     |
| GST           | tax_rates, hsn_codes, gst_transactions                                | ✅     |
| Expiry        | (via batches + batch_disposals)                                       | ✅     |
| Reports       | (via aggregations on existing tables)                                 | ✅     |
| Notifications | notifications, notification_preferences                               | ✅     |
| Files         | files                                                                 | ✅     |
| Audit         | audit_logs                                                            | ✅     |
| Settings      | system_settings                                                       | ✅     |

---

## ✅ Phase 1: Core Infrastructure — COMPLETE

**Goal:** Authentication, user management, permissions, and organization setup

### Week 3: Authentication

| Task                                               | Status | File(s)                                    |
| -------------------------------------------------- | ------ | ------------------------------------------ |
| NextAuth.js configuration                          | ✅     | `src/lib/auth/auth-config.ts`              |
| Credentials provider (email+password)              | ✅     | `src/lib/auth/auth-config.ts`              |
| Account lockout (5 failed → 15min)                 | ✅     | `src/lib/auth/auth-config.ts`              |
| JWT with permissions + roles                       | ✅     | `src/lib/auth/auth-config.ts`              |
| Session type extensions                            | ✅     | `src/lib/auth/types.d.ts`                  |
| Auth helper functions (`can`, `requirePermission`) | ✅     | `src/lib/auth/auth-helpers.ts`             |
| Route protection middleware                        | ✅     | `src/middleware.ts`                        |
| NextAuth API route                                 | ✅     | `src/app/api/auth/[...nextauth]/route.ts`  |
| Login page UI                                      | ✅     | `src/app/(auth)/login/page.tsx`            |
| Login form component                               | ✅     | `src/components/auth/login-form.tsx`       |
| Session provider                                   | ✅     | `src/components/auth/session-provider.tsx` |
| Password reset flow                                | ⏳     | Target: Auth enhancement                   |
| CSRF protection                                    | ✅     | Handled by NextAuth                        |
| Rate limiting                                      | ⏳     | Target: Security hardening                 |

### Week 4: User & Role Management

| Task                              | Status | File(s)                                                                               |
| --------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| User list API (GET /api/users)    | ✅     | `src/app/api/users/route.ts`                                                          |
| User create API (POST /api/users) | ✅     | `src/app/api/users/route.ts`                                                          |
| User detail/update/delete API     | ✅     | `src/app/api/users/[id]/route.ts`                                                     |
| Roles list/create API             | ✅     | `src/app/api/roles/route.ts`                                                          |
| Permissions API                   | ✅     | `src/app/api/permissions/route.ts`                                                    |
| User management UI                | ✅     | `src/components/users/user-table.tsx`, `user-form.tsx`, `role-assignment.tsx`         |
| Role management UI                | ✅     | `src/components/roles/role-list.tsx`                                                  |
| Permission matrix UI              | ✅     | `src/components/roles/permission-matrix.tsx`                                          |
| Shared components                 | ✅     | `data-table.tsx`, `loading-spinner.tsx`, `empty-state.tsx`, `confirmation-dialog.tsx` |

### Week 5: Organization Setup

| Task                         | Status | File(s)                                                                        |
| ---------------------------- | ------ | ------------------------------------------------------------------------------ |
| Organization API (GET, PUT)  | ✅     | `src/app/api/organization/route.ts`                                            |
| Branch management API (CRUD) | ✅     | `src/app/api/branches/route.ts`, `src/app/api/branches/[id]/route.ts`          |
| Organization Service         | ✅     | `src/lib/organization/org-service.ts`                                          |
| UI Store & Custom Hooks      | ✅     | `src/lib/stores/ui-store.ts`, `use-auth.ts`, `use-toast.ts`, `use-debounce.ts` |
| Database seeding             | ✅     | `prisma/seeds/*.ts`                                                            |

### Seed Data

| Seed                                                                            | Status |
| ------------------------------------------------------------------------------- | ------ |
| 60 permissions                                                                  | ✅     |
| 6 default roles (Owner, Manager, Pharmacist, Cashier, Purchase Mgr, Accountant) | ✅     |
| Default organization (PharmaCare Medical Store, Bangalore)                      | ✅     |
| 4 default users (admin, manager, pharmacist, cashier)                           | ✅     |
| 20 system settings (POS, inventory, notifications, GST)                         | ✅     |
| 12 HSN codes (pharmaceutical)                                                   | ✅     |
| 10 product categories + 5 sample products                                       | ✅     |

---

## ⏳ Phase 2: Product & Inventory — IN PROGRESS

**Target:** Weeks 6–8 | **Modules:** 4, 5, 6

### ✅ Product Master — COMPLETE

| Task                                                  | Status | File(s)                                                                                    |
| ----------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ |
| Product service (CRUD, search, pagination)            | ✅     | `src/lib/products/product-service.ts`                                                      |
| Validation schemas (Product, Category, HSN)           | ✅     | `src/lib/validations/product.ts`                                                           |
| Category API (GET/POST + tree, options)               | ✅     | `src/app/api/categories/route.ts`, `[id]/route.ts`, `options/route.ts`                     |
| Product API (GET/POST + search, filters)              | ✅     | `src/app/api/products/route.ts`, `[id]/route.ts`                                           |
| HSN codes API (list)                                  | ✅     | `src/app/api/hsn-codes/route.ts`                                                           |
| Category manager UI (tree + flat, dialog form)        | ✅     | `src/components/categories/category-manager.tsx`, `category-tree.tsx`, `category-form.tsx` |
| Product catalog UI (search, filter, paginated)        | ✅     | `src/components/products/product-catalog.tsx`, `product-table.tsx`                         |
| Product form UI (create/edit, HSN/GST, barcodes)      | ✅     | `src/components/products/product-form.tsx`                                                 |
| Product list page (server-rendered, permission-gated) | ✅     | `src/app/(dashboard)/products/page.tsx`                                                    |
| Category management page                              | ✅     | `src/app/(dashboard)/products/categories/page.tsx`                                         |
| New product page                                      | ✅     | `src/app/(dashboard)/products/new/page.tsx`                                                |
| Product detail page                                   | ✅     | `src/app/(dashboard)/products/[id]/page.tsx`                                               |
| Edit product page                                     | ✅     | `src/app/(dashboard)/products/[id]/edit/page.tsx`                                          |
| SKU / barcode uniqueness guards                       | ✅     | API routes + service functions                                                             |
| Audit log on create + delete                          | ✅     | API routes call `prisma.auditLog.create`                                                   |
| Permission seeds (products:*, categories:manage)      | ✅     | `prisma/seeds/permissions.ts`, `prisma/seeds/roles.ts`                                     |

### ✅ Inventory Management — COMPLETE

| Task                                                       | Status | File(s)                                                                                             |
| ---------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------- |
| Inventory service (list, search, status, pagination)       | ✅     | `src/lib/inventory/inventory-service.ts`                                                            |
| Branch access control (org-scoped)                         | ✅     | `src/lib/inventory/branch-access.ts`                                                                |
| Validation schemas (movement, adjustment, query)           | ✅     | `src/lib/validations/inventory.ts`                                                                  |
| Stock adjustment service (auto-approve ≤10, workflow)      | ✅     | `src/lib/inventory/inventory-service.ts` (threshold + PENDING/APPROVED/REJECTED)                    |
| Stock apply + movement recording (transactional, CAS)      | ✅     | `applyStockAdjustment` + `InventoryMovement` (ADJUSTMENT, before/after, reference)                  |
| Inventory API (list with branch/status filters)            | ✅     | `src/app/api/inventory/route.ts`                                                                    |
| Movements API (list, filters)                              | ✅     | `src/app/api/inventory/movements/route.ts`                                                          |
| Adjustments API (list + create + audit log)                | ✅     | `src/app/api/inventory/adjustments/route.ts`                                                        |
| Approve / reject APIs (+ audit log)                        | ✅     | `src/app/api/inventory/adjustments/[id]/approve                                                     | reject/route.ts` |
| Accessible branches API (filter options)                   | ✅     | `src/app/api/inventory/branches/route.ts`                                                           |
| Stock overview page (server-rendered, permission-gated)    | ✅     | `src/app/(dashboard)/inventory/page.tsx`, `src/components/inventory/inventory-overview.tsx`         |
| Movements page                                             | ✅     | `src/app/(dashboard)/inventory/movements/page.tsx`, `src/components/inventory/movements-view.tsx`   |
| Adjustment page + approve/reject UI + create dialog        | ✅     | `src/app/(dashboard)/inventory/adjustments/page.tsx`, `adjustments-view.tsx`, `adjustment-form.tsx` |
| Tables (inventory, movements, adjustments)                 | ✅     | `src/components/inventory/*-table.tsx`                                                              |
| Concurrency safety (optimistic CAS → 409, no double-apply) | ✅     | `updateMany` guarded by `updatedAt` + `status=PENDING`                                              |

#### Known Limitations (Inventory)

- **Session has no `organizationId`** — org isolation resolves through the user's `branchId`; users without a branch assignment are treated as global (consistent with the app's single-org model).
- **Optimistic concurrency fails fast (409)** — no automated retry; the user reviews and resubmits.
- **Role seeds vs RBAC doc**: RBAC_Matrix.md says Pharmacists can adjust stock, but the seeded Pharmacist role only has `inventory:read`. Enforcement is permission-driven; if adjustment-by-pharmacist is required, grant `inventory:adjust` to the Pharmacist role in seeds.
- **Stock status filter** is computed in memory (status is derived, not stored) — acceptable at this scale.
- **POST create/approve/reject return a scalar `AdjustmentSummary`** (no product/branch relations — `StockAdjustment` only relates to the creator); the UI refetches lists after mutations.

### ✅ Product CSV Import — COMPLETE

| Task                                                           | Status | File(s)                                                                                                             |
| -------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------- |
| CSV column contract + limits (2 MB / 1000 rows)                | ✅     | `src/lib/constants/product-import.ts`                                                                               |
| Import service (all-or-nothing, transactional)                 | ✅     | `src/lib/products/product-import.ts`                                                                                |
| Row validation + coercion (no silent mangling)                 | ✅     | `src/lib/validations/product.ts` (`productImportRowSchema`)                                                         |
| Import API (permission `products:import`, audit log)           | ✅     | `src/app/api/products/import/route.ts`                                                                              |
| Import dialog + catalog button (permission-gated)              | ✅     | `src/components/products/product-import-dialog.tsx`, `product-catalog.tsx`                                          |
| Categories by slug/name, active-HSN check, additional barcodes | ✅     | Service `getCategoryOptions` / `getHsnCodes` + `ProductBarcode` rows                                                |
| Duplicate guards (in-file SKU/barcode, DB sku/barcode)         | ✅     | Service pre-check + transaction (P2002 → 409)                                                                       |
| Tests (schema 11, service 34, route 10, dialog 5)              | ✅     | `product-import-schema.test.ts`, `product-import.test.ts`, `import/route.test.ts`, `product-import-dialog.test.tsx` |

### ✅ Batch Management — COMPLETE

| Task                                                                | Status | File(s)                                                                                     |
| ------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Validation schemas (batch, list query, create/update/block/dispose) | ✅     | `src/lib/validations/batch.ts`                                                              |
| Batch service (lifecycle + lazy expiry sweep)                       | ✅     | `src/lib/batches/batch-service.ts`                                                          |
| Batch creation service (duplicate + product guards, status log)     | ✅     | `createBatch` (used by future GRN/Purchases; **no create API** — creation is spec'd to GRN) |
| Batch list API (search, filters, branch scope, pagination)          | ✅     | `src/app/api/batches/route.ts`                                                              |
| Batch detail + update API (ACTIVE-only, non-lifecycle fields)       | ✅     | `src/app/api/batches/[id]/route.ts`                                                         |
| Block API (ACTIVE→BLOCKED, reason, status log, audit)               | ✅     | `src/app/api/batches/[id]/block/route.ts`                                                   |
| Dispose API (partial/full, DisposalReason, audit)                   | ✅     | `src/app/api/batches/[id]/dispose/route.ts`                                                 |
| Batch list page (server-rendered, permission-gated, filters)        | ✅     | `src/app/(dashboard)/batches/page.tsx`, `src/components/batches/batches-view.tsx`           |
| Batch table (expiry countdown, status, available qty)               | ✅     | `src/components/batches/batches-table.tsx`                                                  |
| Batch detail page (fields, stock, disposals, status history)        | ✅     | `src/app/(dashboard)/batches/[id]/page.tsx`                                                 |
| Edit / block / dispose actions (dialog forms)                       | ✅     | `src/components/batches/batch-detail-actions.tsx`                                           |
| Tests (service 22, route 22)                                        | ✅     | `src/lib/batches/batch-service.test.ts`, `src/app/api/batches/**/route.test.ts`             |

#### Batch Lifecycle (implemented)

- **Explicit transitions only:** `ACTIVE → BLOCKED` (block action, `batches:block`), `ACTIVE/BLOCKED/EXPIRED → DISPOSED` (dispose action, `batches:dispose`), `ACTIVE/BLOCKED → EXPIRED` (system sweep), `EXHAUSTED` terminal (reached programmatically by future POS consumption).
- **Expiry sweep is lazy** — `expireDueBatches()` flips due ACTIVE/BLOCKED batches to EXPIRED on list/detail reads; no cron/worker.
- Every transition writes a `BatchStatusLog` row; audits are written by the API routes (`BLOCK`/`DISPOSE`/`UPDATE`).

#### Known Limitations (Batch)

- **No batch creation API** — batches arrive via GRN/Purchases (out of scope); `createBatch` is service-level for that future flow.
- **Disposal does not mutate product-level inventory** — no linkage exists until GRN/Purchases land (documented in `documentation/IMPLEMENTATION_BASELINE.md` §9).
- **FEFO sell-time wiring** (POS calls `selectFefoBatches` and deducts stock transactionally) remains Phase 3 — the reusable FEFO selection service is now **complete** (see FEFO section below).
- **Expiry detection views** are now **COMPLETE** (see Expiry Detection section below).

### ✅ FEFO Selection (domain/service) — COMPLETE

| Task                                                                         | Status | File(s)                                                           |
| ---------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| Pure FEFO domain logic (eligibility, ordering, allocation)                   | ✅     | `src/lib/batches/fefo.ts`                                         |
| DB selection service (`selectFefoBatches`: product/branch scope, lazy sweep) | ✅     | `src/lib/batches/fefo-service.ts`                                 |
| Tests (pure + service)                                                       | ✅     | `src/lib/batches/fefo.test.ts` (38 tests)                         |
| Public API / UI                                                              | —      | **None** — FEFO is reusable service logic consumed by Phase 3 POS |

#### FEFO Rules (implemented)

- **Ordering:** earliest expiry date first (spec `Stock_Management_Module.md` §5, TC-STK-002). No manufacturing/creation/cost/quantity key. Equal expiry dates → deterministic tie-break by batch id (implementation choice, not a business rule).
- **Eligibility:** only `ACTIVE` batches with available quantity `> 0` and non-passed expiry are selectable. `BLOCKED` (quarantine), `EXPIRED`, `DISPOSED`, `EXHAUSTED` and zero-availability batches are excluded — never selected merely because they hold quantity.
- **Partial allocation:** greedy across batches (e.g. available 40/35/50 → request 100 = 40/35/25).
- **Insufficient stock:** never silently fulfilled — returns a structured result (`success` | `insufficient` + `shortfall` | `no_stock`).
- **Expiry handling:** expired (`expiryDate` passed / status `EXPIRED`) vs near-expiry (no alerting — that is the Expiry Detection task). Uses the existing single Batch expiry model.
- **Concurrency boundary:** selection is read-only **advisory** — it does NOT reserve or deduct stock. POS/dispensing must re-check and mutate batch rows transactionally (optimistic CAS, like stock adjustments). `fefo_enabled` organisation setting is seeded; POS decides whether to invoke FEFO.

### ✅ Expiry Detection — COMPLETE

| Task                                                              | Status | File(s)                                                                          |
| ----------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------- |
| Pure classification (days remaining + severity, injectable `now`) | ✅     | `src/lib/batches/expiry-service.ts` (`daysUntilExpiryDate`, `expirySeverity`)    |
| Expiring service (ACTIVE, (now, now+90], available > 0)           | ✅     | `getExpiringBatches` (severity filter + pagination)                              |
| Expired service (status EXPIRED after lazy sweep)                 | ✅     | `getExpiredBatches` (daysPast, oldest-first, pagination)                         |
| Expiry summary (hub counts, branch-scoped)                        | ✅     | `getExpirySummary`                                                               |
| Lazy sweep reuse (single expiry mechanism)                        | ✅     | `expireDueBatches()` called before every read                                    |
| Query validation schemas (expiring + expired)                     | ✅     | `src/lib/validations/expiry.ts`                                                  |
| API routes (GET, batches:read, branch scope)                      | ✅     | `src/app/api/expiry/expiring/route.ts`, `src/app/api/expiry/expired/route.ts`    |
| Expiring page (server-rendered, permission-gated)                 | ✅     | `src/app/(dashboard)/expiry/expiring/page.tsx`, `src/components/expiry/*`        |
| Expired page (server-rendered, permission-gated)                  | ✅     | `src/app/(dashboard)/expiry/expired/page.tsx`, `src/components/expiry/*`         |
| Expiry hub page (severity + expired summary cards)                | ✅     | `src/app/(dashboard)/expiry/page.tsx`                                            |
| Route constants                                                   | ✅     | `src/lib/constants/routes.ts` (`EXPIRY_EXPIRING`, `EXPIRY_EXPIRED`, API mirrors) |
| Tests (service 22, expiring route 6, expired route 4)             | ✅     | `expiry-service.test.ts`, `api/expiry/**/route.test.ts` (32 total)               |

#### Expiry Classification Rules (implemented)

- **Boundaries (inclusive), per `Batch_Expiry_Tracking.md` §3 / FAQ / DFD L2**: `daysRemaining = ceil((expiryDate - now) / 1 day)`; `≤ 30` → CRITICAL, `≤ 60` → WARNING, `≤ 90` → INFO, `> 90` → outside window, `≤ 0` → EXPIRED (never shown in the expiring view).
- **Expiring view** = `ACTIVE` status + positive available quantity + expiry strictly after `now` and `≤ now + 90d`. Zero-availability batches are not "at risk" stock and are excluded. BLOCKED/EXPIRED/DISPOSED/EXHAUSTED are excluded.
- **Expired view** = `status EXPIRED` only (kept consistent by the lazy sweep — a batch never appears here merely because its date passed). Oldest-expired first, deterministic tie-break by batch id.
- **No alerting** — no SMS/email/notifications/cron. The views are the alert surface (notification workflows are a future module).
- **No schema change, no new permissions** — reuses the single `Batch.expiryDate` model + `batches:read`.
- **Server-side authorization**: pages (`can`) and API routes (`requirePermission` + `resolveBranchScope`) both gate on `batches:read`.

#### Known Limitations (Expiry)

- **Severity classification + expiring pagination are in-memory** — the classification is derived from `now`, not stored; fine at this scale (90-day window).
- **Expired batches are the sweep's EXPIRED status**, not a separate "expiry date passed" computation everywhere — deliberate, so there is exactly ONE expiry mechanism.
- **`/batches/expiring` stub is untouched** (orphan route from the original spec, superseded by `/expiry/expiring`; out of scope).
- **Disposal of expired stock** is handled by the existing Batch dispose flow (`/batches/[id]/dispose`), not duplicated here.

### ⏳ Remaining Phase 2 Tasks

- [x] Batch management — lifecycle COMPLETE (FEFO sell-time selection stays in Phase 3 POS)
- [x] FEFO selection (domain/service) — COMPLETE (POS wiring stays in Phase 3)
- [x] Expiry detection (expiring/expired views + hub) — COMPLETE

**Phase 2 (Product & Inventory) is now fully delivered.** Phase 3 (POS, incl. the FEFO + expiry-aware dispensing wiring) is the next phase.

---

## ✅ Phase 3: Point of Sale — COMPLETE

**Target:** Weeks 9–11 | **Modules:** 7, 8

### ✅ POS / Billing — COMPLETE

| Task                                                                       | Status | File(s)                                                                                                               |
| -------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------- |
| Transactional sale service (`createSale`, Serializable + retry)            | ✅     | `src/lib/sales/sales-service.ts`                                                                                      |
| Server-side pricing (line + totals, GST split, round-off)                  | ✅     | `src/lib/sales/pricing.ts` (pure, unit tested)                                                                        |
| POS product search (name/SKU/barcode/additional barcodes)                  | ✅     | `searchPosProducts` + `/api/pos/products`                                                                             |
| FEFO/oldest-first stock allocation + optimistic CAS deduction              | ✅     | `allocateFefo` / `allocateByCreationDate` + `batch.updateMany` CAS                                                    |
| EXHAUSTED flip + `BatchStatusLog` on full depletion                        | ✅     | sales-service (`status: 'EXHAUSTED'`)                                                                                 |
| Inventory aggregate deduction (CAS by `updatedAt`) + `OUT`/SALE            | ✅     | sales-service + `inventoryMovement`                                                                                   |
| Concurrent invoice numbering (per-branch counter CAS)                      | ✅     | `buildInvoiceNumber` + `invoiceCounter` CAS                                                                           |
| Payment methods + balance logic (`cashReceived`, derive status)            | ✅     | `CASH/CARD/UPI/NETBANKING/CHEQUE/WALLET/CREDIT`, `PAID/PARTIAL/CREDIT/OVERPAID`                                       |
| Discount gate (`sales:discount`, `>max` → `discount_override`)             | ✅     | policy gates in `createSale`                                                                                          |
| Credit gate (`sales:credit` + `allow_credit_sales` + customer)             | ✅     | policy gates + inline customer capture                                                                                |
| Prescription gate (top-level `prescriptionId`, same branch)                | ✅     | preset gate + prescription branch check                                                                               |
| Held bills (save/load/delete, JSON cart)                                   | ✅     | `/api/pos/held-bills` + `[id]`                                                                                        |
| Sales validations (create/held-bill/query schemas)                         | ✅     | `src/lib/validations/sale.ts`                                                                                         |
| POS settings (`getPosSettings`: tax mode, round-off, max disc…)            | ✅     | `src/lib/settings/settings-service.ts`                                                                                |
| POS API routes (config, products, held-bills, sales)                       | ✅     | `src/app/api/pos/*`, `src/app/api/sales/*`                                                                            |
| POS billing UI (search + grid, cart, discount, payment dialog)             | ✅     | `src/app/(pos)/pos/page.tsx`, `src/components/pos/pos-client.tsx`                                                     |
| Printable receipt (`window.print`, auto-print setting)                     | ✅     | receipt dialog in `pos-client.tsx`                                                                                    |
| Sales history page + detail page                                           | ✅     | `src/app/(dashboard)/sales/page.tsx`, `src/components/sales/*`, `sales/[id]/page.tsx`                                 |
| Tests (pricing 30+, validation 16, service 40+, integration 21+, routes 9) | ✅     | `pricing.test.ts`, `sale.test.ts`, `sales-service.test.ts`, `sales-service.integration.test.ts`, `pos-routes.test.ts` |

#### POS Design (implemented)

- **Server authority on money** — the client never sends a price, tax or discount amount. It sends `productId`/`quantity`/`discountPercent`; `createSale` recomputes every amount from DB values using the pure pricing module. Client-side previews reuse the same pure functions with product rows.
- **Concurrency-safe consumption** — under `Serializable` isolation, per-batch CAS (`quantity`/`soldQuantity`/`status` match), inventory CAS (`updatedAt` match), counter CAS, P2033/P2034 retry wrapper. Oversell and double-deduction are impossible (exercised in `sales-service.integration.test.ts`).
- **Barcodes** — search matches `barcode`, `sku`, `name` and `additionalBarcodes`; Enter on a single result adds it (scanner-friendly).
- **Held bills** store the cart as JSON; loading re-validates against current stock at checkout, never at load.

#### Known Limitations (POS)

- **GST is intra-state only** — tax split always `cgst + sgst` from stored rates; state-level inter-state (`igst`) requires branch/organization state resolution (documented in `pricing.ts`).
- **GST-exempt lines** use their stored rates if any; exempt flag zeroes tax.
- **No return/refund UI** — Sale remains the source row for returns (Phase 5); the sales list shows `PARTIALLY_RETURNED`/`FULLY_RETURNED` statuses from future returns work.
- **No thermal A4/PDF generation** — receipt prints via browser print (A4 friendly); a dedicated invoice generator is a future enhancement.
- **Customer capture only for credit** — walk-in cash/UPI sales don't create customers (deliberate; matches `command.customer && !usingCredit` guard).

---

## ⏳ Phase 4: Purchase Management — NOT STARTED

**Target:** Weeks 12–13 | **Modules:** 9, 12

---

## ⏳ Phase 5: Prescriptions & Returns — NOT STARTED

**Target:** Weeks 14–15 | **Modules:** 8 (enhanced), 10, 11

---

## ⏳ Phase 6: Financial & GST — NOT STARTED

**Target:** Weeks 16–17 | **Modules:** 13, 14

---

## ⏳ Phase 7: Reporting & Analytics — NOT STARTED

**Target:** Weeks 18–19 | **Modules:** 15, 16, 17

---

## ✅ Testing Infrastructure — FOUNDATION ESTABLISHED

**Goal:** Establish minimal, correct testing and CI foundation (completed in this task)

### Testing Framework Setup

| Task                     | Status | Details                                                 |
| ------------------------ | ------ | ------------------------------------------------------- |
| Jest configuration       | ✅     | `jest.config.ts` with Next.js integration, path aliases |
| Jest setup               | ✅     | `jest.setup.ts` with @testing-library/jest-dom          |
| React Testing Library    | ✅     | Component testing support configured                    |
| Unit + integration tests | ✅     | 35 test suites, **400 tests passing**                   |
| TypeScript support       | ✅     | ts-jest with tsconfig.json                              |
| Coverage thresholds      | ✅     | Configured (0% baseline, ready to raise)                |

### Test Files

| File                                                           | Tests | Purpose                                                                       |
| -------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| `src/lib/utils/cn.test.ts`                                     | 4     | Utility function tests                                                        |
| `src/lib/validations/user.test.ts`                             | 9     | Zod schema validation tests                                                   |
| `src/components/shared/empty-state.test.tsx`                   | 4     | React component tests                                                         |
| `src/lib/validations/product.test.ts`                          | 31    | Product/Category/HSN/barcode schema tests                                     |
| `src/lib/validations/product-import-schema.test.ts`            | 11    | CSV row schema: coercion, defaults, rejections                                |
| `src/lib/products/product-service.test.ts`                     | 11    | Service CRUD, tree, uniqueness, pagination                                    |
| `src/lib/products/product-import.test.ts`                      | 34    | CSV service: file/parse/row/duplicate/tx behavior                             |
| `src/app/api/categories/route.test.ts`                         | 8     | Categories GET/POST auth + validation + conflict                              |
| `src/app/api/products/route.test.ts`                           | 8     | Products GET/POST auth + validation + conflicts + audit                       |
| `src/app/api/products/import/route.test.ts`                    | 10    | Import POST auth, file/size, audit, error mapping                             |
| `src/components/products/product-table.test.tsx`               | 6     | Product table rendering, badges, empty state                                  |
| `src/components/products/product-import-dialog.test.tsx`       | 5     | Import dialog select/validate/result/error UX                                 |
| `src/lib/inventory/inventory-service.test.ts`                  | 19    | Inventory list/status, movements, adjustment workflow                         |
| `src/app/api/inventory/route.test.ts`                          | 5     | Inventory GET auth + branch scope + validation + 500                          |
| `src/app/api/inventory/movements/route.test.ts`                | 4     | Movements GET auth + filters + validation                                     |
| `src/app/api/inventory/adjustments/route.test.ts`              | 6     | Adjustments GET/POST auth + validation + audit                                |
| `src/app/api/inventory/branches/route.test.ts`                 | 2     | Accessible branches GET                                                       |
| `src/app/api/inventory/adjustments/[id]/approve/route.test.ts` | 4     | Approve POST auth + audit + 404/409 errors                                    |
| `src/app/api/inventory/adjustments/[id]/reject/route.test.ts`  | 4     | Reject POST auth + audit + 404/409 errors                                     |
| `src/components/inventory/adjustments-table.test.tsx`          | 6     | Adjustments table rendering, actions, empty state                             |
| `src/lib/batches/batch-service.test.ts`                        | 22    | Batch lifecycle: create/update/block/dispose/expiry                           |
| `src/app/api/batches/route.test.ts`                            | 3     | Batches GET auth + validation + branch scope                                  |
| `src/app/api/batches/[id]/route.test.ts`                       | 7     | Batch GET/PATCH auth + 404 + validation + audit                               |
| `src/app/api/batches/[id]/block/route.test.ts`                 | 5     | Block POST auth + validation + 404/409 + audit                                |
| `src/app/api/batches/[id]/dispose/route.test.ts`               | 7     | Dispose POST auth + validation + 404/409/400 + audit                          |
| `src/lib/batches/fefo.test.ts`                                 | 38    | FEFO eligibility, ordering, allocation, insufficient, product/branch service  |
| `src/lib/batches/expiry-service.test.ts`                       | 22    | Expiry classification boundaries, expiring/expired views, summary             |
| `src/app/api/expiry/expiring/route.test.ts`                    | 6     | Expiring GET auth + validation + severity + branch scope                      |
| `src/app/api/expiry/expired/route.test.ts`                     | 4     | Expired GET auth + validation + branch scope                                  |
| `src/lib/sales/pricing.test.ts`                                | 30    | Pricing math: GST inclusive/exclusive, discount, exempt, round-off totals     |
| `src/lib/validations/sale.test.ts`                             | 16    | POS sale create / held-bill / query schemas                                   |
| `src/lib/sales/sales-service.test.ts`                          | 40    | Sale service: cashReceived, invoice number, held bills, policy gates          |
| `src/lib/sales/sales-service.integration.test.ts`              | 21    | Real-Postgres transaction: FEFO/CAS, oversell, counter, rollback, concurrency |
| `src/app/api/pos/__tests__/pos-routes.test.ts`                 | 9     | POS products/config/held-bills routes: auth, branch scope, validation         |

### CI/CD Pipeline

| Task                    | Status | Details                                        |
| ----------------------- | ------ | ---------------------------------------------- |
| GitHub Actions workflow | ✅     | `.github/workflows/ci.yml`                     |
| Dependency installation | ✅     | `npm ci --legacy-peer-deps`                    |
| Prisma generation       | ✅     | `npm run db:generate`                          |
| Database migrations     | ✅     | `npm run db:migrate:prod` (PostgreSQL service) |
| Type check              | ✅     | `npm run type-check`                           |
| Lint                    | ✅     | `npm run lint`                                 |
| Unit tests              | ✅     | `npm run test`                                 |
| Production build        | ✅     | `npm run build`                                |

### Pre-commit Hooks

| Task             | Status | Details                                    |
| ---------------- | ------ | ------------------------------------------ |
| Husky pre-commit | ✅     | `.husky/pre-commit` runs `npx lint-staged` |
| lint-staged      | ✅     | ESLint + Prettier on staged files          |

### Commands Verified

```bash
npm run type-check   # ✅ PASS
npm run lint         # ✅ PASS
npm run test         # ✅ PASS (400 tests)
npm run build        # ✅ PASS
```

---

## ⏳ Phase 8: Testing & Refinement — INFRASTRUCTURE READY

**Target:** Weeks 20–21

### Test Coverage Targets

- Overall: 80%+
- Auth, POS, Inventory: 90%+
- Business Logic: 95%+

### Current State: PRODUCT MASTER TESTED

Product Master (Category, Product, HSN, Barcode) and Inventory Management (stock, movements, adjustments) are now fully covered with unit, API integration, and component tests (132 total). Remaining coverage gaps are for later phases (Auth helpers, POS, Purchases, etc.).

### Remaining for Phase 8 Completion

- [ ] Unit tests for auth helpers, permission logic, Prisma utilities
- [ ] Integration tests for API routes (users, roles, organization, branches)
- [ ] Component tests for UI components (UserTable, RoleList, etc.)
- [ ] E2E tests for critical flows (login, user management)
- [ ] Database testing infrastructure (testcontainers or test DB)
- [ ] Raise coverage thresholds incrementally

---

---

## ⏳ Phase 9: Deployment & Launch — NOT STARTED

**Target:** Week 22 | **Modules:** 18, 19, 20

---

## 🗂️ Key Files Reference

| Category    | File                               | Purpose                   |
| ----------- | ---------------------------------- | ------------------------- |
| DB Schema   | `prisma/schema.prisma`             | All 35+ table definitions |
| Auth Config | `src/lib/auth/auth-config.ts`      | NextAuth setup            |
| Middleware  | `src/middleware.ts`                | Route protection          |
| DB Client   | `src/lib/db/prisma.ts`             | Prisma singleton          |
| Permissions | `src/lib/constants/permissions.ts` | All permission codes      |
| Routes      | `src/lib/constants/routes.ts`      | All app routes            |

---

## 🔐 Default Credentials (Development Only)

> ⚠️ Change all passwords before production deployment!

| User       | Email                       | Password    | Role       |
| ---------- | --------------------------- | ----------- | ---------- |
| Admin      | admin@pharmacare.local      | Admin@123   | Owner      |
| Manager    | manager@pharmacare.local    | Manager@123 | Manager    |
| Pharmacist | pharmacist@pharmacare.local | Pharma@123  | Pharmacist |
| Cashier    | cashier@pharmacare.local    | Cashier@123 | Cashier    |

---

## 📝 Setup Instructions

### 1. Prerequisites

- Node.js ≥18 ✅
- PostgreSQL running locally
- Git

### 2. Environment Setup

```bash
cp .env.example .env.local
# Edit .env.local with your DATABASE_URL and NEXTAUTH_SECRET
```

### 3. Generate NEXTAUTH_SECRET

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 4. Database Setup

```bash
npm run db:push        # Push schema to DB (dev)
npm run db:seed        # Seed with default data
npm run db:studio      # Open Prisma Studio (GUI)
```

### 5. Start Development

```bash
npm run dev            # http://localhost:3000
```

### 6. Login

Navigate to `http://localhost:3000/login` and use:

- Email: `admin@pharmacare.local`
- Password: `Admin@123`

---

## 🚀 Next Steps

### 📄 Documentation Reconciliation (Baseline) — Sept 2026

No source code was changed by this audit. A documentation-vs-code reconciliation is captured in **`documentation/IMPLEMENTATION_BASELINE.md`** (first file to read before starting a feature).

- `documentation/` contains **50 tracked files** (added in `3a2e08c`); `README.md` still says "38 files" — fix the count when the suite is next maintained.
- **9 placeholders** (title-only): SRS, BRD, Use_Case_Documents, User_Stories_Product_Backlog, Scope_Statement, Stakeholder_Analysis, HIPAA, FDA_21CFR_Part11, Data_Privacy_Policy. Templates without data: Bug_Defect_Reports, UAT_Sign_Off, Penetration_Testing_Reports. `Validation_Verification_Report.md` claims unverified "Pass" results (no k6/pentest/FEFO/audit-hash evidence).
- **Documented-as-design vs code**: architecture/API/DB/security/ops docs describe the rejected React-SPA + Express + Redis + JWT style; the actual code is Next.js 14 App Router + Prisma + NextAuth (permission-based).
- **Flagged conflicts (see baseline §9–§10)**: adjustment reason codes; approval tiers (≤10 self / 11–50 / >50 vs single-tier `inventory:approve_adjustment`); RBAC role set (`owner/manager/pharmacist/cashier/purchase_manager/accountant` vs doc roles); seeded Pharmacist has only `inventory:read`; `storage_condition` missing from `products`; no TOTP MFA / password policy; no `prisma/migrations/` (docs say Knex).
- **Statuses and percentages are unchanged** by this reconciliation.

### 📌 Specification Decisions & Gap Analysis — Sept 2026

Controlled decision task resolving the five `UNRESOLVED` items in `documentation/IMPLEMENTATION_BASELINE.md` §14 (record kept there). **No application code, schema, permissions, or auth changed.**

- **D1 Reason codes** → keep current `AdjustmentType` enum; mapping to doc vocabulary recorded. `QUALITY_REJECT` deferred to Purchases/GRN. (RESOLVED — documentation change)
- **D2 Approval tiers** → docs are internally inconsistent (module `>50 Chief` vs FAQ `>50 Manager` vs Test_Cases `>10 Manager`); implementation matches tier-1 and `PROGRESS.md` spec. **`UNRESOLVED` — requires project-owner decision** on adopting true 11–50 / >50 escalation. Not a Batch/FEFO blocker.
- **D3 `storage_condition`** → doc location = Product master (`VARCHAR(100)`, 5 temperature classifications). Only needed by the Cold Chain module; **not** required for FEFO/Batch. (RESOLVED — future implementation)
- **D4 TOTP / password policy** → documented TOTP (mandatory for admins) and password policy are security-hardening/future; lockout + bcrypt cost 12 already implemented. Not a Phase-1 correction per `PROGRESS.md` deferral. (RESOLVED — future implementation)
- **D5 Role taxonomy** → implemented 6-role taxonomy is the original initial-commit design; permission-driven, so roles are seeds-only (no migration). Docs' `nurse/procurement/auditor` model is alternative/stale → documentation correction. (RESOLVED — documentation change)

**Batch/FEFO readiness:** all five decisions verified as non-blocking — **Batch Management + FEFO can begin** (schema, permissions, and inventory hook points already exist).

### Product & Inventory — Outstanding Work (next session)

- [x] **Batch Management** — lifecycle COMPLETE (commit `feat: implement batch management`)
- [x] **FEFO selection** — domain/service COMPLETE (commit `feat: implement fefo batch selection`; POS wiring stays Phase 3)
- [x] **Expiry detection** — expiring/expired views + hub COMPLETE (`/expiry/expiring`, `/expiry/expired`; commit `feat: implement expiry detection`)
- [x] **POS sales + billing** — Phase 3 COMPLETE (commit `feat: implement POS sales and billing`)
- [ ] **Purchases, Prescriptions, Returns, Finance, Reporting** (Phases 4+)

### Testing — Further Backlog

- [ ] Unit tests for auth helpers, permission logic, Prisma utilities
- [ ] Integration tests for users/roles/org/branches API routes
- [ ] Component tests for UserTable, RoleList, etc.
- [ ] E2E tests for critical flows
- [ ] Database testing infrastructure (integration suite currently requires a real Postgres)

---

_Last updated: September 2026 | Phase 0-2 complete; **Phase 3 POS delivered** (transactional sale service with Serializable CAS consumption, pure server-side pricing, FEFO dispense wiring, credit/discount/prescription gates, held bills, printable receipt, POS billing UI + sales history/detail). 400 tests / 35 suites passing. Commit log for Phase 3: `feat: implement POS sales and billing`. Phase 4 (Purchase Management) is next._
