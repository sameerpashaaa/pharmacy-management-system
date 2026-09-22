/* eslint-disable */
'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

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
import { useToast } from '@/lib/hooks/use-toast'
import { rackShelfSchema, type RackShelfInput } from '@/lib/validations/store'

export function ShelfFormDialog({ rackId }: { rackId: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RackShelfInput>({
    resolver: zodResolver(rackShelfSchema),
    defaultValues: {
      rackId,
      level: 1,
      label: '',
      description: '',
      maxBins: 10,
      isActive: true,
    },
  })

  async function onSubmit(data: RackShelfInput) {
    try {
      const res = await fetch('/api/store/shelves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message || 'Failed to create shelf')
      }

      toast.success('Shelf created successfully')
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
        <Button variant="ghost" size="sm">
          <Plus className="h-4 w-4 mr-1" /> Shelf
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Shelf</DialogTitle>
          <DialogDescription>Create a new shelf inside this rack.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="level">Level Number</Label>
            <Input id="level" type="number" {...register('level')} />
            {errors.level && <p className="text-sm text-destructive">{errors.level.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="label">Label (Optional)</Label>
            <Input id="label" placeholder="e.g. Top Shelf" {...register('label')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maxBins">Max Bins</Label>
            <Input id="maxBins" type="number" {...register('maxBins')} />
          </div>

          <div className="flex justify-end pt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Shelf
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
