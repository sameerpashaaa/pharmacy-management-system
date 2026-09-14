'use strict'

const { classDefs } = require('../lib/mermaid')

/**
 * Graphify — Sales / POS Flow.
 *
 * The complete sales flow as implemented (Phase 3): POS search, server-side
 * pricing, FEFO/oldest-first batch allocation, optimistic-CAS stock
 * deduction, invoice counter and payment. The createSale service is
 * transactional with Serializable isolation and retry.
 */

module.exports = function buildSalesFlow(ctx) {
  const lines = [
    'flowchart TB',
    classDefs({
      ui: 'fill:#f0fdf4,stroke:#16a34a,color:#14532d',
      api: 'fill:#eff6ff,stroke:#2563eb,color:#1e3a8a',
      svc: 'fill:#eef2ff,stroke:#6366f1,color:#312e81',
      db: 'fill:#fdf4ff,stroke:#a21caf,color:#701a75',
      vend: 'fill:#f8fafc,stroke:#94a3b8,color:#334155',
    }),
    '',
    'subgraph P1["1 · POS UI (src/app/(pos)/pos + pos-client)"]',
    '  U1["Barcode/name/SKU search"]:::ui',
    '  U2["Add line items to cart"]:::ui',
    '  U3["Hold bill (save JSON cart)"]:::ui',
    '  U4["Checkout → payment dialog (CASH/CARD/UPI/…)"]:::ui',
    'end',
    '',
    'subgraph P2["2 · Lookup APIs (read-only)"]',
    '  A1["GET /api/pos/config → getPosSettings (settings-service)"]:::api',
    '  A2["GET /api/pos/products → searchPosProducts (sales-service)"]:::api',
    '  A3["GET/POST/DELETE /api/pos/held-bills (sales-service)"]:::api',
    'end',
    '',
    'subgraph P3["3 · createSale (transactional, Serializable + retry)"]',
    '  S1["zod validate saleSchema (src/lib/validations/sale.ts)"]:::svc',
    '  S2["load POS settings — discount max, credit, round-off, FEFO"]:::svc',
    '  S3["server-side pricing — pricing.ts (pure):\\nline totals · GST split (cgst+sgst) · round-off"]:::svc',
    '  S4{"policy gates"}:::svc',
    '  S5{"discount > max allowed?"}:::svc',
    '  S6{"credit sale without sales:credit / setting / customer?"}:::svc',
    '  S7{"prescriptionId linked to another branch?"}:::svc',
    '  S8["allocate stock — FEFO (fefo-service) or oldest-first (allocateByCreationDate)"]:::svc',
    '  S9["CAS updateMany per batch (qty/sold/status match) → EXHAUSTED + BatchStatusLog"]:::svc',
    '  S10["inventory aggregate deduction — CAS by updatedAt → InventoryMovement OUT/SALE"]:::svc',
    '  S11["invoice number — buildInvoiceNumber + per-branch invoiceCounter CAS"]:::svc',
    '  S12["payment — derive status PAID/PARTIAL/CREDIT/OVERPAID (cashReceived)"]:::svc',
    '  S13["return created Sale (SaleItem + SaleItemBatch rows)"]:::svc',
    'end',
    '',
    'subgraph P4["4 · Persistence (Prisma, PostgreSQL)"]',
    '  D1["sales · sale_items · sale_item_batches (batch FK)"]:::db',
    '  D2["payments · held_bills (JSON cart)"]:::db',
    '  D3["batches (quantity/soldQuantity/status) — CAS"]:::db',
    '  D4["inventory + inventory_movements — CAS"]:::db',
    '  D5["branches.invoice_counter — CAS"]:::db',
    'end',
    '',
    'subgraph P5["5 · After purchase (POS UI)"]',
    '  X1["receipt dialog → window.print() (auto-print setting)"]:::ui',
    '  X2["sales history / detail — GET /api/sales, /api/sales/[id]"]:::ui',
    'end',
    '',
    'U1 --> A2',
    'U2 --> U1',
    'U3 --> A3',
    'U4 --> A1',
    'U4 --> P3',
    'P3 --> S1',
    'S1 --> S2',
    'S2 --> S3',
    'S3 --> S4',
    'S4 --> S5',
    'S5 -->|over| S6',
    'S6 -->|blocked| S7',
    'S7 --> S8',
    'S8 --> S9',
    'S9 --> S10',
    'S10 --> S11',
    'S11 --> S12',
    'S12 --> S13',
    'S9 --> D3',
    'S10 --> D4',
    'S11 --> D5',
    'S13 --> D1',
    'S13 --> D2',
    'S13 --> X1',
    'X1 --> X2',
  ]

  return {
    id: 'sales-flow',
    title: 'Sales / POS Flow',
    group: 'Business Flows',
    groupOrder: 5,
    accent: '#6366f1',
    description:
      'The complete sales flow as implemented (Phase 3): POS search, server-side pricing, FEFO/oldest-first batch allocation, optimistic-CAS stock deduction, invoice counter and payment. Money is computed only on the server.',
    sourceFiles: [
      'src/app/(pos)/pos/page.tsx',
      'src/components/pos/pos-client.tsx',
      'src/lib/sales/sales-service.ts',
      'src/lib/sales/pricing.ts',
      'src/lib/batches/fefo-service.ts',
      'src/lib/settings/settings-service.ts',
      'src/lib/validations/sale.ts',
      'src/app/api/pos/**',
      'src/app/api/sales/**',
    ],
    mermaid: lines.join('\n'),
  }
}