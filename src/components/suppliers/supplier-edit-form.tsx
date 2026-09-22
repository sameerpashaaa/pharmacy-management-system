'use client'

// ─────────────────────────────────────────────────────────────
// Component — SupplierEditForm
// Edit an existing supplier using the existing /api/suppliers/{id}
// PATCH endpoint and the existing updateSupplierSchema validation.
// ─────────────────────────────────────────────────────────────
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'
import { updateSupplierSchema, type UpdateSupplierInput } from '@/lib/validations/purchase'

export interface SupplierEditInitial {
  id: string
  name: string
  contactPerson: string
  phone: string
  email: string
  gstin: string
  pan: string
  dlNumber: string
  address: string
  city: string
  state: string
  pincode: string
  bankName: string
  bankAccount: string
  bankIfsc: string
  creditDays: number
  notes: string
  isActive: boolean
}

interface SupplierEditFormProps {
  initial: SupplierEditInitial
}

const FIELD_LABELS: Record<string, string> = {
  name: 'Supplier name',
  contactPerson: 'Contact person',
  phone: 'Phone',
  email: 'Email',
  gstin: 'GSTIN',
  pan: 'PAN',
  dlNumber: 'Drug license',
  address: 'Address',
  city: 'City',
  state: 'State',
  pincode: 'Pincode',
  bankName: 'Bank name',
  bankAccount: 'Bank account',
  bankIfsc: 'IFSC',
  creditDays: 'Credit days',
  notes: 'Notes',
}

const numeric = {
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'e' || e.key === 'E') e.preventDefault()
  },
}

export function SupplierEditForm({ initial }: SupplierEditFormProps) {
  const router = useRouter()
  const toast = useToast()

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isSubmitted, isSubmitSuccessful },
  } = useForm<UpdateSupplierInput>({
    resolver: zodResolver(updateSupplierSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      name: initial.name,
      contactPerson: initial.contactPerson || undefined,
      phone: initial.phone || undefined,
      email: initial.email || undefined,
      gstin: initial.gstin || undefined,
      pan: initial.pan || undefined,
      dlNumber: initial.dlNumber || undefined,
      address: initial.address || undefined,
      city: initial.city || undefined,
      state: initial.state || undefined,
      pincode: initial.pincode || undefined,
      bankName: initial.bankName || undefined,
      bankAccount: initial.bankAccount || undefined,
      bankIfsc: initial.bankIfsc || undefined,
      creditDays: initial.creditDays ?? 30,
      notes: initial.notes || undefined,
    },
  })

  async function onSubmit(values: UpdateSupplierInput) {
    // Drop empty strings so the partial schema skips them instead of
    // overwriting stored data with blanks.
    const payload: Record<string, unknown> = { ...values }
    for (const [key, val] of Object.entries(payload)) {
      if (typeof val === 'string' && val.trim() === '') delete payload[key]
    }
    payload.isActive = initial.isActive

    const res = await fetch(`/api/suppliers/${initial.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    if (res.ok) {
      toast.success('Supplier updated successfully')
      router.refresh()
    } else {
      const json = (await res.json().catch(() => null)) as {
        error?: { message?: string }
      } | null
      toast.error(json?.error?.message ?? 'Failed to update supplier')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {isSubmitted && Object.keys(errors).length > 0 && (
        <div
          role="alert"
          aria-live="assertive"
          className="rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          <p className="font-medium">
            Could not save supplier — please fix the highlighted fields below.
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {Object.entries(errors)
              .filter(([key]) => key !== 'root')
              .slice(0, 5)
              .map(([key, err]) => {
                const msg = (err as { message?: string })?.message ?? 'Invalid value'
                const label = FIELD_LABELS[key] ?? key
                return (
                  <li key={key}>
                    <span className="font-medium">{label}:</span> {msg}
                  </li>
                )
              })}
          </ul>
        </div>
      )}
      {isSubmitSuccessful && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800"
        >
          Supplier updated successfully.
        </div>
      )}

      {/* ── Identity ─────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Identity
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="supplier-name">Supplier name *</Label>
            <Input id="supplier-name" {...register('name')} />
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-contact">Contact person</Label>
            <Input id="supplier-contact" {...register('contactPerson')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-phone">Phone</Label>
            <Input id="supplier-phone" {...register('phone')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-email">Email</Label>
            <Input id="supplier-email" type="email" {...register('email')} />
            {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
          </div>
        </div>
      </section>

      {/* ── Tax & license ────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tax &amp; License
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="supplier-gstin">GSTIN</Label>
            <Input id="supplier-gstin" className="font-mono" {...register('gstin')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-pan">PAN</Label>
            <Input id="supplier-pan" className="font-mono" {...register('pan')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-dl">Drug License (DL)</Label>
            <Input id="supplier-dl" className="font-mono" {...register('dlNumber')} />
          </div>
        </div>
      </section>

      {/* ── Address ──────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Address
        </h3>
        <div className="space-y-1">
          <Label htmlFor="supplier-address">Street address</Label>
          <Input id="supplier-address" {...register('address')} />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="supplier-city">City</Label>
            <Input id="supplier-city" {...register('city')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-state">State</Label>
            <Input id="supplier-state" {...register('state')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-pincode">Pincode</Label>
            <Input id="supplier-pincode" className="font-mono" {...register('pincode')} />
          </div>
        </div>
      </section>

      {/* ── Banking ──────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Banking
        </h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="supplier-bank-name">Bank name</Label>
            <Input id="supplier-bank-name" {...register('bankName')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-bank-account">Account number</Label>
            <Input
              id="supplier-bank-account"
              className="font-mono"
              {...register('bankAccount')}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="supplier-bank-ifsc">IFSC</Label>
            <Input id="supplier-bank-ifsc" className="font-mono" {...register('bankIfsc')} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="supplier-credit-days">Credit days</Label>
            <Input
              id="supplier-credit-days"
              type="number"
              min={0}
              max={365}
              {...register('creditDays', { valueAsNumber: true })}
              {...numeric}
            />
            {errors.creditDays && (
              <p className="text-xs text-destructive">{errors.creditDays.message}</p>
            )}
          </div>
        </div>
      </section>

      {/* ── Notes ────────────────────────────────── */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Notes
        </h3>
        <div className="space-y-1">
          <Label htmlFor="supplier-notes">Internal notes</Label>
          <Input id="supplier-notes" {...register('notes')} />
        </div>
      </section>

      {/* ── Status ───────────────────────────────── */}
      <section className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Checkbox
            id="supplier-active"
            checked={initial.isActive}
            disabled
            onCheckedChange={() => {
              /* isActive not exposed in the PATCH schema; show current value only */
            }}
          />
          <Label htmlFor="supplier-active" className="font-normal">
            {initial.isActive ? 'Active supplier' : 'Inactive supplier'}
          </Label>
        </div>
      </section>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </form>
  )
}
