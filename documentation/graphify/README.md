# Graphify — PharmaCare Architecture Documentation

> Locally generated architecture & database diagrams for the PharmaCare
> pharmacy-management-system, built **from the actual source code**
> (`prisma/schema.prisma` + `src/**`). Nothing is hand-drawn, and nothing
> is pushed to GitHub.

---

## 1 · What Graphify does here

Graphify is a **project-local visualization tool** (all code lives in
`scripts/graphify/`). It:

- **Parses the real Prisma schema** (`prisma/schema.prisma`) to produce
  entity-relationship diagrams with models, primary keys, foreign keys,
  cardinality and enums.
- **Scans the real `src/` tree** (App Router pages, API routes, components,
  domain services) to produce the system architecture, module map and
  business-flow diagrams.
- **Marks reality honestly**: implemented flows (products, inventory,
  batches, expiry, POS/sales, auth) vs. designed-but-not-yet-built modules
  (purchases, returns, finance, GST, reports — their pages are
  "Coming in Phase N" placeholders).

It renders diagrams as **Mermaid** and emits both Markdown files and a
single-file HTML viewer so any developer can open the docs in a browser
without installing anything extra.

---

## 2 · Where the graphs live

```
documentation/
└── graphify/
    ├── README.md          ← this file
    ├── viewer.html        ← single-file interactive viewer (open in a browser)
    ├── assets/
    │   └── mermaid.min.js ← offline renderer bundle (copied from node_modules)
    └── graphs/
        ├── system-architecture.md
        ├── module-map.md
        ├── database-overview.md
        ├── database-erd-identity-access.md
        ├── database-erd-catalog-inventory.md
        ├── database-erd-commerce-finance.md
        ├── auth-flow.md
        ├── sales-flow.md
        ├── purchase-flow.md
        ├── reporting-flow.md
        └── testing-architecture.md
```

---

## 3 · How to regenerate

Requirements: **Node.js ≥ 18** (the project already needs it) and the
dependencies installed (`npm install`).

```bash
npm run graphify          # regenerate everything (markdown + viewer)
npm run graphify:build    # same as `graphify`
npm run graphify:watch    # regenerate automatically while you edit src/ or schema
```

---

## 4 · How to view it locally

Fastest: open the generated viewer in a browser.

```bash
npm run graphify:view     # regenerates, then opens viewer.html in your default browser
```

Or manually open `documentation/graphify/viewer.html` (double-click /
`start documentation\graphify\viewer.html`).

The **Markdown** files under `documentation/graphify/graphs/` also render
anywhere Mermaid is supported: VS Code (Mermaid extension), Obsidian, Typora,
GitLab/GitHub markdown, etc.

---

## 5 · What each graph represents

### System

| #   | Graph                                                                                                                                                                                                                                                        | Markdown                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1   | **System Architecture** — How the PharmaCare layers fit together: Next.js App Router UI, NextAuth JWT sessions, domain services, API routes, the Prisma client and PostgreSQL. Drawn from the actual files in src/ and prisma/.                              | [`graphs/system-architecture.md`](graphs/system-architecture.md) |
| 2   | **Module / Feature Map** — Business modules shown in the PharmaCare navigation with their real implementation status. Status is derived from the codebase: pages (are they placeholders?), API route handlers, domain services and Prisma models per module. | [`graphs/module-map.md`](graphs/module-map.md)                   |

### Database

| #   | Graph                                                                                                                                                                                                                            | Markdown                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 3   | **Database Overview — all 50 models by module** — Every Prisma model grouped by its business module. This is a structural overview; the three following ERDs show fields and FK relations per domain.                            | [`graphs/database-overview.md`](graphs/database-overview.md)                           |
| 4   | **Database ERD — Identity & Access, Organization, Audit & Config** — Schema-derived entity/relationship diagram for the identity & access, organization, audit & config domain, including attributes, PKs, UKs and FK relations. | [`graphs/database-erd-identity-access.md`](graphs/database-erd-identity-access.md)     |
| 5   | **Database ERD — Catalog, Inventory & Batch Management** — Schema-derived entity/relationship diagram for the catalog, inventory & batch management domain, including attributes, PKs, UKs and FK relations.                     | [`graphs/database-erd-catalog-inventory.md`](graphs/database-erd-catalog-inventory.md) |
| 6   | **Database ERD — Sales, Purchasing, Customers, Finance & Tax** — Schema-derived entity/relationship diagram for the sales, purchasing, customers, finance & tax domain, including attributes, PKs, UKs and FK relations.         | [`graphs/database-erd-commerce-finance.md`](graphs/database-erd-commerce-finance.md)   |

### Security

