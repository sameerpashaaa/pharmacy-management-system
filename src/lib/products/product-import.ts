// ─────────────────────────────────────────────────────────────
// Product CSV Import Service
//
// All-or-nothing import: the whole file is validated up front and
// any row-level error aborts the import (nothing is written). If
// every row is valid, all products + relationships are created in a
// single Prisma transaction. A full row-level error report is always
// returned so the operator can fix rows and re-upload.
// ─────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import Papa from 'papaparse'

import {
  MAX_CSV_FILE_SIZE,
  MAX_CSV_ROWS,
  OPTIONAL_CSV_COLUMNS,
  REQUIRED_CSV_COLUMNS,
} from '@/lib/constants/product-import'
import prisma from '@/lib/db/prisma'
import { getCategoryOptions, getHsnCodes } from '@/lib/products/product-service'
import { productImportRowSchema, type ProductImportRow } from '@/lib/validations/product'

// ─── Types ───────────────────────────────────────────────────

export interface ProductImportFile {
  name: string
  size: number
  type: string
  content: Buffer
}

export interface ProductImportRowError {
  row: number
  field: string
  message: string
}

export interface ProductImportSummary {
  fileName: string
  totalRows: number
  imported: number
  failed: number
  errors: ProductImportRowError[]
}

interface PreparedProduct {
  rowNumber: number
  productData: Prisma.ProductUncheckedCreateWithoutCreatedByInput
  categoryIds: string[]
  additionalBarcodes: string[]
}

interface CategoryRef {
  id: string
  name: string
  slug: string
}

// ─── Header contract ─────────────────────────────────────────

// Canonical (camelCase) column names sent to the row schema.
const CANONICAL_COLUMNS = [...REQUIRED_CSV_COLUMNS, ...OPTIONAL_CSV_COLUMNS]

// Headers are lowercased at parse time, so compare case-insensitively.
const REQUIRED_HEADERS = REQUIRED_CSV_COLUMNS.map((c) => c.toLowerCase())

const KNOWN_HEADERS = new Set<string>([
  ...CANONICAL_COLUMNS.map((c) => c.toLowerCase()),
  'storage_condition',
])

const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/csv',
  'application/vnd.ms-excel',
  'application/octet-stream',
  '',
])

// ─── Helpers ─────────────────────────────────────────────────

function validateFile(file: ProductImportFile): string | null {
  if (!file.name || !file.name.toLowerCase().endsWith('.csv')) {
    return 'File must be a .csv file'
  }
  if (!ALLOWED_MIME_TYPES.has((file.type ?? '').toLowerCase())) {
    return 'Unsupported file type'
  }
  if (!file.size || file.size === 0) {
    return 'CSV file is empty'
  }
  if (file.size > MAX_CSV_FILE_SIZE) {
    return `CSV file exceeds the maximum size of ${Math.round(MAX_CSV_FILE_SIZE / 1024 / 1024)} MB`
  }
  return null
}

interface ParseResult {
  rows: Record<string, string>[]
  error?: ProductImportRowError
}

function parseCsv(file: ProductImportFile): ParseResult {
  const text = new TextDecoder('utf-8').decode(file.content).replace(/^\uFEFF/, '')
  if (!text.trim()) {
    return { rows: [], error: { row: 0, field: 'file', message: 'CSV file is empty' } }
  }

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
    transform: (v) => (typeof v === 'string' ? v.trim() : ''),
  })

  if (parsed.errors.length > 0) {
    return {
      rows: [],
      error: {
        row: 0,
        field: 'file',
        message: `Malformed CSV: ${parsed.errors.map((e) => e.message).join('; ')}`,
      },
    }
  }

  const headers = parsed.meta.fields ?? []
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h))
  const unknown = headers.filter((h) => !KNOWN_HEADERS.has(h))

  if (missing.length > 0 || unknown.length > 0) {
    const issues: string[] = []
    if (missing.length > 0) issues.push(`Missing required column(s): ${missing.join(', ')}`)
    if (unknown.length > 0) issues.push(`Unknown column(s): ${unknown.join(', ')}`)
    return { rows: [], error: { row: 0, field: 'header', message: issues.join('. ') } }
  }

  // Re-key rows to the canonical camelCase column names so the row schema
  // receives predictable keys regardless of the header casing used in the file.
  const canonicalRow = (raw: Record<string, string>): Record<string, string> => {
    const out: Record<string, string> = {}
    for (const col of CANONICAL_COLUMNS) {
      const lower = col.toLowerCase()
      let value = raw[lower]
      // Alias snake_case header for storageCondition
      if (value === undefined && col === 'storageCondition') {
        value = raw['storage_condition']
      }
      if (value !== undefined) out[col] = value
    }
    return out
  }

  return { rows: parsed.data.map(canonicalRow) }
}

