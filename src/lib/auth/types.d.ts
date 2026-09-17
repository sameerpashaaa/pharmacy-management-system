// Extend NextAuth types to include our custom fields
import type { DefaultSession, DefaultUser } from 'next-auth'
import type { DefaultJWT } from 'next-auth/jwt'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      permissions: string[]
      roles: string[]
      branchId: string | null
      mfaVerified?: boolean
    }
  }

  interface User extends DefaultUser {
    permissions: string[]
    roles: string[]
    branchId: string | null
    mfaVerified?: boolean
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string
    permissions: string[]
    roles: string[]
    branchId: string | null
    mfaVerified?: boolean
  }
}
