# Implementation Baseline

**Pharmacy Management System (PharmaCare)**
_Version: 1.0 | Date: September 2026 | Branch: `pharmacare-phase2`_

---

## 1. Purpose & Scope

This document captures the **authoritative baseline** of what is actually implemented in the codebase at this point in time, reconciled against the documentation suite in `documentation/`, the original project brief, the Prisma schema, and `PROGRESS.md`.

It exists so that future sessions and reviewers can distinguish:

- **Implemented and verified** behaviour (do not re-verify or contradict).
- **Documented-but-not-implemented** behaviour (future work; documents are aspirational, not false).
- **Active contradictions** between documents and code (marked `UNRESOLVED` where a decision is pending).

Scope: Modules 1–20 as covered by the docs and schema. **No source code was changed to produce this baseline.** The completed Product Master, Inventory, and Product CSV Import implementations are treated as a protected contract.

---

## 2. Source of Truth Hierarchy

When any two sources disagree, resolve in this order (highest wins):

1. **Original project assignment/PDF brief** (regulatory + functional intent).
2. **Working code + Prisma schema** (what the system actually does).
3. **`PROGRESS.md`** (what has been completed / what is planned).
4. **`documentation/IMPLMENTATION_BASELINE.md`** (this file).
5. **`documentation/*.md`** (design/spec docs are treated as _aspirational design intent_, checked against the schema and code before being treated as fact).

Rule: a documentation claim is only a _requirement_ if it is consistent with the schema or explicitly marked `FUTURE` in `PROGRESS.md`. A claim that contradicts the schema and code is a _conflict_ (never silently adopt it).

---

## 3. Confirmed Technology Stack

Verified from `package.json`, `prisma/schema.prisma`, and source:

| Layer     | Reality (this repo)                                                                                             | Docs claim                                                        | Verdict                                                         |
| --------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------- |
| Framework | Next.js 14.2.5 App Router (SSR pages + route handlers)                                                          | React SPA + standalone Express REST API                           | **CONFLICT** — docs describe an API service that does not exist |
| Backend   | Next.js route handlers (`src/app/api/**`), no Express                                                           | Node/Express REST                                                 | **CONFLICT**                                                    |
| ORM / DB  | Prisma 5.17 + PostgreSQL (`prisma db push`; no `prisma/migrations/` dir)                                        | Knex migrations (`knex migrate:latest/rollback`)                  | **CONFLICT**                                                    |
| Auth      | NextAuth 4.24 CredentialsProvider; bcryptjs; session `strategy:'jwt'`, maxAge 30 days; lockout 5 fails → 15 min | JWT access 15 min + refresh 7 days; TOTP MFA mandatory for admins | **CONFLICT**                                                    |
| Cache     | None (no Redis client dependency)                                                                               | Redis 7 / ElastiCache                                             | **CONFLICT**                                                    |
| Email/SMS | `nodemailer` only (no Twilio/SendGrid client)                                                                   | Twilio SMS + SendGrid email                                       | **CONFLICT**                                                    |
| Real-time | None                                                                                                            | Socket-based alerting (implied)                                   | **CONFLICT**                                                    |
| UI        | Shadcn/UI (Radix) + Tailwind, React Query, Zustand, Zod                                                         | Shadcn-agnostic "React"                                           | **CONSISTENT**                                                  |
| Tests     | Jest 29 + ts-jest + RTL; Playwright configured                                                                  | Jest/Supertest + Playwright (k6 not used)                         | **PARTIAL**                                                     |
| Deploy    | GitHub Actions CI; no infra-as-code present                                                                     | AWS ECS/ECR/CodeDeploy, Docker, Terraform                         | **CONFLICT**                                                    |

---

## 4. Confirmed Architecture & Module Map

### 4.1 Actual runtime architecture

```
Browser ──> Next.js 14 App Router (SSR + Route Handlers /api/**)
                │
                ├─ NextAuth 4 (credentials, DB sessions via JWT strategy)
                ├─ Prisma Client 5 ──> PostgreSQL
                ├─ Middleware (src/middleware.ts) — route protection
                └─ Permission checks via src/lib/auth/auth-helpers.ts (can / requirePermission)
```

- Deployment: Node.js server (Next.js standalone/`next start`); Docker/ECS/K8s not present in repo.
- No Redis, no message broker, no WebSocket server, no external integrations wired.

### 4.2 Database models (Prisma `@@map` names)

