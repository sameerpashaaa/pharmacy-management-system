'use strict'

const { classDefs } = require('../lib/mermaid')

/**
 * Graphify — Testing Architecture.
 *
 * The real test setup: Jest (jsdom) for unit/component/route tests with
 * ts-jest, one Playwright E2E smoke spec, a database-backed integration test
 * that needs a real Postgres, a GitHub Actions CI pipeline and a Husky
 * pre-commit hook running lint-staged. Test counts come from the scanned
 * `*.test.ts(x)` files.
 */

module.exports = function buildTestingArchitecture(ctx) {
  const testFiles = ctx.src.files.filter((f) => f.kind === 'test' || f.kind === 'e2e')
  const unitFiles = testFiles.filter((f) => f.kind === 'test')

  const mermaid = [
    'flowchart TB',
    classDefs({
      jest: 'fill:#fef9c3,stroke:#ca8a04,color:#713f12',
      pw: 'fill:#dbeafe,stroke:#2563eb,color:#1e3a8a',
      int: 'fill:#dcfce7,stroke:#16a34a,color:#14532d',
      ci: 'fill:#f1f5f9,stroke:#64748b,color:#334155',
    }),
    '',
    'subgraph T1["Jest — unit & integration (jsdom, ts-jest, next/jest)"]',
    '  J1["jest.config.js — roots src/ · @ alias mapping · setupFilesAfterEach jest.setup.ts"]:::jest',
    '  J2["testMatch **/*.test.ts(x) — ' + unitFiles.length + ' test files scanned"]:::jest',
    '  J3["Validations — product, sale, user, batch, expiry (Zod)"]:::jest',
    '  J4["Services — product-service, product-import, inventory-service, batch-service, fefo (38), expiry-service, pricing (30), sales-service (40)"]:::jest',
    '  J5["API routes — categories, products, inventory, batches, expiry, pos (auth + validation + audit)"]:::jest',
    '  J6["Components — product-table, product-import-dialog, adjustments-table, empty-state"]:::jest',
    'end',
    '',
    'subgraph T2["Integration tests (real PostgreSQL)"]',
    '  I1["sales-service.integration.test.ts — FEFO/CAS oversell · invoice counter · rollback · concurrency"]:::int',
    '  I2["Requires a reachable Postgres DATABASE_URL (like CI service container)"]:::int',
    'end',
    '',
    'subgraph T3["Playwright — E2E"]',
    '  P1["playwright.config.ts — testDir e2e/ · chromium · baseURL localhost:3000"]:::pw',
    '  P2["webServer: npm run start (reuse existing server locally)"]:::pw',
    '  P3["e2e/smoke.spec.ts — login page renders · unauthenticated dashboard redirects"]:::pw',
    'end',
    '',
    'subgraph T4["CI pipeline (.github/workflows/ci.yml — branch pharmacare-phase2)"]',
    '  C1["npm ci --legacy-peer-deps"]:::ci',
    '  C2["prisma generate + migrate deploy (Postgres 16 service)"]:::ci',
    '  C3["type-check → lint → jest (--passWithNoTests) → next build"]:::ci',
    'end',
    '',
    'subgraph T5["Pre-commit Hooks"]',
    '  H1["husky pre-commit → npx lint-staged"]:::ci',
    '  H2["ESLint --fix + prettier --write on staged ts/tsx/json/css/md"]:::ci',
    'end',
    '',
    'J1 --> J2',
    'J2 --> J3',
    'J2 --> J4',
    'J2 --> J5',
    'J2 --> J6',
    'J4 --> I1',
    'I2 --> I1',
    'P1 --> P3',
    'C1 --> C2',
    'C2 --> C3',
    'H1 --> H2',
  ].join('\n')

  return {
    id: 'testing-architecture',
    title: 'Testing Architecture',
    group: 'Quality',
    groupOrder: 8,
    accent: '#7c3aed',
    description:
      'Three test layers (Jest unit/component, Prisma-backed integration, Playwright E2E) plus the CI pipeline and pre-commit hooking. Counts reflect the test files actually present in the repo.',
    sourceFiles: [
      'jest.config.js',
      'jest.setup.ts',
      'src/**/*.test.ts(x)',
      'src/lib/sales/sales-service.integration.test.ts',
      'playwright.config.ts',
      'e2e/smoke.spec.ts',
      '.github/workflows/ci.yml',
      '.husky/pre-commit',
    ],
    mermaid,
  }
}
