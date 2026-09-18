import type { Prisma } from '@prisma/client'
import bcrypt from 'bcryptjs'

import prisma from '@/lib/db/prisma'

type DbClient = Pick<typeof prisma, 'passwordHistory'>

/** Number of previous passwords retained per user. */
export const PASSWORD_HISTORY_LIMIT = 5

/**
 * Returns true when the plaintext password matches any of the user's
 * last PASSWORD_HISTORY_LIMIT stored hashes. Must be called before hashing.
 */
export async function isPasswordReused(
  userId: string,
  plainPassword: string,
  db: DbClient = prisma
): Promise<boolean> {
  const history = await db.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: PASSWORD_HISTORY_LIMIT,
    select: { hash: true },
  })
  for (const entry of history) {
    if (await bcrypt.compare(plainPassword, entry.hash)) return true
  }
  return false
}

/**
 * Records a new password hash and prunes history to the newest entries.
 * Must run inside the same transaction as the User.password update.
 */
export async function recordPasswordHistory(
  tx: Prisma.TransactionClient,
  userId: string,
  hash: string
): Promise<void> {
  await tx.passwordHistory.create({ data: { userId, hash } })
  const keep = await tx.passwordHistory.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: PASSWORD_HISTORY_LIMIT,
    select: { id: true },
  })
  await tx.passwordHistory.deleteMany({
    where: { userId, id: { notIn: keep.map((k) => k.id) } },
  })
}