| #   | Graph                                                                                                                                                                                                                                                                                                                | Markdown                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 7   | **Authentication & Authorization Flow** — How users log in, how sessions are created, how middleware gates routes, and how RBAC (role + permission) authorization works at both the page and API route levels. All policies, lockout thresholds and seeded role/permission names are from the actual implementation. | [`graphs/auth-flow.md`](graphs/auth-flow.md) |

### Business Flows

| #   | Graph                                                                                                                                                                                                                                                                                    | Markdown                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 8   | **Sales / POS Flow** — The complete sales flow as implemented (Phase 3): POS search, server-side pricing, FEFO/oldest-first batch allocation, optimistic-CAS stock deduction, invoice counter and payment. Money is computed only on the server.                                         | [`graphs/sales-flow.md`](graphs/sales-flow.md)         |
| 9   | **Purchase Flow** — The purchase lifecycle as modelled in the Prisma schema (Purchases, Suppliers, Batches, Inventory, Finance). Phase 4 is not started: these are DESIGNED entities and flows, not yet implemented application code.                                                    | [`graphs/purchase-flow.md`](graphs/purchase-flow.md)   |
| 10  | **Reporting / Data Flow** — Where analytics data comes from and how it reaches users today. Only the dashboard live-aggregates are implemented; the dedicated reports module and export pipelines are future phases (the installed PDF/Excel libraries are not yet used in source code). | [`graphs/reporting-flow.md`](graphs/reporting-flow.md) |

### Quality

| #   | Graph                                                                                                                                                                                                                  | Markdown                                                           |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 11  | **Testing Architecture** — Three test layers (Jest unit/component, Prisma-backed integration, Playwright E2E) plus the CI pipeline and pre-commit hooking. Counts reflect the test files actually present in the repo. | [`graphs/testing-architecture.md`](graphs/testing-architecture.md) |

---

## 6 · Where the data comes from

| Graph                    | Input source(s)                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| System Architecture      | `src/app/**`, `src/components/**`, `src/lib/**`, `src/middleware.ts`, `next.config.js`, `package.json`                                         |
| Module / Feature Map     | `src/components/layout/sidebar.tsx`, `src/app/**`, `src/app/api/**`, `src/lib/**`, `prisma/schema.prisma`                                      |
| Database overview + ERDs | `prisma/schema.prisma` (models, attributes, `@relation`, enums)                                                                                |
| Authentication flow      | `src/lib/auth/auth-config.ts`, `src/lib/auth/auth-helpers.ts`, `src/middleware.ts`, `src/app/(auth)/login/**`, seed role/permission files      |
| Sales / POS flow         | `src/lib/sales/sales-service.ts`, `src/lib/sales/pricing.ts`, `src/lib/batches/fefo-service.ts`, `src/app/api/pos/**`, `src/components/pos/**` |
| Purchase flow            | `prisma/schema.prisma` (schema-only — Phase 4 not started)                                                                                     |
| Reporting flow           | `src/app/(dashboard)/page.tsx`, `src/app/(dashboard)/reports/**`, `src/lib/constants/permissions.ts`                                           |
| Testing architecture     | `jest.config.js`, `playwright.config.ts`, `e2e/**`, `src/**/*.test.ts(x)`, `.github/workflows/ci.yml`                                          |

The generator itself is deterministic: it parses files (no guessing), so the
diagrams stay accurate as long as the code changes.

---

## 7 · Updating the diagrams when the architecture changes

1. **Just regenerate** — most changes (new pages, routes, models, relations)
   are picked up automatically by the parsers. Run `npm run graphify:watch`
   while working, or `npm run graphify` when you finish.
2. **Frequency** — regenerate before committing non-trivial architecture
   changes so the docs never drift far from the code.
3. **If a graph misses something** — the generators are small, plain-JS
   modules under `scripts/graphify/graphs/*.js`; the ERD logic is derived
   from `scripts/graphify/lib/prisma-schema-parser.js` and the module map
   from `scripts/graphify/lib/modules.js`. Everything is documented in-code.
4. The generated `graphs/*.md`, `viewer.html` and `README.md` are
   outputs — prefer editing the **generator**, not the outputs.

---

## 8 · Notes & limitations

- This is strictly a **documentation / visualization** capability. It adds no
  runtime code to the application, changes no UI, no API, no schema.
- The upstream `Graphify-Labs` CLI (`graphifyy`, a Python + `uv` tool for
  AI assistants) is intentionally **not** used: it requires Python 3.12 +
  `uv`, which is not present on this machine, and its non-code passes expect
  an AI model API. A deterministic, dependency-light local generator covers
  this project's needs and runs anywhere the repo already runs.
- The Mermaid viewer asset is git-ignored; it is re-created on every
  `npm run graphify`.
