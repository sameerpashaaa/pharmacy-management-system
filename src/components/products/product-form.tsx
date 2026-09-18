'use client'

// ─────────────────────────────────────────────────────────────
// Component — ProductForm
// Create / edit a product with categories, HSN/GST, pricing,
// stock levels, and additional barcodes.
// ─────────────────────────────────────────────────────────────
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useFieldArray, useForm } from 'react-hook-form'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/lib/hooks/use-toast'
import { createProductSchema, STORAGE_CONDITION_LABELS } from '@/lib/validations/product'

type ProductFormValues = z.infer<typeof createProductSchema>

type CategoryOption = { id: string; name: string }
type HsnCodeOption = {
  code: string
  description: string
  gstRate: string | number
  cgstRate: string | number
  sgstRate: string | number
  igstRate: string | number
}

const DRUG_SCHEDULES = ['NONE', 'H', 'H1', 'X', 'G', 'J'] as const

const STORAGE_CONDITIONS = Object.entries(STORAGE_CONDITION_LABELS).map(([value, label]) => ({
  value,
  label,
}))

interface ProductFormInit {
  id?: string
  name: string
  genericName?: string | null
  sku: string
  barcode?: string | null
  description?: string | null
  manufacturer?: string | null
  composition?: string | null
  drugSchedule: string
  storageCondition?: string | null
  isPrescriptionRequired: boolean
  unitOfMeasure: string
  tabsPerStrip?: number | null
  packSize?: string | null
  hsnCode?: string | null
  mrp: string | number
  ptr?: string | number | null
  costPrice?: string | number | null
  gstRate?: string | number
  cgstRate?: string | number
  sgstRate?: string | number
  igstRate?: string | number
  isGstExempt?: boolean
  minStockLevel: number
  maxStockLevel?: number | null
  reorderLevel: number
  imageUrl?: string | null
  isActive: boolean
  isReturnable: boolean
  categories: { category: { id: string; name: string } }[]
  barcodes: { id: string; barcode: string; type?: string | null }[]
}

interface ProductFormProps {
  initialData?: ProductFormInit
  onSuccess?: () => void
  onCancel?: () => void
  successHref?: string
}

function toNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  return typeof v === 'number' ? v : Number(v)
}