function splitList(cell: string | undefined): string[] {
  if (!cell) return []
  return cell
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean)
}

function buildProductData(
  row: ProductImportRow
): Prisma.ProductUncheckedCreateWithoutCreatedByInput {
  return {
    name: row.name,
    genericName: row.genericName || null,
    sku: row.sku,
    barcode: row.barcode || null,
    description: row.description || null,
    manufacturer: row.manufacturer || null,
    composition: row.composition || null,
    drugSchedule: row.drugSchedule,
    storageCondition: row.storageCondition ?? null,
    isPrescriptionRequired: row.isPrescriptionRequired,
    unitOfMeasure: row.unitOfMeasure,
    tabsPerStrip: row.tabsPerStrip ?? null,
    packSize: row.packSize || null,
    hsnCode: row.hsnCode || null,
    gstRate: row.gstRate,
    cgstRate: row.cgstRate,
    sgstRate: row.sgstRate,
    igstRate: row.igstRate,
    isGstExempt: row.isGstExempt,
    mrp: row.mrp,
    ptr: row.ptr ?? null,
    costPrice: row.costPrice ?? null,
    minStockLevel: row.minStockLevel,
    maxStockLevel: row.maxStockLevel ?? null,
    reorderLevel: row.reorderLevel,
    imageUrl: row.imageUrl || null,
    isActive: row.isActive,
    isReturnable: row.isReturnable,
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002'
}

// ─── Import ──────────────────────────────────────────────────

export async function importProductsFromCsv(
  file: ProductImportFile,
  userId: string
): Promise<ProductImportSummary> {
  // 1. File-level validation
  const fileError = validateFile(file)
  if (fileError) {
    return {
      fileName: file.name,
      totalRows: 0,
      imported: 0,
      failed: 1,
      errors: [{ row: 0, field: 'file', message: fileError }],
    }
  }

  // 2. Parse + header validation
  const { rows, error: parseError } = parseCsv(file)
  if (parseError) {
    return { fileName: file.name, totalRows: 0, imported: 0, failed: 1, errors: [parseError] }
  }
  if (rows.length === 0) {
    return {
      fileName: file.name,
      totalRows: 0,
      imported: 0,
      failed: 1,
      errors: [{ row: 0, field: 'file', message: 'CSV contains no data rows' }],
    }
  }
  if (rows.length > MAX_CSV_ROWS) {
    return {
      fileName: file.name,
      totalRows: rows.length,
      imported: 0,
      failed: 1,
      errors: [
        { row: 0, field: 'file', message: `CSV exceeds the maximum of ${MAX_CSV_ROWS} rows` },
      ],
    }
  }

  // 3. Reference data (one fetch each)
  const [categoryOptions, hsnCodes] = await Promise.all([getCategoryOptions(), getHsnCodes()])
  const categoryBySlug = new Map<string, CategoryRef>()
  const categoryByName = new Map<string, CategoryRef>()
  for (const c of categoryOptions) {
    const ref: CategoryRef = { id: c.id, name: c.name, slug: c.slug }
    categoryBySlug.set(c.slug, ref)
    categoryByName.set(c.name.trim().toLowerCase(), ref)
  }
  const activeHsnCodes = new Set(hsnCodes.map((h) => h.code))

  // 4. Row validation + relationship resolution
  const errors: ProductImportRowError[] = []
  let failedRows = 0
  const prepared: PreparedProduct[] = []
  const seenSkus = new Map<string, number>()
  const seenBarcodes = new Map<string, number>()

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2 // 1-based; header row is row 1
    const rowErrors: ProductImportRowError[] = []
    const push = (field: string, message: string) => {
      rowErrors.push({ row: rowNumber, field, message })
    }

    const result = productImportRowSchema.safeParse(rows[i])

    if (!result.success) {
      for (const issue of result.error.issues) {
        push(String(issue.path[0] ?? 'row'), issue.message)
      }
    } else {
      const row = result.data

      // Category resolution (slug first, then case-insensitive name)
      const categoryIds: string[] = []
      for (const token of splitList(row.categories)) {
        const match = categoryBySlug.get(token) ?? categoryByName.get(token.toLowerCase())
        if (!match) {
          push('categories', `Category "${token}" not found`)
        } else if (!categoryIds.includes(match.id)) {
          categoryIds.push(match.id)
        }
      }
      if (categoryIds.length === 0) {
        push('categories', 'At least one valid category is required')
      }

      // HSN resolution (must be active)
      if (row.hsnCode && !activeHsnCodes.has(row.hsnCode)) {
        push('hsnCode', `HSN code "${row.hsnCode}" is not active or does not exist`)
      }

      // Barcodes
      const primaryBarcode = row.barcode ? row.barcode.trim() : ''
      const additionalBarcodes = splitList(row.additionalBarcodes)
      for (const bc of additionalBarcodes) {
        if (!/^[0-9A-Za-z\-]+$/.test(bc) || bc.length > 50) {
          push('additionalBarcodes', `Invalid barcode "${bc}"`)
        }
      }
      if (primaryBarcode && additionalBarcodes.includes(primaryBarcode)) {
        push(
          'additionalBarcodes',
          `Barcode "${primaryBarcode}" cannot be both primary and additional`
        )
      }

      // In-file duplicates
      if (seenSkus.has(row.sku)) {
        push(
          'sku',
          `SKU "${row.sku}" appears more than once in the file (first seen on row ${seenSkus.get(row.sku)})`
        )
      } else {
        seenSkus.set(row.sku, rowNumber)
      }
      for (const bc of [primaryBarcode, ...additionalBarcodes]) {
        if (!bc) continue
        if (seenBarcodes.has(bc)) {
          push(
            'barcode',
            `Barcode "${bc}" appears more than once in the file (first seen on row ${seenBarcodes.get(bc)})`
          )
        } else {
          seenBarcodes.set(bc, rowNumber)
        }
      }

      prepared.push({
        rowNumber,
        productData: buildProductData(row),
        categoryIds,
        additionalBarcodes,
      })
    }

    if (rowErrors.length > 0) {
      failedRows++
      errors.push(...rowErrors)
    }
  }

  // 5. Database conflict detection (only when every row is structurally valid)
  if (failedRows === 0) {
    const dbErrors: ProductImportRowError[] = []
    const skus = prepared.map((r) => r.productData.sku)
    const primaryBarcodes = prepared
      .map((r) => r.productData.barcode)
      .filter((b): b is string => !!b)
    const barcodes = [...primaryBarcodes, ...prepared.flatMap((r) => r.additionalBarcodes)]

    if (skus.length > 0) {
      const existing = await prisma.product.findMany({
        where: { sku: { in: skus } },
        select: { sku: true },
      })
      const existingSet = new Set(existing.map((p) => p.sku))
      for (const r of prepared) {
        if (existingSet.has(r.productData.sku)) {
          dbErrors.push({
            row: r.rowNumber,
            field: 'sku',
            message: `SKU "${r.productData.sku}" already exists in the database`,
          })
        }
      }
    }

    if (barcodes.length > 0) {
      const [existingPrimary, existingBarcodes] = await Promise.all([
        prisma.product.findMany({
          where: { barcode: { in: barcodes } },
          select: { barcode: true },
        }),
        prisma.productBarcode.findMany({
          where: { barcode: { in: barcodes } },
          select: { barcode: true },
        }),
      ])
      const existingPrimarySet = new Set(existingPrimary.map((p) => p.barcode))
      const existingBarcodeSet = new Set(existingBarcodes.map((b) => b.barcode))
      for (const r of prepared) {
        const allBarcodes = [r.productData.barcode, ...r.additionalBarcodes].filter(
          (b): b is string => !!b
        )
        const used = allBarcodes.find((b) => existingPrimarySet.has(b) || existingBarcodeSet.has(b))
        if (used) {
          dbErrors.push({
            row: r.rowNumber,
            field: 'barcode',
            message: `Barcode "${used}" already exists in the database`,
          })
        }
      }
    }

    if (dbErrors.length > 0) {
      failedRows = new Set(dbErrors.map((e) => e.row)).size
      errors.push(...dbErrors)
    }
  }

  if (failedRows > 0) {
    return { fileName: file.name, totalRows: rows.length, imported: 0, failed: failedRows, errors }
  }

  // 6. Transactional persistence (all-or-nothing)
  try {
    await prisma.$transaction(async (tx) => {
      const categoryRows: { productId: string; categoryId: string }[] = []
      const barcodeRows: {
        productId: string
        barcode: string
        type: string
        isPrimary: boolean
      }[] = []

      for (const row of prepared) {
        const product = await tx.product.create({
          data: { ...row.productData, createdById: userId },
        })
        for (const categoryId of row.categoryIds) {
          categoryRows.push({ productId: product.id, categoryId })
        }
        for (const barcode of row.additionalBarcodes) {
          barcodeRows.push({ productId: product.id, barcode, type: 'EAN13', isPrimary: false })
        }
      }

      if (categoryRows.length > 0) {
        await tx.productCategory.createMany({ data: categoryRows, skipDuplicates: true })
      }
      if (barcodeRows.length > 0) {
        await tx.productBarcode.createMany({ data: barcodeRows, skipDuplicates: true })
      }
    })
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      throw new Error(
        'Conflict: one or more SKU or barcode values already exist. No rows were imported.'
      )
    }
    throw err
  }

  return {
    fileName: file.name,
    totalRows: rows.length,
    imported: prepared.length,
    failed: 0,
    errors: [],
  }
}
