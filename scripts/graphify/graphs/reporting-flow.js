'use strict'

const { classDefs } = require('../lib/mermaid')

/**
 * Graphify — Reporting / Data Flow.
 *
 * Where analytics data comes from and how it reaches users today. Only the
 * dashboard live-aggregates are implemented; the dedicated reports module
 * and export pipelines are future phases (the installed PDF/Excel libraries
 * are not yet used in source code).
 */

module.exports = function buildReportingFlow(ctx) {
  const lines = [
    'flowchart TB',
    classDefs({
      live: 'fill:#f0fdf4,stroke:#16a34a,color:#14532d',
      db: 'fill:#fdf4ff,stroke:#a21caf,color:#701a75',
      fut: 'fill:#fef2f2,stroke:#dc2626,color:#7f1d1d',
      dep: 'fill:#f8fafc,stroke:#94a3b8,color:#334155',
    }),
    '',
    'subgraph SRC["Data sources (PostgreSQL via Prisma)"]',
    '  D1["sales · sale_items · payments"]:::db',
    '  D2["products · inventory · inventory_movements"]:::db',
    '  D3["batches (expiry)"]:::db',
    '  D4["purchases · purchase_items"]:::db',
    '  D5["prescriptions · customers · suppliers"]:::db',
    'end',
    '',
    'subgraph LIVE["Dashboard (IMPLEMENTED — dashboard/page.tsx)"]',
    '  L1["today’s sales total — sale.aggregate { _sum.totalAmount, _count }"]:::live',
    '  L2["active product count — product.count"]:::live',
    '  L3["low-stock items — inventory availableQuantity ≤ minStockLevel"]:::live',
    '  L4["expiring batches — batch expiry within 90 days"]:::live',
    '  L5["pending prescriptions — prescription.count status=PENDING"]:::live',
    '  L6["recent sales — sale.findMany (branch-scoped)"]:::live',
    '  L7["server-rendered stat cards (Branch-scoped via session.user.branchId)"]:::live',
    'end',
    '',
    'subgraph DESIGNED["Reports module (Phase 7 — pages are placeholders)"]',
    '  R1["/reports · /reports/sales · /reports/inventory — Coming in Phase 7 placeholder"]:::fut',
    '  R2["permissions seeded: reports:sales · reports:purchases · reports:inventory · reports:financial · reports:export"]:::fut',
    '  R3["no /api/reports routes exist yet"]:::fut',
    'end',
    '',
    'subgraph EXP["Export tooling (installed but unused in code)"]',
    '  E1["jspdf + jspdf-autotable — PDF — NOT referenced in src"]:::dep',
    '  E2["xlsx — Excel — NOT referenced in src"]:::dep',
    '  E3["papaparse — CSV — used (product import)"]:::dep',
    'end',
    '',
    'D1 --> L1',
    'D2 --> L2',
    'D2 --> L3',
    'D3 --> L4',
    'D5 --> L5',
    'D1 --> L6',
    'L1 --> L7',
    'L2 --> L7',
    'L3 --> L7',
    'L4 --> L7',
    'L5 --> L7',
    'L6 --> L7',
    'D1 --> R1',
    'D2 --> R1',
    'D3 --> R1',
    'D4 --> R1',
    'D5 --> R1',
    'R2 --> R1',
    'E1 -. "future" .-> R1',
    'E2 -. "future" .-> R1',
    'E3 --> L3',
  ]

  return {
    id: 'reporting-flow',
    title: 'Reporting / Data Flow',
    group: 'Business Flows',
    groupOrder: 7,
    accent: '#64748b',
    description:
      'Where analytics data comes from and how it reaches users today. Only the dashboard live-aggregates are implemented; the dedicated reports module and export pipelines are future phases (the installed PDF/Excel libraries are not yet used in source code).',
    sourceFiles: [
      'src/app/(dashboard)/page.tsx (dashboard aggregations)',
      'src/app/(dashboard)/reports/** (placeholder pages)',
      'src/lib/constants/permissions.ts (reports:*)',
      'package.json (jspdf, xlsx, papaparse deps)',
    ],
    mermaid: lines.join('\n'),
  }
}