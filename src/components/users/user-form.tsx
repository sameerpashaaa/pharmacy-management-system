'use client'

// ─────────────────────────────────────────────────────────────
// Component — UserForm
// Create / Edit user with role selection
// ─────────────────────────────────────────────────────────────
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/lib/hooks/use-toast'

// ─── Schema ──────────────────────────────────────────────────

const formSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.string().email('Enter a valid email'),
    password: z
      .string()
      .min(8, 'Minimum 8 characters')
      .regex(/[A-Z]/, 'Must contain uppercase')
      .regex(/[a-z]/, 'Must contain lowercase')
      .regex(/[0-9]/, 'Must contain a number')
      .optional()
      .or(z.literal('')),
    phone: z.string().optional(),
    roleIds: z.array(z.string()).min(1, 'At least one role is required'),
    isActive: z.boolean(),
  })

type FormValues = z.infer<typeof formSchema>

// ─── Types ───────────────────────────────────────────────────

type RoleOption = { id: string; displayName: string; name: string }
type UserInit = {
  id?: string
  name: string
  email: string
  phone?: string | null
  isActive: boolean
  userRoles: { role: RoleOption }[]
}

interface UserFormProps {
  initialData?: UserInit
  onSuccess?: () => void
  onCancel?: () => void
}

// ─── Component ───────────────────────────────────────────────

export function UserForm({ initialData, onSuccess, onCancel }: UserFormProps) {
  const toast = useToast()
  const isEditing = Boolean(initialData?.id)
  const [roles, setRoles] = useState<RoleOption[]>([])
  const [loadingRoles, setLoadingRoles] = useState(true)

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: initialData?.name ?? '',
      email: initialData?.email ?? '',
      password: '',
      phone: initialData?.phone ?? '',
      roleIds: initialData?.userRoles.map((ur) => ur.role.id) ?? [],
      isActive: initialData?.isActive ?? true,
    },
  })

  const selectedRoleIds = watch('roleIds')

  // Fetch available roles
  useEffect(() => {
    fetch('/api/roles')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setRoles(d.data as RoleOption[])
      })
      .catch(() => toast.error('Failed to load roles'))
      .finally(() => setLoadingRoles(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleRole(roleId: string) {
    const current = selectedRoleIds
    const next = current.includes(roleId)
      ? current.filter((id) => id !== roleId)
      : [...current, roleId]
    setValue('roleIds', next, { shouldValidate: true })
  }

  async function onSubmit(data: FormValues) {
    const url = isEditing ? `/api/users/${initialData!.id}` : '/api/users'
    const method = isEditing ? 'PUT' : 'POST'

    // Don't send empty password on edit
    const body = { ...data }
    if (isEditing && !body.password) delete body.password

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (res.ok) {
      toast.success(isEditing ? 'User updated successfully' : 'User created successfully')
      onSuccess?.()
    } else {
      const json = (await res.json()) as { error?: { message?: string } }
      toast.error(json.error?.message ?? 'Something went wrong')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {/* Name */}
      <div className="space-y-1">
        <Label htmlFor="name">Full Name *</Label>
        <Input id="name" {...register('name')} placeholder="John Doe" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      {/* Email */}
      <div className="space-y-1">
        <Label htmlFor="email">Email *</Label>
        <Input id="email" type="email" {...register('email')} placeholder="john@example.com" disabled={isEditing} />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      {/* Password */}
      <div className="space-y-1">
        <Label htmlFor="password">
          {isEditing ? 'New Password (leave blank to keep current)' : 'Password *'}
        </Label>
        <Input id="password" type="password" {...register('password')} placeholder="••••••••" />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
      </div>

      {/* Phone */}
      <div className="space-y-1">
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" {...register('phone')} placeholder="+91 9876543210" />
      </div>

      {/* Roles */}
      <div className="space-y-2">
        <Label>Roles *</Label>
        {loadingRoles ? (
          <p className="text-sm text-muted-foreground">Loading roles…</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {roles.map((role) => {
              const selected = selectedRoleIds.includes(role.id)
              return (
                <button
                  key={role.id}
                  type="button"
                  onClick={() => toggleRole(role.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    selected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-transparent hover:bg-muted'
                  }`}
                >
                  {role.displayName}
                </button>
              )
            })}
          </div>
        )}
        {errors.roleIds && (
          <p className="text-xs text-destructive">{errors.roleIds.message}</p>
        )}
      </div>

      {/* Active toggle */}
      <div className="flex items-center gap-2">
        <input
          id="isActive"
          type="checkbox"
          {...register('isActive')}
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor="isActive" className="font-normal">
          Active account
        </Label>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Save Changes' : 'Create User'}
        </Button>
      </div>
    </form>
  )
}
