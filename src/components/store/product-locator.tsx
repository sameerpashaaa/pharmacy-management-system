/* eslint-disable */
'use client'

import { Search, Package, MapPin, Loader2, ArrowRight } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

import { LocationBadge } from './location-badge'


interface Location {
  id: string
  quantity: number
  batch?: {
    batchNumber: string
    expiryDate: string
  }
  wall: { id: string; name: string; code: string }
  rack: { id: string; name: string; code: string }
  shelf: { id: string; level: number; label?: string }
  bin: { id: string; code: string; fullAddress: string }
}

interface ProductResult {
  product: {
    id: string
    name: string
    sku: string
    genericName?: string
  }
  locations: Location[]
}

export function ProductLocator() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductResult[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  const handleSearch = async () => {
    if (!query || query.trim().length < 2) return

    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch(`/api/store/locate?q=${encodeURIComponent(query)}`)
      const json = await res.json()
      if (json.success) {
        setResults(json.data as ProductResult[])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by product name, generic name, SKU, barcode, or batch..."
                className="pl-9"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch} disabled={loading || query.length < 2}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Locate
            </Button>
          </div>
        </CardContent>
      </Card>

      {searched && results.length === 0 && !loading && (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-3 mb-4">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="mb-2">No items found</CardTitle>
          <CardDescription>
            We couldn&apos;t find any products or batches matching &quot;{query}&quot; in the store.
          </CardDescription>
        </Card>
      )}

      {results.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Search Results</h3>
          {results.map((result) => (
            <Card key={result.product.id} className="overflow-hidden">
              <div className="flex flex-col md:flex-row md:items-start gap-4 p-6">
                <div className="flex-1">
                  <h4 className="text-lg font-semibold flex items-center gap-2">
                    <Package className="h-5 w-5 text-blue-500" />
                    {result.product.name}
                  </h4>
                  <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <span>SKU: {result.product.sku}</span>
                    {result.product.genericName && (
                      <>
                        <span>•</span>
                        <span>{result.product.genericName}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex-1 w-full border rounded-md divide-y">
                  {result.locations.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No stock placed in bins.
                    </div>
                  ) : (
                    result.locations.map((loc) => (
                      <div key={loc.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex flex-col gap-1">
                          <LocationBadge fullAddress={loc.bin.fullAddress} className="w-fit text-base px-3 py-1" />
                          <div className="text-xs text-muted-foreground flex gap-1">
                            {loc.wall.name} &rarr; {loc.rack.name} &rarr; Shelf {loc.shelf.level} &rarr; Bin {loc.bin.code}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold text-lg">{loc.quantity} <span className="text-sm font-normal text-muted-foreground">units</span></div>
                          {loc.batch && (
                            <Badge variant="secondary" className="text-xs mt-1">
                              Batch: {loc.batch.batchNumber}
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