`users, accounts, sessions, verification_tokens, password_reset_tokens, roles, permissions, role_permissions, user_roles, organizations, branches, organization_settings, categories, products, product_categories, product_barcodes, hsn_codes, inventory, inventory_movements, stock_adjustments, batches, batch_status_log, batch_disposals, sales, sale_items, sale_item_batches, payments, held_bills, prescriptions, prescription_images, purchases, purchase_items, purchase_returns, purchase_return_items, sale_returns, sale_return_items, credit_notes, customers, customer_ledgers, suppliers, supplier_ledgers, ledgers, ledger_entries, tax_rates, gst_transactions, notifications, notification_preferences, files, audit_logs, system_settings`

`DrugSchedule` enum: `NONE, H, H1, X, G, J`. `MovementType`: `IN, OUT, ADJUSTMENT, RETURN_IN, RETURN_OUT, TRANSFER, WRITE_OFF`. `AdjustmentType`: `PHYSICAL_COUNT, DAMAGE, THEFT, EXPIRY, CORRECTION, OPENING_STOCK`. `AdjustmentStatus`: `PENDING, APPROVED, REJECTED`. `BatchStatus`: `ACTIVE, BLOCKED, EXPIRED, DISPOSED, EXHAUSTED`. `DisposalReason`: `EXPIRED, DAMAGED, RECALLED, CONTAMINATED, OTHER`.

### 4.3 Roles seeded (`prisma/seeds/roles.ts`)

`owner` (ALL permissions), `manager`, `pharmacist`, `cashier`, `purchase_manager`, `accountant`. Permissions are granular codes (`src/lib/constants/permissions.ts`, e.g. `products:import`, `inventory:adjust`, `inventory:approve_adjustment`).

### 4.4 Sequence-of-record for completed modules

**Product Master:** `validate → product-service.ts (CRUD/search/tree) → prisma.products` + `product_barcodes` + `product_categories`; create/delete audit-logged.

**Inventory:** `validate (src/lib/validations/inventory.ts) → inventory-service.ts → inventory / inventory_movements / stock_adjustments`; adjustment apply guarded by optimistic CAS (`updateMany ... updatedAt + status=PENDING`), auto-approve `|qty| ≤ 10`, else `PENDING` → approve/reject by a user holding `inventory:approve_adjustment`.

**Product CSV Import:** `POST /api/products/import` (permission `products:import`) → `product-import.ts` all-or-nothing transaction, 2 MB / 1000 rows, duplicate guards, audit log.

---

## 5. Completed Feature Baseline (verified)

| Module                                                                     | Status (PROGRESS.md) | Key evidence                                                                 |
| -------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------- |
| Foundation (Next.js, TS, Tailwind, Shadcn)                                 | ✅ COMPLETE          | `package.json`, configs                                                      |
| DB schema — all 20 modules of tables                                       | ✅ COMPLETE          | `prisma/schema.prisma` (69 model/enum defs)                                  |
| Seed data (60 permissions, 6 roles, org, branches, HSN, categories, users) | ✅ COMPLETE          | `prisma/seeds/*.ts`                                                          |
| Auth + users/roles + org/branches APIs + UI                                | ✅ COMPLETE          | `src/lib/auth/auth-config.ts`, `src/app/api/users                            | roles | organization | branches` |
| Product Master (CRUD, categories, HSN, barcodes)                           | ✅ COMPLETE          | `src/lib/products/*`, products APIs + pages                                  |
| Inventory (list, movements, adjustments, approve/reject)                   | ✅ COMPLETE          | `src/lib/inventory/*`, inventory APIs + pages                                |
| Product CSV Import                                                         | ✅ COMPLETE          | `src/lib/products/product-import.ts`, `src/app/api/products/import/route.ts` |
| Testing + CI                                                               | ✅ FOUNDATION        | 20 suites / 194 tests; `.github/workflows/ci.yml`; Husky + lint-staged       |

## 6. Future / Not Implemented Features (documented, consistent with `PROGRESS.md`)

Marked `NOT STARTED` in `PROGRESS.md` (Phases 3–9) and NOT present in working route handlers:

- **Batch Management + FEFO** (schema `batches/batch_status_log/batch_disposals` exists, logic not built) — `PROGRESS.md` "Remaining Phase 2 Tasks".
- **Expiry detection / alerts** (near-expiry, expired views).
- **POS / Sales / Billing** (schema exists: `sales/sale_items/payments/held_bills`).
- **Purchases + GRN / PO / 3-way match** (schema exists: `purchases/purchase_items/purchase_returns`).
- **Prescriptions, Returns & Recall, Customers/Suppliers ledgers, Finance/ledgers, GST transaction posting, Reports, Notifications, Files** — some schema/models exist; no workflows implemented.
- **All external integrations** (EHR/HL7 FHIR, supplier EDI, barcode/RFID, MQTT cold-chain, SMS/email gateways) — none wired.
- **Recommendation/analytics, regulatory e-reporting** — none.

