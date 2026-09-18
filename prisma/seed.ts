// ─────────────────────────────────────────────────────────────
// Prisma Seed Entry Point
// Run: npm run db:seed
// ─────────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client'

import { seedHsnCodes } from './seeds/hsn-codes'
import { seedOrganization } from './seeds/organization'
import { seedPermissions } from './seeds/permissions'
import { seedProducts } from './seeds/products'
import { seedRoles } from './seeds/roles'
import { seedSettings } from './seeds/settings'
import { seedUsers } from './seeds/users'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seed...\n')

  console.log('📋 Seeding permissions...')
  await seedPermissions(prisma)

  console.log('👑 Seeding roles...')
  await seedRoles(prisma)

  console.log('🏪 Seeding organization...')
  await seedOrganization(prisma)

  console.log('👤 Seeding users...')
  await seedUsers(prisma)

  console.log('⚙️  Seeding system settings...')
  await seedSettings(prisma)

  console.log('🔢 Seeding HSN codes...')
  await seedHsnCodes(prisma)

  console.log('💊 Seeding sample products...')
  await seedProducts(prisma)

  console.log('\n✅ Database seeded successfully!')
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e)
    process.exit(1)
  })
  .finally(() => {
    void prisma.$disconnect()
  })
