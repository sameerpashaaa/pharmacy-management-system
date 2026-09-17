import { PrismaAdapter } from '@auth/prisma-adapter'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

import prisma from '@/lib/db/prisma'

import { completeMfaChallenge, verifyPasswordStep } from './mfa-service'

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions['adapter'],
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        mfaToken: { label: 'MFA Token', type: 'text' },
        totpCode: { label: 'Authenticator Code', type: 'text' },
      },
      async authorize(credentials) {
        // MFA challenge completion: password was already verified when the
        // short-lived pending credential was issued. Session issuance still
        // happens here, inside NextAuth's normal authorize → jwt → session path.
        if (credentials?.mfaToken && credentials?.totpCode) {
          return completeMfaChallenge(credentials.mfaToken, credentials.totpCode)
        }

        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required')
        }

        const result = await verifyPasswordStep(credentials.email, credentials.password)
        if (result.status === 'mfa_required') {
          throw new Error(`MFA_REQUIRED:${result.mfaToken}`)
        }
        return result.user
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.permissions = (user as { permissions?: string[] }).permissions ?? []
        token.roles = (user as { roles?: string[] }).roles ?? []
        token.branchId = (user as { branchId?: string | null }).branchId ?? null
        token.mfaVerified = (user as { mfaVerified?: boolean }).mfaVerified ?? false
      }
      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id
        session.user.permissions = token.permissions
        session.user.roles = token.roles
        session.user.branchId = token.branchId
        session.user.mfaVerified = token.mfaVerified
      }
      return session
    },
  },
  events: {
    async signOut({ token }) {
      // Audit log the sign out
      if (token?.id) {
        await prisma.auditLog.create({
          data: {
            userId: token.id,
            action: 'LOGOUT',
            entity: 'User',
            entityId: token.id,
          },
        })
      }
    },
  },
}
