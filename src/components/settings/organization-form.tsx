'use client'

// ─────────────────────────────────────────────────────────────
// Component — OrganizationForm
// RHF + zodResolver for the organization profile fields exposed
// by /api/organization. Settings map is a flat key/value list
// (invoice prefix, default tax rate, etc).
// ─────────────────────────────────────────────────────────────
import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'

const schema = z.object({
  name: z.string().min(2, 'Name is required'),
  legalName: z.string().optional().or(z.literal('')),
  gstin: z.string().optional().or(z.literal('')),
  pan: z.string().optional().or(z.literal('')),
  dlNumber: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional().or(z.literal('')),
  website: z.string().optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  pincode: z.string().optional().or(z.literal('')),
  country: z.string().optional().or(z.literal('')),
  currency: z.string().optional().or(z.literal('')),
  timezone: z.string().optional().or(z.literal('')),
  financialYearStart: z.preprocess(
    (v) => (v === '' || v == null ? undefined : Number(v)),
    z.number().int().min(1).max(12).optional()
  ),
})

type FormValues = z.infer<typeof schema>

interface OrganizationFormProps {
  initial: Partial<FormValues>
}

export function OrganizationForm({ initial }: OrganizationFormProps) {
  const toast = useToast()

  const form = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      name: initial.name ?? '',
      legalName: initial.legalName ?? '',
      gstin: initial.gstin ?? '',
      pan: initial.pan ?? '',
      dlNumber: initial.dlNumber ?? '',
      email: initial.email ?? '',
      phone: initial.phone ?? '',
      website: initial.website ?? '',
      address: initial.address ?? '',
      city: initial.city ?? '',
      state: initial.state ?? '',
      pincode: initial.pincode ?? '',
      country: initial.country ?? '',
      currency: initial.currency ?? '',
      timezone: initial.timezone ?? '',
      financialYearStart: initial.financialYearStart,
    },
  })

  useEffect(() => {
    form.reset(initial)
  }, [initial, form])

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
  } = form

  async function onSubmit(values: FormValues) {
    // Strip empty-string optionals so they don't fail validation server-side
    const payload: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(values)) {
      if (v === '' || v === undefined) continue
      payload[k] = v
    }
    try {
      const res = await fetch('/api/organization', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = (await res.json().catch(() => null)) as {
        success: boolean
        error?: { message?: string }
      } | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error?.message ?? 'Failed to save organization')
        return
      }
      toast.success('Organization updated')
      form.reset(values)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Identity</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">Organization Name *</Label>
              <Input id="name" {...register('name')} />
              {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="legalName">Legal Name</Label>
              <Input id="legalName" {...register('legalName')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input id="gstin" {...register('gstin')} maxLength={15} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pan">PAN</Label>
              <Input id="pan" {...register('pan')} maxLength={10} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dlNumber">Drug Licence Number</Label>
              <Input id="dlNumber" {...register('dlNumber')} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Contact</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" {...register('phone')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input id="website" {...register('website')} placeholder="https://" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Address</h3>
          <div className="space-y-1.5">
            <Label htmlFor="address">Street</Label>
            <Input id="address" {...register('address')} />
          </div>
          <div className="grid gap-4 md:grid-cols-4">
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
              <Input id="pincode" {...register('pincode')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="country">Country</Label>
              <Input id="country" {...register('country')} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <h3 className="text-sm font-semibold uppercase text-muted-foreground">Locale</h3>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="currency">Currency</Label>
              <Input id="currency" {...register('currency')} maxLength={6} placeholder="INR" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="timezone">Timezone</Label>
              <Input id="timezone" {...register('timezone')} placeholder="Asia/Kolkata" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="financialYearStart">Financial Year Start Month</Label>
              <Input
                id="financialYearStart"
                type="number"
                min="1"
                max="12"
                {...register('financialYearStart', { valueAsNumber: true })}
              />
              {errors.financialYearStart && (
                <p className="text-xs text-destructive">{errors.financialYearStart.message}</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end border-t pt-4">
        <Button type="submit" disabled={isSubmitting || !isDirty}>
          {isSubmitting ? 'Saving…' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}
