/* eslint-disable */
import { Plus, Grid, Layers, MapPin } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { requireAuth } from '@/lib/auth/auth-helpers'
import { prisma } from '@/lib/db/prisma'
import { WallFormDialog } from '@/components/store/wall-form-dialog'
import { RackFormDialog } from '@/components/store/rack-form-dialog'
import { ShelfFormDialog } from '@/components/store/shelf-form-dialog'
import { BinFormDialog } from '@/components/store/bin-form-dialog'

export const metadata = {
  title: 'Walls & Racks | Store Management',
}

export default async function StoreWallsPage() {
  const user = await requireAuth()
  const branchId = user.branchId
  if (!branchId) throw new Error('Branch ID is required')

  // Fetch full hierarchy
  const walls = await prisma.wall.findMany({
    where: { branchId },
    orderBy: { sortOrder: 'asc' },
    include: {
      racks: {
        orderBy: { sortOrder: 'asc' },
        include: {
          shelves: {
            orderBy: { level: 'asc' },
            include: {
              bins: {
                orderBy: { binCode: 'asc' },
                include: {
                  stock: true,
                }
              }
            }
          }
        }
      }
    }
  })

  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Walls & Racks</h2>
        <WallFormDialog branchId={branchId} />
      </div>

      <p className="text-muted-foreground mb-6">
        Manage the physical layout of your store. Organize inventory by Walls &rarr; Racks &rarr; Shelves &rarr; Bins.
      </p>

      {walls.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-3 mb-4">
            <Grid className="h-6 w-6 text-muted-foreground" />
          </div>
          <CardTitle className="mb-2">No walls configured</CardTitle>
          <CardDescription>
            You haven't set up your store's layout yet. Add your first wall to get started.
          </CardDescription>
        </Card>
      ) : (
        <div className="space-y-8">
          {walls.map((wall) => (
            <div key={wall.id} className="space-y-4">
              <div className="flex items-center gap-3">
                <h3 className="text-2xl font-semibold flex items-center gap-2">
                  <Grid className="h-5 w-5" />
                  {wall.name} <span className="text-muted-foreground">({wall.code})</span>
                </h3>
                <Badge variant="outline">{wall.wallType}</Badge>
                <RackFormDialog wallId={wall.id} />
              </div>

              {wall.racks.length === 0 ? (
                <div className="p-8 border border-dashed rounded-lg text-center text-muted-foreground">
                  No racks in this wall.
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {wall.racks.map((rack) => (
                    <Card key={rack.id}>
                      <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-lg">Rack: {rack.name} ({rack.code})</CardTitle>
                        <ShelfFormDialog rackId={rack.id} />
                      </CardHeader>
                      <CardContent>
                        {rack.shelves.length === 0 ? (
                          <div className="text-sm text-muted-foreground py-2">No shelves added.</div>
                        ) : (
                          <div className="space-y-4">
                            {rack.shelves.map((shelf) => (
                              <div key={shelf.id} className="border-t pt-3">
                                <div className="flex items-center justify-between mb-2">
                                  <h4 className="text-sm font-medium flex items-center gap-1">
                                    <Layers className="h-3 w-3" /> Shelf {shelf.level}
                                    {shelf.label && <span className="text-muted-foreground font-normal ml-1">({shelf.label})</span>}
                                  </h4>
                                  <BinFormDialog shelfId={shelf.id} />
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {shelf.bins.length === 0 ? (
                                    <span className="text-xs text-muted-foreground">No bins.</span>
                                  ) : (
                                    shelf.bins.map((bin) => {
                                      const stockCount = bin.stock.length
                                      return (
                                        <Badge 
                                          key={bin.id} 
                                          variant="secondary" 
                                          className="flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-secondary/80"
                                          title={bin.fullAddress}
                                        >
                                          <MapPin className="h-3 w-3" />
                                          {bin.binCode}
                                          {stockCount > 0 && (
                                            <span className="ml-1 bg-primary text-primary-foreground rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
                                              {stockCount}
                                            </span>
                                          )}
                                        </Badge>
                                      )
                                    })
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