---

## 7. Critical Business Rules (documented vs actual)

### 7.1 From `Stock_Management_Module.md`

| #   | Rule (doc quote / summary)                                                                                     | Actual implementation                                                                                                                                  | Class                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| 1   | Adjustment reason codes `BREAKAGE, SPILLAGE, THEFT, DATA_ERROR, EXPIRY_DISPOSAL, QUALITY_REJECT` (§2)          | Enum `AdjustmentType = PHYSICAL_COUNT, DAMAGE, THEFT, EXPIRY, CORRECTION, OPENING_STOCK`                                                               | **CONFLICT** (code is authoritative; docs must be updated)               |
| 2   | Approval: "≤ 10 units Pharmacist self-approval; 11–50 Pharmacy Manager; >50 Chief Pharmacist (+evidence)" (§4) | `AUTO_APPROVE_THRESHOLD = 10`; `>10 → PENDING`, approved/rejected by any holder of `inventory:approve_adjustment` (Manager role); no 11–50 / >50 split | **PARTIAL CONFLICT** (auto-approve ≤10 matches; escalation tiers differ) |
| 3   | Receiving via GRN (PO required, expiry <6 months rejected, cold-chain temp log)                                | Purchases/GRN not implemented                                                                                                                          | **FUTURE**                                                               |
| 4   | FEFO dispensing policy                                                                                         | Not implemented (schema has `batches`)                                                                                                                 | **FUTURE**                                                               |
| 5   | Schedule X dual authorization on adjustments/disposals                                                         | No Schedule X gating anywhere                                                                                                                          | **FUTURE**                                                               |
| 6   | Weighted-average cost valuation                                                                                | `costPrice` on product, `purchasePrice` on batch; no costing algorithm                                                                                 | **FUTURE**                                                               |
| 7   | Quarterly cycle count; >2% variance investigation                                                              | No cycle-count workflow                                                                                                                                | **FUTURE**                                                               |
| 8   | Near-expiry <30 days red highlight                                                                             | No expiry views                                                                                                                                        | **FUTURE**                                                               |

### 7.2 Consistent rules already honoured by implementation

- Stock ledger integrity: every change records a movement with before/after quantities (`quantityBefore/quantityAfter`), reference type/id, and actor. **CONSISTENT** with docs' "before/after values" audit requirement.
- Audit logging on create/update/approve/reject of adjustments and product create/delete. **CONSISTENT** (events logged) but see §10 for the hash-chaining gap.
- Concurrency safety: optimistic CAS prevents double-apply (`409` on conflict).

---

## 8. Requirement Reconciliation (19 areas, A–F)

Legend: **A** Consistent · **B** New detail only (additive) · **C** Conflicting · **D** Placeholder (no spec) · **E** Implemented differently · **F** Future requirement (not implemented)

| #   | Area                                                             | Class                       | Evidence / note                                                              |
| --- | ---------------------------------------------------------------- | --------------------------- | ---------------------------------------------------------------------------- |
| 1   | Product master fields & uniqueness (SKU/barcode)                 | **A**                       | `products` model + guards + tests                                            |
| 2   | Product CSV import                                               | **A**                       | Contract + 2MB/1000 rows + all-or-nothing + tests                            |
| 3   | Inventory list/status per product–branch                         | **A**                       | `inventory` model (total/reserved/available), status derived in memory       |
| 4   | Inventory movements ledger                                       | **A**                       | `inventory_movements` w/ before/after                                        |
| 5   | Stock adjustments                                                | **E(partial)/C**            | Workflow + auto-approve ≤10 ✓; reason codes and approval tiers differ (§7.1) |
| 6   | Batch management & FEFO                                          | **F**                       | Schema ready, logic not built                                                |
| 7   | Expiry detection & alerts                                        | **F**                       | `BatchStatus=EXPIRED` possible; no detection workflow                        |
| 8   | Reorder-level alerts / auto-reorder                              | **F**                       | `reorderLevel` field exists; no alert engine                                 |
| 9   | Schedule H/H1/X compliance (dual auth, batch control)            | **F**                       | `drugSchedule` enum exists; no enforcement                                   |
| 10  | GRN / PO / 3-way match (±2%)                                     | **F**                       | Purchases phase not started                                                  |
| 11  | Audit trail (events logged)                                      | **A partial / F(chaining)** | Events logged; append-only + hash chain + retention not enforced             |
| 12  | RBAC (permission-driven)                                         | **E**                       | Roles differ from `RBAC_Matrix.md`; enforcement is permission-based          |
| 13  | Authentication                                                   | **C**                       | NextAuth JWT sessions vs doc JWT 15m/7d + TOTP                               |
| 14  | Cold chain monitoring & breach quarantine                        | **F**                       | No `storage_condition` field on `products`; no sensors                       |
| 15  | Notifications (SMS/email)                                        | **F**                       | `notifications` schema; nodemailer only                                      |
| 16  | Barcode/RFID scanning & GS1 parsing                              | **F**                       | `product_barcodes` only; no GS1/RFID                                         |
| 17  | Returns & recall (7-day, disposal for Schedule X, CDSCO/FDA ack) | **F**                       | Schema present; no workflow                                                  |
| 18  | POS / sales / invoices / held bills                              | **F**                       | Schema present; Phase 3 not started                                          |
| 19  | Deployment & ops (AWS/ECS, Redis, monitoring stack)              | **F**                       | Only GitHub Actions CI present                                               |

