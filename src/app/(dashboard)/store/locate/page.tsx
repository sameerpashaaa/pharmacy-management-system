import { ProductLocator } from '@/components/store/product-locator'

export const metadata = {
  title: 'Locate Product | Store Management',
}

export default function LocateProductPage() {
  return (
    <div className="flex-1 space-y-4 p-4 md:p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight">Locate Product</h2>
      </div>
      
      <p className="text-muted-foreground">
        Find the exact physical location of any product or batch in the store.
      </p>

      <ProductLocator />
    </div>
  )
}
