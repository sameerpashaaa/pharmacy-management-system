'use client'

// ─────────────────────────────────────────────────────────────
// Component — CustomerForm
// Shared form for create + edit. Uses RHF + zodResolver with the
// create/update zod schemas. Decimal creditLimit + integer creditDays
// coerced from string inputs for clean UX.
// ─────────────────────────────────────────────────────────────
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/hooks/use-toast'
import {
  createCustomerSchema,
  updateCustomerSchema,
  type CreateCustomerInput,
} from '@/lib/validations/customer'

interface CustomerFormProps {
  mode: 'create' | 'edit'
  initial?: Partial<CreateCustomerInput> & { id?: string }
  onSavedRedirect?: string
}

export function CustomerForm({ mode, initial, onSavedRedirect }: CustomerFormProps) {
  const router = useRouter()
  const toast = useToast()

  const schema = useMemo(
    () => (mode === 'create' ? createCustomerSchema : updateCustomerSchema),
    [mode]
  )

  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(schema) as never,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      name: initial?.name ?? '',
      phone: initial?.phone ?? undefined,
      email: initial?.email ?? undefined,
      gstin: initial?.gstin ?? undefined,
      address: initial?.address ?? undefined,
      city: initial?.city ?? undefined,
      state: initial?.state ?? undefined,
      pincode: initial?.pincode ?? undefined,
      creditLimit: initial?.creditLimit ?? 0,
      creditDays: initial?.creditDays ?? 0,
      notes: initial?.notes ?? undefined,
      isActive: initial?.isActive ?? true,
    },
  })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = form

  const isActive = watch('isActive')

  useEffect(() => {
    register('isActive')
  }, [register])

  async function onSubmit(values: CreateCustomerInput) {
    try {
      const url = mode === 'create' ? '/api/customers' : `/api/customers/${initial?.id}`
      const method = mode === 'create' ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      const json = (await res.json().catch(() => null)) as {
        success: boolean
        data?: { id: string }
        error?: { message?: string; issues?: Record<string, string[]> }
      } | null
      if (!res.ok || !json?.success) {
        const message = json?.error?.message ?? 'Save failed'
        if (json?.error?.issues) {
          for (const [path, msgs] of Object.entries(json.error.issues)) {
            if (msgs && msgs[0]) setError(path as never, { message: msgs[0] })
          }
        }
        toast.error(message)
        return
      }
      toast.success(mode === 'create' ? 'Customer created' : 'Customer updated')
      router.push(onSavedRedirect ?? (mode === 'edit' ? `/customers/${initial?.id}` : '/customers'))
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <Card>
      <CardContent className="p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-medium uppercase text-muted-foreground">Identity</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" {...register('name')} />
                {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gstin">GSTIN</Label>
                <Input id="gstin" {...register('gstin')} maxLength={20} />
                {errors.gstin && <p className="text-xs text-destructive">{errors.gstin.message}</p>}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium uppercase text-muted-foreground">Contact</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" {...register('phone')} maxLength={20} />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium uppercase text-muted-foreground">Address</h3>
            <div className="space-y-1.5">
              <Label htmlFor="address">Street</Label>
              <Input id="address" {...register('address')} maxLength={200} />
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="city">City</Label>
                <Input id="city" {...register('city')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state">State</Label>
                <Input id="state" {...register('state')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pincode">Pincode</Label>
                <Input id="pincode" {...register('pincode')} maxLength={10} />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium uppercase text-muted-foreground">Credit Terms</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="creditLimit">Credit Limit (₹)</Label>
                <Input
                  id="creditLimit"
                  type="number"
                  min="0"
                  step="0.01"
                  {...register('creditLimit', { valueAsNumber: true })}
                />
                {errors.creditLimit && (
                  <p className="text-xs text-destructive">{errors.creditLimit.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="creditDays">Credit Days</Label>
                <Input
                  id="creditDays"
                  type="number"
                  min="0"
                  max="365"
                  {...register('creditDays', { valueAsNumber: true })}
                />
                {errors.creditDays && (
                  <p className="text-xs text-destructive">{errors.creditDays.message}</p>
                )}
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-medium uppercase text-muted-foreground">Other</h3>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea id="notes" rows={3} {...register('notes')} maxLength={500} />
              {errors.notes && <p className="text-xs text-destructive">{errors.notes.message}</p>}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="isActive"
                checked={!!isActive}
                onCheckedChange={(c) => setValue('isActive', c === true, { shouldDirty: true })}
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
          </section>

          <div className="flex items-center justify-between border-t pt-4">
            <Button asChild variant="ghost" type="button">
              <Link href="/customers">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create Customer' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