---

## 9. Critical Conflicts — Inventory (Stock_Management_Module vs implementation)

| Aspect                    | Document                                                                 | Implementation                                                            | Recommendation                                                                                                      |
| ------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Reason codes              | `BREAKAGE, SPILLAGE, THEFT, DATA_ERROR, EXPIRY_DISPOSAL, QUALITY_REJECT` | `DAMAGE, THEFT, EXPIRY, CORRECTION, PHYSICAL_COUNT, OPENING_STOCK`        | Keep code enum; update doc (documentation task). `UNRESOLVED` until doc updated.                                    |
| Approval tiers            | ≤10 self / 11–50 Manager / >50 Chief + evidence                          | ≤10 auto-approve; >10 PENDING → any `inventory:approve_adjustment` holder | Schema has no approver-role column; decide if 3-tier escalation is required (future controlled task). `UNRESOLVED`. |
| Self-approval opportunity | "≤10 self"                                                               | Auto-approve (no explicit self-approve step)                              | Semantically equivalent; doc wording differs. Documented as acceptable.                                             |
| Schedule X gating         | Required on adjustments                                                  | Absent                                                                    | **FUTURE** — defer to a future controlled task.                                                                     |

## 10. Critical Conflicts — Architecture (design docs vs repo)

| Doc                      | Document claim                                                                                                                                                         | Reality                                                                                                                                                             | Class                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| HLD                      | React SPA + Express REST + Redis + JWT 15m/7d + Nginx + AWS                                                                                                            | Next.js 14 full-stack, Prisma, NextAuth (30-day JWT session), no Express/Redis/Nginx                                                                                | **C/E** — legacy architecture doc                                      |
| LLD                      | `AuthService/JWTHelper` (bcrypt cost 12, refresh), `StockService/StockRepository/AlertService`, tables `drugs/stock/batches/stock_transactions`                        | NextAuth + Prisma service modules; tables `products/inventory/batches/inventory_movements/stock_adjustments`; no AlertService                                       | **E** — names differ; pattern partially matches (service layer exists) |
| ER                       | `drugs(name, brand_name, form, strength, category, schedule OTC/H/H1/X/G, unit, reorder_level, storage_condition, is_active)`, `stock(drug_id, location_id, batch_id)` | `products` (no `storage_condition`, no `form/strength`; has GST, mrp, ptr); `inventory(product_id, branch_id)`; schedule enum has extra `NONE, J`                   | **E/C** — storage_condition missing (cold-chain will need it)          |
| API                      | Base `https://api.pms.example.com/v1`, Bearer JWT, `/auth/login /auth/refresh /auth/logout /drugs /stock/receive`                                                      | Next.js `/api/*` handlers, NextAuth cookie sessions, `/api/products`, `/api/inventory/...`                                                                          | **C** — different API surface                                          |
| DFD                      | Actors include Nurse, EHR/EMR; alert channels SMS/email                                                                                                                | No such actors/channels wired                                                                                                                                       | **F(clarify)** — conceptual                                            |
| UML                      | `Drug/Batch/StockTransaction`, `DispensingService`, `NarcoticsGate`                                                                                                    | No dispensing layer; `Product/Batch/StockAdjustment` naming                                                                                                         | **F** — conceptual, pre-POS                                            |
| Security Architecture    | TOTP MFA admin-mandatory; password policy (10 chars, complexity, no-reuse 5); JWT 15m/7d; bcrypt cost 12                                                               | No TOTP dep; no password-policy enforcement; NextAuth JWT 30d; bcrypt default cost (no explicit 12)                                                                 | **C/F** — auth enhancements future                                     |
| RBAC Matrix              | Roles `admin/pharmacist/nurse/procurement/auditor`; pharmacist can adjust stock; large adjustment admin-only                                                           | Roles `owner/manager/pharmacist/cashier/purchase_manager/accountant`; pharmacist has `inventory:read` only; `inventory:adjust/approve_adjustment` belong to manager | **E/C** — role set differs; permission model is authoritative          |
| Audit Trail Policy       | Append-only, hash-chained, NTP-signed, retention 5/7/10/3 yr                                                                                                           | `audit_logs` event table only                                                                                                                                       | **F** — hardening future                                               |
| Env/CICD/Deploy/Rollback | Knex migrations; Redis; ECS/ECR/CodeDeploy; AWS S3; Node 20; JWT env vars                                                                                              | Prisma (`db push`/`migrate deploy`); no Redis; GitHub Actions only; `NEXTAUTH_SECRET`                                                                               | **C** — ops docs outdated                                              |
| Integration              | HL7 FHIR, EDI, Twilio, SendGrid, MQTT, GS1/RFID, WebHID                                                                                                                | None implemented; `nodemailer` only                                                                                                                                 | **F**                                                                  |
| V&V Report               | Claims >85% coverage, pen-test done, k6 200 users, FEFO 10 scenarios, tamper-proof audit trail, all "Pass"                                                             | No k6, no pen-tests logged, no FEFO, no hash-chained audit trail; 194 Jest tests (no coverage threshold enforced)                                                   | **C** — unverified claims                                              |

