'use client'

// ─────────────────────────────────────────────────────────────
// Shared Component — EmptyState
// ─────────────────────────────────────────────────────────────
import { FileX2 } from 'lucide-react'

import { cn } from '@/lib/utils/cn'

interface EmptyStateProps {
  icon?: React.ElementType
  title?: string
  description?: string
  action?: React.ReactNode
  className?: string
}

export function EmptyState({
  icon: Icon = FileX2,
  title = 'No results found',
  description = 'There is nothing here yet.',
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-12 text-center',
        className
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" data-testid="empty-state-icon" />
      </div>
      <div>
        <p className="text-sm font-medium">{title}</p>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}
