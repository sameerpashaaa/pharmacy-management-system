'use strict'

/**
 * Graphify — module registry.
 *
 * Maps the real Prisma models and source files to business modules and
 * derives an honest status for each module from evidence in the codebase:
 *
 *   live    – real pages + API routes + services      (implemented end to end)
 *   partial – some services / API or placeholder pages (partly implemented)
 *   service – reusable domain service, no UI yet        (e.g. FEFO selection)
 *   design  – schema models only, no application code   (future phase)
 *
 * Nothing is assumed: every status is derived from what `scan()` and the
 * schema parser actually find, with a small override table for modules that
 * are textually ambiguous (e.g. FEFO is implemented logic, not a "module").
 */

const { MODULE_LABELS } = require('./source-scanner')

// Real schema model → business module (used by DB overview + ERDs).
const MODEL_TO_MODULE = {
  User: 'auth',
  Account: 'auth',
  Session: 'auth',
  VerificationToken: 'auth',
  PasswordResetToken: 'auth',
  Role: 'roles',
  Permission: 'roles',
  RolePermission: 'roles',
  UserRole: 'roles',
  Organization: 'organization',
  Branch: 'organization',
  OrganizationSetting: 'organization',
  Category: 'products',
  Product: 'products',
  ProductCategory: 'products',
  ProductBarcode: 'products',
  HsnCode: 'gst',
  Inventory: 'inventory',
  InventoryMovement: 'inventory',
  StockAdjustment: 'inventory',
  Batch: 'batches',
  BatchStatusLog: 'batches',
  BatchDisposal: 'batches',
  Sale: 'sales',
  SaleItem: 'sales',
  SaleItemBatch: 'sales',
  Payment: 'sales',
  HeldBill: 'pos',
  Prescription: 'prescriptions',
  PrescriptionImage: 'prescriptions',
  Purchase: 'purchases',
  PurchaseItem: 'purchases',
  PurchaseReturn: 'purchases',
  PurchaseReturnItem: 'purchases',
  Customer: 'customers',
  CustomerLedger: 'customers',
  Supplier: 'suppliers',
  SupplierLedger: 'suppliers',
  SaleReturn: 'returns',
  SaleReturnItem: 'returns',
  CreditNote: 'returns',
  Ledger: 'finance',
  LedgerEntry: 'finance',
  TaxRate: 'gst',
  GstTransaction: 'gst',
  Notification: 'notifications',
  NotificationPreference: 'notifications',
  File: 'files',
  AuditLog: 'audit',
  SystemSetting: 'settings',
}

// Curated overrides where a purely computed status would be misleading.
const STATUS_OVERRIDES = {
  dashboard: 'live', // dashboard page + Prisma aggregates (no separate API)
  fefo: 'service', // FEFO selection: reusable domain service, consumed by Phase 3 POS
  middleware: 'live',
  categories: 'live', // categories API (products tree), category UI
  'hsn-codes': 'live', // HSN codes API used by product form
  audit: 'partial', // AuditLog row writes exist (auth events, API routes); page is placeholder
  settings: 'partial', // settings-service (getPosSettings) live; settings pages placeholder
  users: 'partial', // users API + components exist; users pages are placeholders
  roles: 'partial', // roles/permissions API + components exist; roles page is placeholder
  organization: 'partial', // organization + branches API/service; pages placeholder
  branches: 'partial',
  permissions: 'partial',
}

const COMPUTED = {}

function modKey(label) {
  return Object.keys(MODULE_LABELS).filter((k) => MODULE_LABELS[k] === label)[0]
}

function computeModuleStats(ctx) {
  const per = {}
  const srcByModule = {}

  for (const file of ctx.src.files) {
    const mod = file.module
    if (!mod) continue
    srcByModule[mod] = srcByModule[mod] || {
      lib: 0,
      api: 0,
      pages: 0,
      placeholderPages: 0,
      featureComp: 0,
      ui: 0,
      other: 0,
    }
    const s = srcByModule[mod]
    if (file.kind === 'apiRoute') s.api++
    else if (file.kind === 'appPage') {
      s.pages++
      if (file.placeholder) s.placeholderPages++
    } else if (
      file.kind === 'libService' ||
      file.kind === 'libValidation' ||
      file.kind === 'libConstants'
    )
      s.lib++
    else if (file.kind === 'featureComponent') s.featureComp++
    else s.other++
  }

  const modelsByModule = {}
  for (const model of ctx.schema.models) {
    const mod = MODEL_TO_MODULE[model.name] || 'other'
    modelsByModule[mod] = modelsByModule[mod] || []
    modelsByModule[mod].push(model)
  }

  for (const key of Object.keys(MODULE_LABELS)) {
    const s = srcByModule[key] || {
      lib: 0,
      api: 0,
      pages: 0,
      placeholderPages: 0,
      featureComp: 0,
      ui: 0,
      other: 0,
    }
    per[key] = {
      key,
      label: MODULE_LABELS[key],
      ...s,
      models: (modelsByModule[key] || []).length,
    }
  }

  for (const key of Object.keys(per)) {
    const m = per[key]
    m.status = deriveStatus(m, key)
  }

  return per
}

function deriveStatus(m, key) {
  if (STATUS_OVERRIDES[key]) return STATUS_OVERRIDES[key]
  const hasRealPages = m.pages > 0 && m.placeholderPages === 0
  const hasApi = m.api > 0
  const hasLib = m.lib > 0
  const hasModels = m.models > 0
  if (hasApi && hasRealPages) return 'live'
  if (hasApi || hasLib) return 'partial'
  if (hasModels) return 'design'
  return 'misc'
}

const STATUS_META = {
  live: {
    label: 'LIVE (implemented)',
    css: 'fill:#f0fdf4,stroke:#16a34a,color:#14532d',
    tag: 'IMPLEMENTED',
  },
  partial: { label: 'PARTIAL', css: 'fill:#fffbeb,stroke:#d97706,color:#78350f', tag: 'PARTIAL' },
  service: {
    label: 'SERVICE (no UI)',
    css: 'fill:#eff6ff,stroke:#2563eb,color:#1e3a8a',
    tag: 'SERVICE',
  },
  design: {
    label: 'DESIGNED (schema only)',
    css: 'fill:#fef2f2,stroke:#dc2626,color:#7f1d1d',
    tag: 'DESIGNED',
  },
  misc: { label: 'MISCELLANEOUS', css: 'fill:#f1f5f9,stroke:#64748b,color:#334155', tag: 'MISC' },
}

module.exports = {
  MODEL_TO_MODULE,
  STATUS_OVERRIDES,
  STATUS_META,
  computeModuleStats,
  modKey,
}
