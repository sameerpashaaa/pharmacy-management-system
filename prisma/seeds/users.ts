import type { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

export async function seedUsers(prisma: PrismaClient) {
  const ownerRole = await prisma.role.findUnique({ where: { name: 'owner' } })
  const managerRole = await prisma.role.findUnique({ where: { name: 'manager' } })
  const pharmacistRole = await prisma.role.findUnique({ where: { name: 'pharmacist' } })
  const cashierRole = await prisma.role.findUnique({ where: { name: 'cashier' } })

  const branch = await prisma.branch.findFirst({ where: { isHeadOffice: true } })

  const users = [
    {
      name: 'Admin User',
      email: 'admin@pharmacare.local',
      password: 'Admin@123',
      role: ownerRole,
    },
    {
      name: 'Store Manager',
      email: 'manager@pharmacare.local',
      password: 'Manager@123',
      role: managerRole,
    },
    {
      name: 'Dr. Pharmacist',
      email: 'pharmacist@pharmacare.local',
      password: 'Pharma@123',
      role: pharmacistRole,
    },
    {
      name: 'Cashier User',
      email: 'cashier@pharmacare.local',
      password: 'Cashier@123',
      role: cashierRole,
    },
  ]

  for (const u of users) {
    const hashedPassword = await bcrypt.hash(u.password, 12)

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        name: u.name,
        email: u.email,
        password: hashedPassword,
        isActive: true,
        branchId: branch?.id,
      },
    })

    // Assign role
    if (u.role) {
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: u.role.id } },
        update: {},
        create: { userId: user.id, roleId: u.role.id },
      })
    }

    // Seed initial password history from the current hash (idempotent).
    // Existing passwords remain valid; history only constrains future changes.
    if (user.password) {
      const existingHistory = await prisma.passwordHistory.count({ where: { userId: user.id } })
      if (existingHistory === 0) {
        await prisma.passwordHistory.create({ data: { userId: user.id, hash: user.password } })
      }
    }
  }

  console.log(`  ✓ ${users.length} users seeded`)
  console.log('  📋 Default credentials:')
  console.log('     admin@pharmacare.local / Admin@123')
  console.log('     manager@pharmacare.local / Manager@123')
}
