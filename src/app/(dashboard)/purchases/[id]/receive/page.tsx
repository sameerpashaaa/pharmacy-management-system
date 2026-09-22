'use client'

import Link from 'next/link'
import { useRouter, useParams } from 'next/navigation'
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

// Validation schema for GRN line items
const grnLineItemSchema = z.object({
  purchaseItemId: z.string().min(1, 'Purchase item is required'),
  receivedQuantity: z.coerce.number().int().positive('Received quantity must be positive'),
  batchNumber: z.string().min(1, 'Batch number is required'),
  expiryDate: z.string().min(1, 'Expiry date is required'),
  manufacturingDate: z.string().optional(),
  purchasePrice: z.coerce.number().min(0, 'Purchase price cannot be negative'),
  mrp: z.coerce.number().min(0, 'MRP cannot be negative'),
  coldChainTempLog: z.string().optional(),
  qualityCheckPassed: z.boolean().default(true),
  qualityCheckNotes: z.string().optional(),
})

const createGrnSchema = z.object({
  purchaseId: z.string().min(1, 'Purchase order is required'),
  branchId: z.string().min(1, 'Branch is required'),
  grnNumber: z.string().min(1, 'GRN number is required').max(50),
  grnDate: z.string().min(1, 'GRN date is required'),
  notes: z.string().max(1000).optional(),
  items: z
    .array(grnLineItemSchema)
    .min(1, 'At least one item is required')
    .max(200, 'Cannot exceed 200 items'),
})

type CreateGrnForm = z.infer<typeof createGrnSchema>

interface PurchaseWithItems {
  id: string
  purchaseNumber: string
  status: string
  branchId: string
  supplier: { id: string; name: string } | null
  items: Array<{
    id: string
    product: { id: string; name: string; sku: string; mrp: number }
    orderedQuantity: number
    receivedQuantity: number
    unitCost: number
    discountPercent: number
    taxPercent: number
  }>
}

