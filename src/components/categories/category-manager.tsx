'use client'

// ─────────────────────────────────────────────────────────────
// Component — CategoryManager
// Client container for the categories page — manages state,
// tree fetching, form dialog, and deletion.
// ─────────────────────────────────────────────────────────────
import { Pencil, Plus, Trash2, ListTree, List } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useToast } from '@/lib/hooks/use-toast'
import { useUiStore } from '@/lib/stores/ui-store'

import { CategoryForm } from './category-form'
import { CategoryTree, type CategoryNode } from './category-tree'

type CategoryOption = {
  id: string
  name: string
  slug: string
  parentId: string | null
  productCount: number
}

// ─── Flat helpers ─────────────────────────────────────────────

function flattenTree(nodes: CategoryNode[]): CategoryOption[] {
  const out: CategoryOption[] = []
  function walk(list: CategoryNode[]) {
    for (const n of list) {
      out.push({
        id: n.id,
        name: n.name,
        slug: n.slug,
        parentId: n.parentId ?? null,
        productCount: n.productCount,
      })
      if (n.children.length) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

// ─── Component ───────────────────────────────────────────────

export function CategoryManager() {
  const toast = useToast()
  const { openConfirmDialog } = useUiStore()
  const [tree, setTree] = useState<CategoryNode[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<CategoryNode | undefined>(undefined)
  const [showFlat, setShowFlat] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/categories?tree=true')
      const json = (await res.json()) as { success: boolean; data?: CategoryNode[] }
      if (json.success && json.data) setTree(json.data)
    } catch {
      toast.error('Failed to load categories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  function openAdd() {
    setEditing(undefined)
    setFormOpen(true)
  }
  function openEdit(node: CategoryNode) {
    setEditing(node)
    setFormOpen(true)
  }

  function handleDelete(node: CategoryNode) {
    openConfirmDialog({
      title: 'Delete Category',
      description: `This will deactivate "${node.name}". This action cannot be undone.`,
      variant: 'destructive',
      onConfirm: async () => {
        const res = await fetch(`/api/categories/${node.id}`, { method: 'DELETE' })
        if (res.ok) {
          toast.success('Category deactivated successfully')
          void refresh()
        } else {
          const json = (await res.json()) as { error?: { message?: string } }
          toast.error(json.error?.message ?? 'Failed to delete category')
        }
      },
    })
  }

  const allOptions = flattenTree(tree)

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button
            variant={showFlat ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setShowFlat(false)}
          >
            <ListTree className="mr-1.5 h-4 w-4" /> Tree
          </Button>
          <Button
            variant={showFlat ? 'ghost' : 'secondary'}
            size="sm"
            onClick={() => setShowFlat(true)}
          >
            <List className="mr-1.5 h-4 w-4" /> Flat
          </Button>
        </div>
        <Button size="sm" onClick={openAdd}>
          <Plus className="mr-1.5 h-4 w-4" /> Add Category
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <p className="text-sm text-muted-foreground">Loading categories…</p>
        </div>
      ) : tree.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border-2 border-dashed border-muted">
          <p className="text-muted-foreground">No categories yet. Add your first category.</p>
        </div>
      ) : showFlat ? (
        <FlatTable categories={tree} onEdit={openEdit} onDelete={handleDelete} />
      ) : (
        <div className="rounded-lg border p-3">
          <CategoryTree nodes={tree} onEdit={(node) => openEdit(node)} />
        </div>
      )}

      {/* Form dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Edit Category' : 'Add New Category'}</DialogTitle>
          </DialogHeader>
          <CategoryForm
            initialData={editing}
            categories={allOptions}
            onSuccess={() => {
              setFormOpen(false)
              void refresh()
            }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Flat table sub-component ─────────────────────────────────

function FlatTable({
  categories,
  onEdit,
  onDelete,
}: {
  categories: CategoryNode[]
  onEdit: (node: CategoryNode) => void
  onDelete: (node: CategoryNode) => void
}) {
  const flat = flattenTree(categories)
  return (
    <div className="rounded-md border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Parent</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Products</th>
            <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
          </tr>
        </thead>
        <tbody>
          {flat.map((cat) => (
            <tr key={cat.id} className="border-t hover:bg-muted/30">
              <td className="px-4 py-2.5 font-medium">{cat.name}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{cat.slug}</td>
              <td className="px-4 py-2.5">{cat.parentId ?? '—'}</td>
              <td className="px-4 py-2.5">{cat.productCount}</td>
              <td className="px-4 py-2.5">
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onEdit(categoryById(categories, cat.id))}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onDelete(categoryById(categories, cat.id))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function categoryById(nodes: CategoryNode[], id: string): CategoryNode {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = categoryById(n.children, id)
    if (found) return found
  }
  throw new Error('Category not found')
}
