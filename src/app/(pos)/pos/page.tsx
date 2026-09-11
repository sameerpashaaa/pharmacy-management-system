import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'POS — Billing' }

export default function PosPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <div className="mb-4 text-6xl">🛒</div>
        <h1 className="mb-2 text-2xl font-bold">Point of Sale</h1>
        <p className="text-muted-foreground">Full POS interface coming in Phase 3</p>
      </div>
    </div>
  )
}
