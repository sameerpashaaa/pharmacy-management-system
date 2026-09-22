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
import { rackSchema, type RackInput } from '@/lib/validations/store'

export function RackFormDialog({ wallId }: { wallId: string }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RackInput>({
    resolver: zodResolver(rackSchema),
    defaultValues: {
      wallId,
      code: '',
      name: '',
      description: '',
      capacity: null,
      sortOrder: 0,
      isActive: true,
    },
  })

  async function onSubmit(data: RackInput) {
    try {
      const res = await fetch('/api/store/racks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error?.message || 'Failed to create rack')
      }

      toast.success('Rack created successfully')
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
        <Button variant="outline" size="sm" className="ml-auto">
          <Plus className="mr-2 h-3 w-3" /> Add Rack
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Rack</DialogTitle>
          <DialogDescription>Create a new rack within this wall.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Rack Code (e.g. 01)</Label>
            <Input id="code" placeholder="01" {...register('code')} />
            {errors.code && <p className="text-sm text-destructive">{errors.code.message}</p>}
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Name (Optional)</Label>
            <Input id="name" placeholder="Top Rack" {...register('name')} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="capacity">Capacity (Optional)</Label>
            <Input id="capacity" type="number" placeholder="Number of items" {...register('capacity')} />
          </div>

          <div className="flex justify-end pt-4 gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Rack
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
