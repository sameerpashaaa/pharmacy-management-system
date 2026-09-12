'use client'

// ─────────────────────────────────────────────────────────────
// Component — CategoryForm
// Create / edit a product category
// ─────────────────────────────────────────────────────────────
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import slugify from 'slugify'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/lib/hooks/use-toast'
import { createCategorySchema } from '@/lib/validations/product'

type CategoryOption = { id: string; name: string; slug: string; parentId: string | null }

type CategoryFormValues = z.infer<typeof createCategorySchema>

interface CategoryFormProps {
  initialData?: {
    id: string
    name: string
    slug: string
    description?: string | null
    parentId?: string | null
    sortOrder: number
    isActive: boolean
  }
  categories?: CategoryOption[]
  onSuccess?: () => void
}

export function CategoryForm({ initialData, categories = [], onSuccess }: CategoryFormProps) {
  const toast = useToast()
  const isEditing = Boolean(initialData?.id)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(createCategorySchema),
    defaultValues: {
      name: initialData?.name ?? '',
      slug: initialData?.slug ?? '',
      description: initialData?.description ?? '',
      parentId: initialData?.parentId ?? undefined,
      sortOrder: initialData?.sortOrder ?? 0,
      isActive: initialData?.isActive ?? true,
    },
  })

  const nameValue = watch('name')
  const isEditingSlug = isEditing

  // Auto-generate slug from name on create
  useEffect(() => {
    if (!isEditing) {
      const slug = slugify(nameValue, { lower: true, strict: true })
      setValue('slug', slug, { shouldValidate: nameValue.length > 0 })
    }
  }, [nameValue, isEditing, setValue])

  const parentOptions = useMemo(
    () => categories.filter((c) => c.id !== initialData?.id),
    [categories, initialData?.id]
  )

  async function onSubmit(data: CategoryFormValues) {
    const url = isEditing ? `/api/categories/${initialData!.id}` : '/api/categories'
    const method = isEditing ? 'PUT' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (res.ok) {
      toast.success(isEditing ? 'Category updated successfully' : 'Category created successfully')
      onSuccess?.()
    } else {
      const json = (await res.json()) as { error?: { message?: string; code?: string } }
      toast.error(json.error?.message ?? 'Something went wrong')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Name */}
      <div className="space-y-1">
        <Label htmlFor="category-name">Category Name *</Label>
        <Input id="category-name" {...register('name')} placeholder="e.g. Antibiotics" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {/* Slug */}
      <div className="space-y-1">
        <Label htmlFor="category-slug">Slug *</Label>
        <Input
          id="category-slug"
          {...register('slug')}
          placeholder="antibiotics"
          disabled={isEditingSlug && Boolean(initialData?.id)}
          readOnly={!isEditing}
        />
        {errors.slug && <p className="text-xs text-destructive">{errors.slug.message}</p>}
      </div>

      {/* Description */}
      <div className="space-y-1">
        <Label htmlFor="category-description">Description</Label>
        <Input
          id="category-description"
          {...register('description')}
          placeholder="Short description (optional)"
        />
        {errors.description && (
          <p className="text-xs text-destructive">{errors.description.message}</p>
        )}
      </div>

      {/* Parent */}
      <div className="space-y-1">
        <Label>Parent Category</Label>
        <Select
          value={watch('parentId') ?? 'none'}
          onValueChange={(v) =>
            setValue('parentId', v === 'none' ? undefined : v, { shouldValidate: true })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="— No parent (top level) —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">— None (top level) —</SelectItem>
            {parentOptions.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Sort order */}
      <div className="space-y-1">
        <Label htmlFor="category-sort">Sort Order</Label>
        <Input
          id="category-sort"
          type="number"
          min={0}
          {...register('sortOrder', { valueAsNumber: true })}
        />
        {errors.sortOrder && <p className="text-xs text-destructive">{errors.sortOrder.message}</p>}
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="category-active"
          checked={watch('isActive')}
          onCheckedChange={(checked) =>
            setValue('isActive', checked === true, { shouldValidate: true })
          }
        />
        <Label htmlFor="category-active" className="font-normal">
          Active category
        </Label>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create Category'}
        </Button>
      </div>
    </form>
  )
}