export default function ReceiveGoodsPage() {
  const router = useRouter()
  const params = useParams()
  const purchaseId = params.id as string
  const [purchase, setPurchase] = useState<PurchaseWithItems | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CreateGrnForm>({
    resolver: zodResolver(createGrnSchema),
    defaultValues: {
      purchaseId,
      branchId: '',
      grnNumber: `GRN-${Date.now()}`,
      grnDate: new Date().toISOString().split('T')[0],
      items: [],
    },
  })

  const items = useWatch({ control, name: 'items' })

  // Fetch purchase details on mount
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true)
        const res = await fetch(`/api/purchases/${purchaseId}`)
        const data = (await res.json()) as {
          success: boolean
          error?: { message: string }
          data?: PurchaseWithItems
        }

        if (data.success && data.data) {
          setPurchase(data.data)
        } else {
          toast.error(data.error?.message || 'Failed to load purchase order')
          router.back()
        }
      } catch {
        toast.error('Failed to load purchase order')
        router.back()
      } finally {
        setLoading(false)
      }
    }
    void fetchData()
  }, [purchaseId, router])

  const addItem = () => {
    if (!purchase) return
    const currentItems = items
    if (currentItems.length >= 200) {
      toast.error('Cannot exceed 200 items')
      return
    }
    const poItems = purchase.items || []
    const alreadyAddedIds = new Set(currentItems.map((i) => i.purchaseItemId))
    const availableItems = poItems.filter((item) => !alreadyAddedIds.has(item.id))

    if (availableItems.length === 0) {
      toast.error('All PO items have already been added to this GRN')
      return
    }

    const firstAvailable = availableItems[0]
    const newItem = {
      purchaseItemId: firstAvailable.id,
      receivedQuantity: firstAvailable.orderedQuantity - firstAvailable.receivedQuantity,
      batchNumber: '',
      expiryDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      manufacturingDate: undefined,
      purchasePrice: firstAvailable.unitCost,
      mrp: firstAvailable.product.mrp,
      coldChainTempLog: '',
      qualityCheckPassed: true,
      qualityCheckNotes: '',
    }
    setValue('items', [...items, newItem])
  }

  const removeItem = (index: number) => {
    const newItems = items.filter((_, i) => i !== index)
    setValue('items', newItems)
  }

  const handleSubmitForm = async (data: CreateGrnForm) => {
    setSubmitting(true)
    try {
      // Validate cold chain: if any item has coldChainTempLog, it must be valid
      for (const item of data.items) {
        if (item.coldChainTempLog && item.coldChainTempLog.trim()) {
          const temp = parseFloat(item.coldChainTempLog)
          if (isNaN(temp) || temp < -40 || temp > 40) {
            toast.error('Cold chain temperature must be a valid number between -40 and 40')
            return
          }
        }

        // Validate quality check
        if (!item.qualityCheckPassed && !item.qualityCheckNotes?.trim()) {
          toast.error('Quality check notes are required when quality check fails')
          return
        }
      }

      const payload: CreateGrnForm = {
        ...data,
        grnDate: new Date(data.grnDate).toISOString(),
        items: data.items.map((item) => ({
          ...item,
          expiryDate: new Date(item.expiryDate).toISOString(),
          manufacturingDate: item.manufacturingDate
            ? new Date(item.manufacturingDate).toISOString()
            : undefined,
        })),
      }

      const res = await fetch(`/api/purchases/${purchaseId}/grn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = (await res.json()) as { success: boolean; error?: { message: string } }

      if (!res.ok || !json.success) {
        const message = json.error?.message || 'Failed to create GRN'
        throw new Error(message)
      }

      toast.success('GRN created successfully')
      router.push(ROUTES.PURCHASE(purchaseId))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create GRN')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading purchase order...</p>
      </div>
    )
  }

  if (!purchase) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Purchase order not found</p>
      </div>
    )
  }

  // Filter PO items that can still be received
  const availableItems = purchase.items.filter(
    (item) => item.receivedQuantity < item.orderedQuantity
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button asChild variant="outline" size="sm">
          <Link href={ROUTES.PURCHASE(purchaseId)}>&larr; Back to PO</Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Receive Goods — GRN</h1>
          <p className="text-muted-foreground">
            Record goods received against {purchase.purchaseNumber}
          </p>
        </div>
      </div>

      {availableItems.length === 0 && (
        <div className="py-8 text-center text-muted-foreground">
          All items in this purchase order have been fully received.
        </div>
      )}

      <form onSubmit={handleSubmit(handleSubmitForm)} className="space-y-6">
        {/* Header Section */}
        <Card>
          <CardHeader>
            <CardTitle>GRN Information</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="branchId">Branch *</Label>
              <Select
                onValueChange={(v) => setValue('branchId', v)}
                defaultValue={purchase.branchId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select branch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={purchase.branchId}>{purchase.branchId}</SelectItem>
                </SelectContent>
              </Select>
              {errors.branchId && <p className="text-sm text-red-500">{errors.branchId.message}</p>}
            </div>

            <div className="space-y-2">
              <Label htmlFor="grnNumber">GRN Number *</Label>
              <Input {...register('grnNumber')} placeholder="GRN-001" />
              {errors.grnNumber && (
                <p className="text-sm text-red-500">{errors.grnNumber.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="grnDate">GRN Date *</Label>
              <Input type="date" {...register('grnDate')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input {...register('notes')} placeholder="Optional notes" />
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Items to Receive</CardTitle>
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
                    <TableHead className="w-[100px]">Ordered</TableHead>
                    <TableHead className="w-[100px]">Received</TableHead>
                    <TableHead className="w-[100px]">Remaining</TableHead>
                    <TableHead className="w-[100px]">Receive Qty *</TableHead>
                    <TableHead className="w-[120px]">Unit Cost</TableHead>
                    <TableHead className="w-[150px]">Batch # *</TableHead>
                    <TableHead className="w-[150px]">Expiry *</TableHead>
                    <TableHead className="w-[100px]">Quality</TableHead>
                    <TableHead className="w-[100px]">Cold Chain</TableHead>
                    <TableHead className="w-[50px]">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <Select
                          onValueChange={(v) => setValue(`items.${index}.purchaseItemId`, v)}
                          defaultValue={item.purchaseItemId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableItems
                              .filter(
                                (poItem) => !items.some((i) => i.purchaseItemId === poItem.id)
                              )
                              .map((poItem) => (
                                <SelectItem key={poItem.id} value={poItem.id}>
                                  {poItem.product.name} ({poItem.product.sku})
                                </SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                        {errors.items?.[index]?.purchaseItemId && (
                          <p className="mt-1 text-sm text-red-500">
                            {errors.items[index].purchaseItemId.message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          className="w-[80px]"
                          {...register(`items.${index}.receivedQuantity`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell>{item.receivedQuantity}</TableCell>
                      <TableCell>
                        {(() => {
                          const poItem = availableItems.find((po) => po.id === item.purchaseItemId)
                          return poItem ? poItem.orderedQuantity - (item.receivedQuantity || 0) : 0
                        })()}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          className="w-[80px]"
                          {...register(`items.${index}.receivedQuantity`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          className="w-[100px]"
                          {...register(`items.${index}.purchasePrice`, { valueAsNumber: true })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          {...register(`items.${index}.batchNumber`)}
                          placeholder="Batch #"
                          className="w-full"
                        />
                        {errors.items?.[index]?.batchNumber && (
                          <p className="mt-1 text-sm text-red-500">
                            {errors.items[index].batchNumber.message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="date"
                          {...register(`items.${index}.expiryDate`)}
                          className="w-full"
                        />
                        {errors.items?.[index]?.expiryDate && (
                          <p className="mt-1 text-sm text-red-500">
                            {errors.items[index].expiryDate.message}
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select
                          onValueChange={(v) =>
                            setValue(`items.${index}.qualityCheckPassed`, v === 'true')
                          }
                          defaultValue={item.qualityCheckPassed ? 'true' : 'false'}
                        >
                          <SelectTrigger className="w-[80px]">
                            <SelectValue placeholder="Pass/Fail" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="true">Pass</SelectItem>
                            <SelectItem value="false">Fail</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input
                          {...register(`items.${index}.coldChainTempLog`)}
                          placeholder="Temp °C"
                          className="w-[80px]"
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
              placeholder="Additional notes for this GRN"
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
            {submitting ? 'Creating...' : 'Create GRN'}
          </Button>
        </div>
      </form>
    </div>
  )
}
