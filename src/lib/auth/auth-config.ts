import { PrismaAdapter } from '@auth/prisma-adapter'
import bcrypt from 'bcryptjs'
import type { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

import prisma from '@/lib/db/prisma'
import { PERMISSIONS } from '@/lib/constants/permissions'

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
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error('Email and password are required')
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
          include: {
            userRoles: {
              include: {
                role: {
                  include: {
                    rolePermissions: {
                      include: { permission: true },
                    },
                  },
                },
              },
            },
          },
        })

        if (!user) {
          throw new Error('Invalid email or password')
        }

        if (!user.isActive) {
          throw new Error('Your account has been deactivated')
        }

        // Check account lockout
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error('Account temporarily locked due to too many failed attempts')
        }

        if (!user.password) {
          throw new Error('Please use the password reset flow to set a password')
        }

        const isValidPassword = await bcrypt.compare(credentials.password, user.password)

        if (!isValidPassword) {
          // Increment failed login count
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: { increment: 1 },
              // Lock after 5 failed attempts for 15 minutes
              lockedUntil:
                user.failedLoginCount >= 4
                  ? new Date(Date.now() + 15 * 60 * 1000)
                  : undefined,
            },
          })
          throw new Error('Invalid email or password')
        }

        // Reset failed login count and update last login
        await prisma.user.update({
          where: { id: user.id },
          data: {
            failedLoginCount: 0,
            lockedUntil: null,
            lastLoginAt: new Date(),
          },
        })

        const roles = user.userRoles.map((ur) => ur.role.name)
        const isOwnerOrAdmin = roles.includes('owner') || roles.includes('admin')

        // Collect permissions - owner and admin roles get ALL permissions
        const permissions = isOwnerOrAdmin
          ? (Object.values(PERMISSIONS) as string[])
          : user.userRoles.flatMap((ur) =>
              ur.role.rolePermissions.map((rp) => rp.permission.code)
            )

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          permissions: [...new Set(permissions)],
          roles,
          branchId: user.branchId,
        }
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
      }

      // If token has owner or admin role, guarantee ALL permissions
      if (token.roles?.includes('owner') || token.roles?.includes('admin')) {
        token.permissions = Object.values(PERMISSIONS) as string[]
      } else if (!token.permissions || token.permissions.length === 0) {
        // Heal stale tokens by refreshing roles/permissions from DB
        if (token.id) {
          try {
            const dbUser = await prisma.user.findUnique({
              where: { id: token.id as string },
              include: {
                userRoles: {
                  include: {
                    role: {
                      include: {
                        rolePermissions: {
                          include: { permission: true },
                        },
                      },
                    },
                  },
                },
              },
            })

            if (dbUser) {
              const roles = dbUser.userRoles.map((ur) => ur.role.name)
              token.roles = roles
              if (roles.includes('owner') || roles.includes('admin')) {
                token.permissions = Object.values(PERMISSIONS) as string[]
              } else {
                token.permissions = [
                  ...new Set(
                    dbUser.userRoles.flatMap((ur) =>
                      ur.role.rolePermissions.map((rp) => rp.permission.code)
                    )
                  ),
                ]
              }
            }
          } catch {
            // Keep existing token if DB lookup fails
          }
        }
      }

      return token
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id
        session.user.permissions = token.permissions
        session.user.roles = token.roles
        session.user.branchId = token.branchId
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