## 11. Documentation Integrity & Placeholder Files

- `documentation/README.md` index: lists 49 content files but states **"Total Documents: 38 files"** and the original commit message also says "38 files". Actual tracked count: **50** (49 content + README). **Discrepancy — update the count when the suite is next maintained.**
- **Placeholder/empty shells** (title-only, ~70–110 bytes, verified): `Project_Requirements_SRS.md`, `Project_Requirements_BRD.md`, `Use_Case_Documents.md`, `User_Stories_Product_Backlog.md`, `Scope_Statement.md`, `Stakeholder_Analysis.md`, `HIPAA_Compliance_Documentation.md`, `FDA_21CFR_Part11_Compliance_Notes.md`, `Data_Privacy_Policy.md` (9 files).
- **Templates with no completed data**: `Bug_Defect_Reports.md`, `UAT_Sign_Off_Document.md`, `Penetration_Testing_Reports.md` (self-declares example findings, no engagements).
- **Cross-doc inconsistency**: `Validation_Verification_Report.md` claims all items pass, but UAT sign-off rows and pentest engagements are empty and `Test_Cases_Test_Scripts.md` statuses are all `—`.
- Docs dated "September 2026" (v1.0) for a project in active development; several describe a _future/22-week target_ state.

## 12. Assumptions & Open Decisions

- **Code is the source of truth for implemented behaviour.** Where docs conflict with working, tested code, the code wins and the doc update is queued.
- **Unresolved (`UNRESOLVED`)**: (1) adjustment reason-code vocabulary; (2) 3-tier approval escalation (11–50 / >50) vs single-tier `inventory:approve_adjustment`; (3) whether `storage_condition` must be added to `products` for cold-chain module (it is absent today); (4) whether TOTP MFA + password policy are required pre-production; (5) role taxonomy alignment (`owner/manager/...` vs `admin/pharmacist/nurse/procurement/auditor`).
- **No source changes were made by this reconciliation.** Future controlled tasks (not this one) must implement: Batch/FEFO, Expiry, Purchases/GRN, POS, Prescriptions/Returns, notifications, deployments.

## 13. Documentation Maintenance Rules

1. **`docs/IMPLEMENTATION_BASELINE.md` is the first file to read when starting a new feature or investigation.**
2. Any change to schema, permissions, roles, or completed-module behaviour MUST be mirrored here (status/class/evidence) in the same task.
3. Before editing any `documentation/*.md` design doc to "match the code", confirm the intent against the original brief and `PROGRESS.md`; mark edits as reconciled.
4. Do NOT `INSERT` claims into implementation docs without verifying against schema/code.
5. Update `documentation/README.md` totals and the placeholder list whenever files are added/removed.
6. If a doc claim contradicts code and you are unsure, record it in §9/§10 as `UNRESOLVED` and raise it — never silently pick a winner.

**One-command maintenance rule for future sessions:**

> Before implementing any feature, run: `git status` (branch = `pharmacare-phase2`), read `documentation/IMPLEMENTATION_BASELINE.md` §5–§10, and update §8–§10 (`Class` + evidence) in the same commit as the feature.

---

_Maintained by: PharmaCare Development | Baseline generated: September 13, 2026 | No source code changed for this document._
