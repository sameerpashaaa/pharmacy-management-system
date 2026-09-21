'use client'

// ─────────────────────────────────────────────────────────────
// Component — RoleForm
// Create / edit role with permission matrix toggle. Uses RHF for
// the simple name/displayName/description fields and tracks
// permission IDs as a controlled value passed to PermissionMatrix.
// ─────────────────────────────────────────────────────────────
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { PermissionMatrix } from '@/components/roles/permission-matrix'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/lib/hooks/use-toast'
import { createRoleSchema, updateRoleSchema, type CreateRoleInput } from '@/lib/validations/user'

interface RoleFormProps {
  mode: 'create' | 'edit'
  initial?: Partial<CreateRoleInput> & {
    id?: string
    permissionIds?: string[]
    isSystem?: boolean
  }
}

export function RoleForm({ mode, initial }: RoleFormProps) {
  const router = useRouter()
  const toast = useToast()
  const [permissionIds, setPermissionIds] = useState<string[]>(initial?.permissionIds ?? [])
  const isSystem = Boolean(initial?.isSystem)

  const schema = mode === 'create' ? createRoleSchema : updateRoleSchema

  const form = useForm<CreateRoleInput>({
    resolver: zodResolver(schema) as never,
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: {
      name: initial?.name ?? '',
      displayName: initial?.displayName ?? '',
      description: initial?.description ?? '',
      permissionIds: initial?.permissionIds ?? [],
    },
  })

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = form

  function onPermissionChange(ids: string[]) {
    setPermissionIds(ids)
    setValue('permissionIds', ids, { shouldValidate: true })
  }

  async function onSubmit(values: CreateRoleInput) {
    if (permissionIds.length === 0) {
      toast.error('Grant at least one permission')
      return
    }
    const body = { ...values, permissionIds }

    try {
      const url = mode === 'create' ? '/api/roles' : `/api/roles/${initial?.id}`
      const method = mode === 'create' ? 'POST' : 'PUT'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = (await res.json().catch(() => null)) as {
        success: boolean
        error?: { message?: string }
      } | null
      if (!res.ok || !json?.success) {
        toast.error(json?.error?.message ?? 'Save failed')
        return
      }
      toast.success(mode === 'create' ? 'Role created' : 'Role updated')
      router.push('/roles')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 p-6 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="name">System Name *</Label>
            <Input
              id="name"
              {...register('name')}
              placeholder="e.g. branch_manager"
              disabled={isSystem}
            />
            <p className="text-xs text-muted-foreground">Lowercase letters and underscores only</p>
            {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="displayName">Display Name *</Label>
            <Input
              id="displayName"
              {...register('displayName')}
              placeholder="e.g. Branch Manager"
            />
            {errors.displayName && (
              <p className="text-xs text-destructive">{errors.displayName.message}</p>
            )}
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" rows={2} {...register('description')} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 p-6">
          <div>
            <h3 className="text-sm font-semibold">Permissions</h3>
            <p className="text-xs text-muted-foreground">
              Click a module header to toggle all permissions in that module.
            </p>
          </div>
          <PermissionMatrix
            grantedIds={permissionIds}
            onChange={onPermissionChange}
            readOnly={isSystem}
          />
          {errors.permissionIds && (
            <p className="text-xs text-destructive">
              {errors.permissionIds.message ?? 'Select at least one permission'}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button asChild variant="ghost" type="button">
          <Link href="/roles">Cancel</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create Role' : 'Save Changes'}
        </Button>
      </div>
    </form>
  )
}
