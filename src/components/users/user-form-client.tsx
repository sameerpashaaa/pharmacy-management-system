'use client'

// ─────────────────────────────────────────────────────────────
// Component — UserFormClient
// Thin wrapper around UserForm that wires the toast-success →
// navigate-to-list behaviour. Server pages use this in create
// and edit contexts.
// ─────────────────────────────────────────────────────────────
import { useRouter } from 'next/navigation'

import { UserForm } from '@/components/users/user-form'

interface UserFormClientProps {
  initialData?: {
    id?: string
    name: string
    email: string
    phone?: string | null
    isActive: boolean
    userRoles: { role: { id: string; name: string; displayName: string } }[]
  }
}

export function UserFormClient({ initialData }: UserFormClientProps) {
  const router = useRouter()

  return (
    <UserForm
      initialData={initialData as never}
      onSuccess={() => {
        router.push('/users')
        router.refresh()
      }}
      onCancel={() => router.push('/users')}
    />
  )
}
