'use client'

// ─────────────────────────────────────────────────────────────
// Component — CategoryTree
// Recursive display of the category hierarchy
// ─────────────────────────────────────────────────────────────
import { ChevronRight, FileText } from 'lucide-react'
import { useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils/cn'

export interface CategoryNode {
  id: string
  name: string
  slug: string
  description?: string | null
  parentId?: string | null
  isActive: boolean
  sortOrder: number
  productCount: number
  children: CategoryNode[]
}

interface CategoryTreeProps {
  nodes: CategoryNode[]
  depth?: number
  onEdit?: (node: CategoryNode) => void
}

function CategoryTreeItem({
  node,
  depth,
  onEdit,
}: {
  node: CategoryNode
  depth: number
  onEdit?: (node: CategoryNode) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children.length > 0

  return (
    <div>
      <button
        type="button"
        onClick={() => (hasChildren ? setExpanded((e) => !e) : onEdit?.(node))}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {hasChildren ? (
          <ChevronRight
            className={cn(
              'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-90'
            )}
          />
        ) : (
          <FileText className="h-4 w-4 shrink-0 text-muted-foreground/60" />
        )}
        <span className="truncate text-sm font-medium">{node.name}</span>
        <Badge variant="secondary" className="ml-auto shrink-0 text-xs">
          {node.productCount}
        </Badge>
      </button>
      {expanded && hasChildren && (
        <div>
          {node.children.map((child) => (
            <CategoryTreeItem key={child.id} node={child} depth={depth + 1} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  )
}

export function CategoryTree({ nodes, depth = 0, onEdit }: CategoryTreeProps) {
  if (nodes.length === 0) return null
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <CategoryTreeItem key={node.id} node={node} depth={depth} onEdit={onEdit} />
      ))}
    </div>
  )
}
