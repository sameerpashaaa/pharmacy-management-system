'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm, Controller } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ROUTES } from '@/lib/constants/routes'
import { useToast } from '@/lib/hooks/use-toast'
import { customerSchema, type CustomerFormValues } from '@/lib/validations/customer'

interface CustomerFormProps {
  initialData?: Partial<CustomerFormValues> & { id?: string }
}

export function CustomerForm({ initialData }: CustomerFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState(false)

  const isEdit = !!initialData?.id

  const form = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: {
      name: initialData?.name || '',
      phone: initialData?.phone || '',
      email: initialData?.email || '',
      gstin: initialData?.gstin || '',
      address: initialData?.address || '',
      city: initialData?.city || '',
      state: initialData?.state || '',
      pincode: initialData?.pincode || '',
      creditLimit: initialData?.creditLimit || 0,
      creditDays: initialData?.creditDays || 0,
      isActive: initialData?.isActive ?? true,
      notes: initialData?.notes || '',
    },
  })

  const {
    register,
    handleSubmit,
    formState: { errors },
    control,
  } = form

  async function onSubmit(data: CustomerFormValues) {
    setLoading(true)
    try {
      const url = isEdit ? `/api/customers/${initialData.id}` : '/api/customers'
      const method = isEdit ? 'PUT' : 'POST'

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      const json = await res.json()
      if (json.success) {
        toast.success(isEdit ? 'Customer updated' : 'Customer created')
        router.push(ROUTES.CUSTOMERS)
        router.refresh()
      } else {
        toast.error(String(json.error ?? 'Failed to save customer'))
      }
    } catch {
      toast.error('An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" placeholder="Enter customer name" {...register('name')} />
          {errors.name && (
            <p className="text-sm font-medium text-destructive text-red-500">
              {errors.name.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Phone</Label>
          <Input id="phone" placeholder="Phone number" {...register('phone')} />
          {errors.phone && (
            <p className="text-sm font-medium text-destructive text-red-500">
              {errors.phone.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" placeholder="Email address" {...register('email')} />
          {errors.email && (
            <p className="text-sm font-medium text-destructive text-red-500">
              {errors.email.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="gstin">GSTIN</Label>
          <Input id="gstin" placeholder="GST Number" {...register('gstin')} />
          {errors.gstin && (
            <p className="text-sm font-medium text-destructive text-red-500">
              {errors.gstin.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="address">Address</Label>
          <Input id="address" placeholder="Street address" {...register('address')} />
          {errors.address && (
            <p className="text-sm font-medium text-destructive text-red-500">
              {errors.address.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input id="city" placeholder="City" {...register('city')} />
          {errors.city && (
            <p className="text-sm font-medium text-destructive text-red-500">
              {errors.city.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input id="state" placeholder="State" {...register('state')} />
          {errors.state && (
            <p className="text-sm font-medium text-destructive text-red-500">
              {errors.state.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="pincode">Pincode</Label>
          <Input id="pincode" placeholder="PIN code" {...register('pincode')} />
          {errors.pincode && (
            <p className="text-sm font-medium text-destructive text-red-500">
              {errors.pincode.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="creditLimit">Credit Limit</Label>
          <Input
            id="creditLimit"
            type="number"
            min={0}
            step="0.01"
            {...register('creditLimit', { valueAsNumber: true })}
          />
          {errors.creditLimit && (
            <p className="text-sm font-medium text-destructive text-red-500">
              {errors.creditLimit.message}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="creditDays">Credit Days</Label>
          <Input
            id="creditDays"
            type="number"
            min={0}
            {...register('creditDays', { valueAsNumber: true })}
          />
          {errors.creditDays && (
            <p className="text-sm font-medium text-destructive text-red-500">
              {errors.creditDays.message}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea id="notes" placeholder="Additional notes..." {...register('notes')} />
        {errors.notes && (
          <p className="text-sm font-medium text-destructive text-red-500">
            {errors.notes.message}
          </p>
        )}
      </div>

      <div className="flex flex-row items-center justify-between rounded-lg border p-4">
        <div className="space-y-0.5">
          <Label className="text-base">Active Status</Label>
          <div className="text-sm text-muted-foreground">
            Inactive customers cannot be billed for new sales.
          </div>
        </div>
        <Controller
          control={control}
          name="isActive"
          render={({ field }) => (
            <input
              type="checkbox"
              className="h-5 w-5 rounded-md border-gray-300"
              checked={field.value}
              onChange={(e) => field.onChange(e.target.checked)}
            />
          )}
        />
      </div>

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={() => router.back()} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? 'Saving...' : 'Save Customer'}
        </Button>
      </div>
    </form>
  )
}
