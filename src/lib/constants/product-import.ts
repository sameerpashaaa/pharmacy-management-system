// ─────────────────────────────────────────────────────────────
// Constants — Product CSV Import
// Shared by the import service, the API route, and the UI.
// Deliberately dependency-free so client components can import it.
// ─────────────────────────────────────────────────────────────

export const MAX_CSV_FILE_SIZE = 2 * 1024 * 1024 // 2 MB
export const MAX_CSV_ROWS = 1000

export const REQUIRED_CSV_COLUMNS = ['name', 'sku', 'mrp', 'categories'] as const

export const OPTIONAL_CSV_COLUMNS = [
  'genericName',
  'barcode',
  'description',
  'manufacturer',
  'composition',
  'drugSchedule',
  'storageCondition',
  'isPrescriptionRequired',
  'unitOfMeasure',
  'tabsPerStrip',
  'packSize',
  'hsnCode',
  'gstRate',
  'cgstRate',
  'sgstRate',
  'igstRate',
  'isGstExempt',
  'ptr',
  'costPrice',
  'minStockLevel',
  'maxStockLevel',
  'reorderLevel',
  'imageUrl',
  'isActive',
  'isReturnable',
  'additionalBarcodes',
] as const
