// ─────────────────────────────────────────────────────────────
// TypeScript Types — Auth Module
// ─────────────────────────────────────────────────────────────
import type { User, Role, Permission } from '@prisma/client'

export type { User, Role, Permission }

export type UserWithRoles = User & {
  userRoles: Array<{
    role: Role & {
      rolePermissions: Array<{
        permission: Permission
      }>
    }
  }>
}

export type SessionUser = {
  id: string
  name: string | null
  email: string
  image: string | null
  permissions: string[]
  roles: string[]
  branchId: string | null
}

export type LoginInput = {
  email: string
  password: string
}

export type RegisterInput = {
  name: string
  email: string
  password: string
}

export type PasswordResetInput = {
  token: string
  password: string
}
