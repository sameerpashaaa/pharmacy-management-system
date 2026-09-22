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
import { storeBinSchema, type StoreBinInput } from '@/lib/validations/store'

export function BinFormDialog({ shelfId }: { shelfId: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<StoreBinInput>({
    resolver: zodResolver(storeBinSchema),
    defaultValues: {
      shelfId,
      binCode: '',
      capacity: null,
      notes: '',
      isActive: true,
    },
  })

  async function onSubmit(data: StoreBinInput) {
    try {
      const res = await fetch('/api/store/bins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message || 'Failed to create bin')
      }

      toast.success('Bin created successfully')
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
        <Button variant="ghost" size="sm" className="h-6 text-xs px-2">
          + Bin
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Bin</DialogTitle>
          <DialogDescription>Create a new bin on this shelf.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="binCode">Bin Code (e.g. A, B, 01)</Label>
            <Input id="binCode" placeholder="A" {...register('binCode')} />
            {errors.binCode && <p className="text-sm text-destructive">{errors.binCode.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity (Optional)</Label>
            <Input id="capacity" type="number" placeholder="Max items" {...register('capacity')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Input id="notes" placeholder="e.g. Fast-moving items only" {...register('notes')} />
          </div>

          <div className="flex justify-end pt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Bin
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
