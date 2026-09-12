import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { can } from '@/lib/auth/auth-helpers'
import { PERMISSIONS } from '@/lib/constants/permissions'
import { ROUTES } from '@/lib/constants/routes'
import { getProductById } from '@/lib/products/product-service'
import { formatDate } from '@/lib/utils/date'

export const metadata: Metadata = { title: 'Product Details' }

function DetailRow({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium">{value ?? '—'}</dd>
    </div>
  )
}

export default async function ProductDetailPage({ params }: { params: { id: string } }) {
  const [canRead, canUpdate] = await Promise.all([
    can(PERMISSIONS.PRODUCTS_READ),
    can(PERMISSIONS.PRODUCTS_UPDATE),
  ])

  if (!canRead) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">You do not have permission to view products.</p>
      </div>
    )
  }

  const product = await getProductById(params.id)
  if (!product) notFound()

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
            <Badge variant={product.isActive ? 'success' : 'destructive'}>
              {product.isActive ? 'Active' : 'Inactive'}
            </Badge>
            {product.isPrescriptionRequired && <Badge variant="warning">Rx</Badge>}
            {product.drugSchedule !== 'NONE' && (
              <Badge variant="info">{product.drugSchedule}</Badge>
            )}
          </div>
          {product.genericName && <p className="text-muted-foreground">{product.genericName}</p>}
          <p className="mt-1 text-sm text-muted-foreground">
            SKU: <span className="font-mono">{product.sku}</span>
          </p>
        </div>
        {canUpdate && (
          <Button asChild size="sm">
            <Link href={ROUTES.PRODUCT_EDIT(params.id)}>Edit Product</Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Classification */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Classification</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Generic Name" value={product.genericName} />
              <DetailRow label="Drug Schedule" value={product.drugSchedule} />
              <DetailRow
                label="Prescription Required"
                value={product.isPrescriptionRequired ? 'Yes' : 'No'}
              />
              <DetailRow label="Unit of Measure" value={product.unitOfMeasure} />
              <DetailRow label="Tabs per Strip" value={product.tabsPerStrip} />
              <DetailRow label="Pack Size" value={product.packSize} />
              <DetailRow
                label="Categories"
                value={
                  <div className="flex flex-wrap justify-end gap-1">
                    {product.categories.map((c) => (
                      <Badge key={c.category.id} variant="secondary">
                        {c.category.name}
                      </Badge>
                    ))}
                  </div>
                }
              />
            </dl>
          </CardContent>
        </Card>

        {/* Pricing & GST */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pricing &amp; GST</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="MRP" value={`₹${product.mrp.toString()}`} />
              <DetailRow
                label="PTR"
                value={product.ptr !== null ? `₹${product.ptr.toString()}` : undefined}
              />
              <DetailRow
                label="Cost Price"
                value={product.costPrice !== null ? `₹${product.costPrice.toString()}` : undefined}
              />
              <DetailRow label="HSN Code" value={product.hsnCode} />
              <DetailRow
                label="GST Rate"
                value={product.isGstExempt ? 'Exempt' : `${product.gstRate.toString()}%`}
              />
              <DetailRow
                label="CGST / SGST"
                value={
                  product.isGstExempt
                    ? '—'
                    : `${product.cgstRate.toString()}% / ${product.sgstRate.toString()}%`
                }
              />
              <DetailRow
                label="IGST"
                value={product.isGstExempt ? '—' : `${product.igstRate.toString()}%`}
              />
            </dl>
          </CardContent>
        </Card>

        {/* Stock & Misc */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Stock &amp; Other</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              <DetailRow label="Min Stock Level" value={product.minStockLevel} />
              <DetailRow label="Max Stock Level" value={product.maxStockLevel} />
              <DetailRow label="Reorder Level" value={product.reorderLevel} />
              <DetailRow label="Returnable" value={product.isReturnable ? 'Yes' : 'No'} />
              <DetailRow label="Manufacturer" value={product.manufacturer} />
              <DetailRow label="Created By" value={product.createdBy?.name} />
              <DetailRow label="Created" value={formatDate(product.createdAt)} />
            </dl>
          </CardContent>
        </Card>

        {/* Barcodes & Description */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Barcodes &amp; Description</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Primary Barcode</p>
              <p className="font-mono text-sm">{product.barcode ?? '—'}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Additional Barcodes</p>
              {product.barcodes.length === 0 ? (
                <p className="text-sm text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1">
                  {product.barcodes.map((b) => (
                    <li key={b.id} className="flex items-center justify-between">
                      <span className="font-mono text-sm">{b.barcode}</span>
                      <span className="text-xs text-muted-foreground">{b.type}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {product.description && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Description</p>
                <p className="text-sm">{product.description}</p>
              </div>
            )}
            {product.composition && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Composition</p>
                <p className="text-sm">{product.composition}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
