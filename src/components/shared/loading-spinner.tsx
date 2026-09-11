'use client'

// ─────────────────────────────────────────────────────────────
// Shared Component — LoadingSpinner
// ─────────────────────────────────────────────────────────────
import { cn } from '@/lib/utils/cn'

type Size = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'h-4 w-4 border-2',
  md: 'h-8 w-8 border-2',
  lg: 'h-12 w-12 border-4',
}

interface LoadingSpinnerProps {
  size?: Size
  className?: string
  label?: string
}

export function LoadingSpinner({ size = 'md', className, label }: LoadingSpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2', className)}>
      <div
        className={cn(
          'animate-spin rounded-full border-primary border-t-transparent',
          SIZE_CLASSES[size]
        )}
        role="status"
        aria-label={label ?? 'Loading…'}
      />
      {label && <p className="text-sm text-muted-foreground">{label}</p>}
    </div>
  )
}

/** Full-page centered loading overlay */
export function PageLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex h-full min-h-[300px] w-full items-center justify-center">
      <LoadingSpinner size="lg" label={label} />
    </div>
  )
}