export function ProductForm({ initialData, onSuccess, onCancel, successHref }: ProductFormProps) {
  const router = useRouter()
  const toast = useToast()
  const isEditing = Boolean(initialData?.id)

  const [categories, setCategories] = useState<CategoryOption[]>([])
  const [hsnCodes, setHsnCodes] = useState<HsnCodeOption[]>([])
  const [loadingOptions, setLoadingOptions] = useState(true)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(createProductSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      genericName: initialData?.genericName ?? '',
      sku: initialData?.sku ?? '',
      barcode: initialData?.barcode ?? '',
      description: initialData?.description ?? '',
      manufacturer: initialData?.manufacturer ?? '',
      composition: initialData?.composition ?? '',
      drugSchedule: (initialData?.drugSchedule as ProductFormValues['drugSchedule']) ?? 'NONE',
      storageCondition:
        (initialData?.storageCondition as ProductFormValues['storageCondition']) ?? undefined,
      isPrescriptionRequired: initialData?.isPrescriptionRequired ?? false,
      unitOfMeasure: initialData?.unitOfMeasure ?? 'Strip',
      tabsPerStrip: initialData?.tabsPerStrip ?? undefined,
      packSize: initialData?.packSize ?? '',
      hsnCode: initialData?.hsnCode ?? undefined,
      gstRate: toNumber(initialData?.gstRate) || 12,
      cgstRate: toNumber(initialData?.cgstRate) || 6,
      sgstRate: toNumber(initialData?.sgstRate) || 6,
      igstRate: toNumber(initialData?.igstRate) || 12,
      isGstExempt: initialData?.isGstExempt ?? false,
      mrp: toNumber(initialData?.mrp),
      ptr: toNumber(initialData?.ptr),
      costPrice: toNumber(initialData?.costPrice),
      minStockLevel: initialData?.minStockLevel ?? 10,
      maxStockLevel: initialData?.maxStockLevel ?? undefined,
      reorderLevel: initialData?.reorderLevel ?? 20,
      imageUrl: initialData?.imageUrl ?? '',
      isActive: initialData?.isActive ?? true,
      isReturnable: initialData?.isReturnable ?? true,
      categoryIds: initialData?.categories.map((c) => c.category.id) ?? [],
      barcodes:
        initialData?.barcodes.map((b) => ({
          barcode: b.barcode,
          type: b.type ?? 'EAN13',
          isPrimary: false,
        })) ?? [],
    },
  })

  const barcodeFields = useFieldArray({ control, name: 'barcodes' })

  const selectedCategories = watch('categoryIds')
  function toggleCategory(id: string) {
    const current = selectedCategories
    const next = current.includes(id) ? current.filter((c) => c !== id) : [...current, id]
    setValue('categoryIds', next, { shouldValidate: true })
  }

  const selectedHsn = watch('hsnCode')
  function applyHsn(code: string) {
    setValue('hsnCode', code, { shouldValidate: true })
    const hsn = hsnCodes.find((h) => h.code === code)
    if (hsn) {
      setValue('gstRate', toNumber(hsn.gstRate))
      setValue('cgstRate', toNumber(hsn.cgstRate))
      setValue('sgstRate', toNumber(hsn.sgstRate))
      setValue('igstRate', toNumber(hsn.igstRate))
    }
  }

  // Load options
  useEffect(() => {
    Promise.all([
      fetch('/api/categories/options').then((r) => r.json()),
      fetch('/api/hsn-codes').then((r) => r.json()),
    ])
      .then(([catJson, hsnJson]) => {
        if (catJson.success) {
          setCategories(catJson.data as CategoryOption[])
          if (initialData && initialData.categories.length === 0) {
            // no-op; store on submit
          }
        }
        if (hsnJson.success) {
          setHsnCodes(hsnJson.data as HsnCodeOption[])
        }
      })
      .catch(() => toast.error('Failed to load categories or HSN codes'))
      .finally(() => setLoadingOptions(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(raw: ProductFormValues) {
    // Normalize empty numeric inputs (NaN from empty fields) to undefined
    const data: ProductFormValues = { ...raw }
    for (const key of ['ptr', 'costPrice'] as const) {
      const v = data[key]
      if (v === 0) (data as Record<string, unknown>)[key] = undefined
    }
    const optNum = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? undefined : v)
    data.tabsPerStrip = optNum(data.tabsPerStrip)
    data.maxStockLevel = optNum(data.maxStockLevel)
    data.ptr = optNum(data.ptr)
    data.costPrice = optNum(data.costPrice)

    const url = isEditing ? `/api/products/${initialData!.id}` : '/api/products'
    const method = isEditing ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (res.ok) {
      toast.success(isEditing ? 'Product updated successfully' : 'Product created successfully')
      onSuccess?.()
      if (successHref) {
        router.push(successHref)
        router.refresh()
      }
    } else {
      const json = (await res.json()) as { error?: { message?: string; code?: string } }
      toast.error(json.error?.message ?? 'Something went wrong')
    }
  }

  const numeric = {
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'e' || e.key === 'E') e.preventDefault()
    },
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* ── Basic Info ─────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Basic Information
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="product-name">Product Name *</Label>
            <Input id="product-name" {...register('name')} placeholder="e.g. Paracetamol 500mg" />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-generic">Generic Name</Label>
            <Input
              id="product-generic"
              {...register('genericName')}
              placeholder="e.g. Paracetamol"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-sku">SKU *</Label>
            <Input
              id="product-sku"
              {...register('sku')}
              placeholder="e.g. PCM-500"
              className="font-mono"
            />
            {errors.sku && <p className="text-xs text-destructive">{errors.sku.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-barcode">Primary Barcode</Label>
            <Input
              id="product-barcode"
              {...register('barcode')}
              placeholder="EAN/UPC"
              className="font-mono"
            />
            {errors.barcode && <p className="text-xs text-destructive">{errors.barcode.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-manufacturer">Manufacturer</Label>
            <Input
              id="product-manufacturer"
              {...register('manufacturer')}
              placeholder="e.g. Generic Pharma"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-pack">Pack Size</Label>
            <Input
              id="product-pack"
              {...register('packSize')}
              placeholder="e.g. 10 tablets or 100ml"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="product-desc">Description</Label>
          <Input
            id="product-desc"
            {...register('description')}
            placeholder="Short description (optional)"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="product-composition">Composition</Label>
          <Input
            id="product-composition"
            {...register('composition')}
            placeholder="e.g. Paracetamol 500mg"
          />
        </div>
      </section>

      {/* ── Classification ─────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Classification
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Drug Schedule *</Label>
            <Select
              value={watch('drugSchedule')}
              onValueChange={(v) =>
                setValue('drugSchedule', v as ProductFormValues['drugSchedule'], {
                  shouldValidate: true,
                })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DRUG_SCHEDULES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-uom">Unit of Measure *</Label>
            <Input id="product-uom" {...register('unitOfMeasure')} placeholder="Strip" />
            {errors.unitOfMeasure && (
              <p className="text-xs text-destructive">{errors.unitOfMeasure.message}</p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-tabs">Tabs per Strip</Label>
            <Input
              id="product-tabs"
              type="number"
              min={0}
              {...register('tabsPerStrip', { valueAsNumber: true })}
              {...numeric}
            />
          </div>
          <div className="flex items-end gap-4 pb-1">
            <Checkbox
              id="product-rx"
              checked={watch('isPrescriptionRequired')}
              onCheckedChange={(checked) => setValue('isPrescriptionRequired', checked === true)}
            />
            <Label htmlFor="product-rx" className="font-normal">
              Prescription required (Rx)
            </Label>
          </div>
          <div className="space-y-1">
            <Label>Storage Condition</Label>
            <Select
              value={watch('storageCondition') ?? 'none'}
              onValueChange={(v) =>
                setValue(
                  'storageCondition',
                  v === 'none' ? undefined : (v as ProductFormValues['storageCondition']),
                  {
                    shouldValidate: true,
                  }
                )
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select storage condition" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {STORAGE_CONDITIONS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.storageCondition && (
              <p className="text-xs text-destructive">{errors.storageCondition.message}</p>
            )}
          </div>
        </div>

        {/* Categories */}
        <div className="space-y-2">
          <Label>Categories *</Label>
          {loadingOptions ? (
            <p className="text-sm text-muted-foreground">Loading categories…</p>
          ) : categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No categories found. Add a category first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const selected = selectedCategories.includes(cat.id)
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleCategory(cat.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-transparent hover:bg-muted'
                    }`}
                  >
                    {cat.name}
                  </button>
                )
              })}
            </div>
          )}
          {errors.categoryIds && (
            <p className="text-xs text-destructive">{errors.categoryIds.message}</p>
          )}
        </div>
      </section>

      {/* ── HSN / GST ──────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          HSN Code &amp; GST
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>HSN Code</Label>
            <Select
              value={selectedHsn ?? 'none'}
              onValueChange={(v) => applyHsn(v === 'none' ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select HSN code" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— None —</SelectItem>
                {hsnCodes.map((h) => (
                  <SelectItem key={h.code} value={h.code}>
                    {h.code} — {h.description}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-gst">GST Rate (%)</Label>
            <Input
              id="product-gst"
              type="number"
              step="0.01"
              {...register('gstRate', { valueAsNumber: true })}
              {...numeric}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-cgst">CGST (%)</Label>
            <Input
              id="product-cgst"
              type="number"
              step="0.01"
              {...register('cgstRate', { valueAsNumber: true })}
              {...numeric}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-sgst">SGST (%)</Label>
            <Input
              id="product-sgst"
              type="number"
              step="0.01"
              {...register('sgstRate', { valueAsNumber: true })}
              {...numeric}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-igst">IGST (%)</Label>
            <Input
              id="product-igst"
              type="number"
              step="0.01"
              {...register('igstRate', { valueAsNumber: true })}
              {...numeric}
            />
          </div>
          <div className="flex items-end gap-4 pb-1">
            <Checkbox
              id="product-gst-exempt"
              checked={watch('isGstExempt')}
              onCheckedChange={(checked) => setValue('isGstExempt', checked === true)}
            />
            <Label htmlFor="product-gst-exempt" className="font-normal">
              GST exempt
            </Label>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="product-mrp">MRP (₹) *</Label>
            <Input
              id="product-mrp"
              type="number"
              step="0.01"
              min={0}
              {...register('mrp', { valueAsNumber: true })}
              {...numeric}
            />
            {errors.mrp && <p className="text-xs text-destructive">{errors.mrp.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-ptr">PTR (₹)</Label>
            <Input
              id="product-ptr"
              type="number"
              step="0.01"
              min={0}
              {...register('ptr', { valueAsNumber: true })}
              {...numeric}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-cost">Cost Price (₹)</Label>
            <Input
              id="product-cost"
              type="number"
              step="0.01"
              min={0}
              {...register('costPrice', { valueAsNumber: true })}
              {...numeric}
            />
          </div>
        </div>
      </section>

      {/* ── Stock Levels ───────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Stock Levels
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="product-min">Min Stock Level</Label>
            <Input
              id="product-min"
              type="number"
              min={0}
              {...register('minStockLevel', { valueAsNumber: true })}
              {...numeric}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-max">Max Stock Level</Label>
            <Input
              id="product-max"
              type="number"
              min={0}
              {...register('maxStockLevel', { valueAsNumber: true })}
              {...numeric}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="product-reorder">Reorder Level</Label>
            <Input
              id="product-reorder"
              type="number"
              min={0}
              {...register('reorderLevel', { valueAsNumber: true })}
              {...numeric}
            />
          </div>
        </div>
      </section>

      {/* ── Additional Barcodes ────────────────────── */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Additional Barcodes
        </h3>
        {barcodeFields.fields.map((field, index) => (
          <div key={field.id} className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor={`bc-${index}`}>Barcode</Label>
              <Input
                id={`bc-${index}`}
                className="font-mono"
                {...register(`barcodes.${index}.barcode`)}
                placeholder="EAN/UPC"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="mb-0.5 h-10 w-10 text-destructive"
              onClick={() => barcodeFields.remove(index)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => barcodeFields.append({ barcode: '', type: 'EAN13', isPrimary: false })}
        >
          <Plus className="mr-1.5 h-4 w-4" /> Add Barcode
        </Button>
        {errors.barcodes && <p className="text-xs text-destructive">{errors.barcodes.message}</p>}
      </section>

      {/* ── Status ─────────────────────────────────── */}
      <section className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Checkbox
            id="product-active"
            checked={watch('isActive')}
            onCheckedChange={(c) => setValue('isActive', c === true)}
          />
          <Label htmlFor="product-active" className="font-normal">
            Active product
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="product-returnable"
            checked={watch('isReturnable')}
            onCheckedChange={(c) => setValue('isReturnable', c === true)}
          />
          <Label htmlFor="product-returnable" className="font-normal">
            Returnable
          </Label>
        </div>
      </section>

      {/* ── Actions ────────────────────────────────── */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Product'}
        </Button>
      </div>
    </form>
  )
}
