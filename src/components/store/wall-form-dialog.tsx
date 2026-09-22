/* eslint-disable */
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import type { z } from 'zod'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { wallSchema } from '@/lib/validations/store'

type WallInput = z.infer<typeof wallSchema>

export function WallFormDialog({ branchId }: { branchId: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<WallInput>({
    resolver: zodResolver(wallSchema),
    defaultValues: {
      branchId,
      code: '',
      name: '',
      description: '',
      wallType: 'OPEN',
      sortOrder: 0,
      isActive: true,
    },
  })

  async function onSubmit(data: WallInput) {
    try {
      const res = await fetch('/api/store/walls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message || 'Failed to create wall')
      }

      toast.success('Wall created successfully')
      setOpen(false)
      reset()
      router.refresh()
    } catch (error: any) {
      toast.error(error.message || 'An error occurred')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" /> Add Wall
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Wall</DialogTitle>
          <DialogDescription>Create a new wall location in your store.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Wall Code</Label>
            <Input id="code" placeholder="e.g. A" {...register('code')} />
            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Wall Name</Label>
            <Input id="name" placeholder="e.g. Front Wall" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="wallType">Wall Type</Label>
            <Select
              value={watch('wallType')}
              onValueChange={(val: any) => setValue('wallType', val)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select type..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OPEN">Open Shelf</SelectItem>
                <SelectItem value="REFRIGERATED">Refrigerated</SelectItem>
                <SelectItem value="COLD_CHAIN">Cold Chain (Strict)</SelectItem>
                <SelectItem value="CONTROLLED_ACCESS">Controlled Access (Narcotics)</SelectItem>
              </SelectContent>
            </Select>
            {errors.wallType && <p className="text-sm text-destructive">{errors.wallType.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Input id="description" placeholder="Additional details..." {...register('description')} />
          </div>

          <div className="flex justify-end pt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Wall
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
