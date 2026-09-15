'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
// eslint-disable-next-line import/order
import { zodResolver } from '@hookform/resolvers/zod'
// eslint-disable-next-line import/order
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ROUTES } from '@/lib/constants/routes'

// Validation schema for the form
const lineItemSchema = z.object({
  productId: z.string().min(1, 'Product is required'),
  orderedQuantity: z.coerce.number().int().positive('Must be positive'),
  unitCost: z.coerce.number().min(0, 'Must be non-negative'),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  taxPercent: z.coerce.number().min(0).max(100).default(0),
  batchNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  manufacturingDate: z.string().optional(),
})

const createPurchaseSchema = z.object({
  branchId: z.string().min(1, 'Branch is required'),
  supplierId: z.string().min(1, 'Supplier is required'),
  expectedDate: z.string().optional(),
  notes: z.string().max(1000).optional(),
  items: z
    .array(lineItemSchema)
    .min(1, 'At least one item is required')
    .max(200, 'Cannot exceed 200 items'),
})

type CreatePurchaseForm = z.infer<typeof createPurchaseSchema>
type LineItemForm = z.infer<typeof lineItemSchema>

export default function NewPurchaseOrderPage() {
  const router = useRouter()
  const [products, setProducts] = useState<
    { id: string; name: string; sku: string; mrp: number }[]
  >([])
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([])
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([])
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreatePurchaseForm>({
    resolver: zodResolver(createPurchaseSchema),
    defaultValues: {
      items: [
        { productId: '', orderedQuantity: 1, unitCost: 0, discountPercent: 0, taxPercent: 0 },
      ],
    },
  })

  const items = useWatch({ control, name: 'items' })

  // Fetch reference data on mount
  useEffect(() => {
    void (async function fetchReferenceData() {
      try {
        const [productsRes, suppliersRes, branchesRes] = await Promise.all([
          fetch('/api/pos/products'),
          fetch('/api/suppliers'),
          fetch('/api/inventory/branches'),
        ])
        const productsData = await productsRes.json()
        const suppliersData = await suppliersRes.json()
        const branchesData = await branchesRes.json()

        if (productsData.success)
          setProducts(productsData.data as { id: string; name: string; sku: string; mrp: number }[])
        if (suppliersData.success)
          setSuppliers(suppliersData.data as { id: string; name: string }[])
        if (branchesData.success) setBranches(branchesData.data as { id: string; name: string }[])
      } catch {
        toast.error('Failed to load reference data')
      }
    })()
  }, [])

  const addItem = () => {
    if (items.length >= 200) {
      toast.error('Cannot exceed 200 items')
      return
    }
    const newItem: LineItemForm = {
      productId: '',
      orderedQuantity: 1,
      unitCost: 0,
      discountPercent: 0,
      taxPercent: 0,
    }
    setValue('items', [...items, newItem])
  }

  const removeItem = (index: number) => {
    if (items.length <= 1) {
      toast.error('At least one item is required')
      return
    }
    const newItems = items.filter((_, i) => i !== index)
    setValue('items', newItems)
  }

  const handleSubmitForm = async (data: CreatePurchaseForm) => {
    setSubmitting(true)
    try {
      const command = {
        branchId: data.branchId,
        supplierId: data.supplierId,
        expectedDate: data.expectedDate ? new Date(data.expectedDate) : undefined,
        notes: data.notes,
        items: data.items.map((item) => {
          return {
            productId: item.productId,
            orderedQuantity: item.orderedQuantity,
            unitCost: item.unitCost,
            discountPercent: item.discountPercent,
            taxPercent: item.taxPercent,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
            manufacturingDate: item.manufacturingDate
              ? new Date(item.manufacturingDate)
              : undefined,
          }
        }),
      }

      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(command),
      })

      const json = (await res.json()) as {
        success: boolean
        error?: { message: string }
        data?: { id: string }
      }

      if (!res.ok || !json.success) {
        const message = json.error?.message || 'Failed to create purchase order'
        throw new Error(message)
      }

      toast.success('Purchase order created successfully')
      router.push(ROUTES.PURCHASE(json.data!.id))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create purchase order')
    }
  }

  const calculateLineTotal = (item: LineItemForm) => {
    const subtotal = item.orderedQuantity * item.unitCost
    const discountAmount = subtotal * (item.discountPercent / 100)
    const taxableAmount = subtotal - discountAmount
    const taxAmount = taxableAmount * (item.taxPercent / 100)
    return taxableAmount + taxAmount
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.PURCHASES}>&larr; Back</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">New Purchase Order</h1>
          <p className="text-muted-foreground">Create a new purchase order for a supplier</p>
        </div>
      </div>

      <form onSubmit={handleSubmit(handleSubmitForm)} className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader>
            <CardTitle>Order Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="branchId">Branch *</Label>
              <Select
                onValueChange={(v) => setValue('branchId', v)}
                defaultValue={useWatch({ control, name: 'branchId' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.branchId && <p className="text-sm text-red-500">{errors.branchId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="supplierId">Supplier *</Label>
              <Select
                onValueChange={(v) => setValue('supplierId', v)}
                defaultValue={useWatch({ control, name: 'supplierId' })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.supplierId && (
                <p className="text-sm text-red-500">{errors.supplierId.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="expectedDate">Expected Date</Label>
              <Input
                type="date"
                {...register('expectedDate')}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Line Items</CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addItem}
              disabled={items.length >= 200}
            >
              Add Item
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Product *</TableHead>
                    <TableHead className="w-[100px]">Qty *</TableHead>
                    <TableHead className="w-[120px]">Unit Cost *</TableHead>
                    <TableHead className="w-[100px]">Disc %</TableHead>
                    <TableHead className="w-[100px]">Tax %</TableHead>
                    <TableHead className="w-[150px]">Total</TableHead>
                    <TableHead className="w-[150px]">Batch #</TableHead>
                    <TableHead className="w-[150px]">Expiry</TableHead>
                    <TableHead className="w-[50px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Select
                          onValueChange={(v) => setValue(`items.${index}.productId`, v)}
                          defaultValue={item.productId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name} ({product.sku})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {errors.items?.[index]?.productId && (
                          <p className="mt-1 text-sm text-red-500">
                            {errors.items[index].productId.message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          className="w-[80px]"
                          {...register(`items.${index}.orderedQuantity`, { valueAsNumber: true })}
                        />
                        {errors.items?.[index]?.orderedQuantity && (
                          <p className="mt-1 text-sm text-red-500">
                            {errors.items[index].orderedQuantity.message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-[100px]"
                          {...register(`items.${index}.unitCost`, { valueAsNumber: true })}
                        />
                        {errors.items?.[index]?.unitCost && (
                          <p className="mt-1 text-sm text-red-500">
                            {errors.items[index].unitCost.message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          className="w-[80px]"
                          {...register(`items.${index}.discountPercent`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          className="w-[80px]"
                          {...register(`items.${index}.taxPercent`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell className="font-medium tabular-nums">
                        {calculateLineTotal(
                          item || {
                            orderedQuantity: 0,
                            unitCost: 0,
                            discountPercent: 0,
                            taxPercent: 0,
                          }
                        ).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </TableCell>
                      <TableCell>
                        <Input
                          {...register(`items.${index}.batchNumber`)}
                          placeholder="Optional"
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          {...register(`items.${index}.expiryDate`)}
                          className="w-full"
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => removeItem(index)}
                          disabled={items.length <= 1}
                          className="text-red-500 hover:text-red-700"
                        >
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v12m-6 0h12m-6 0h12v-6H5v6"
                            />
                          </svg>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <textarea
              {...register('notes')}
              placeholder="Additional notes for this purchase order"
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {errors.notes && <p className="mt-1 text-sm text-red-500">{errors.notes.message}</p>}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Purchase Order'}
          </Button>
        </div>
      </form>
    </div>
  )
}
