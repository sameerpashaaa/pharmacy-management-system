import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'New Sales Return' }

export default function NewSalesReturnPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">New Sales Return</h1>
        <p className="text-muted-foreground">Initiate a new customer return</p>
      </div>
      <div className="flex h-64 items-center justify-center rounded-lg border-2 border-dashed border-muted">
        <p className="text-muted-foreground">Coming in Phase 5</p>
      </div>
    </div>
  )
}
