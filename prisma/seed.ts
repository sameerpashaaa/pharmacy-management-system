import fs from 'fs'
import path from 'path'
import { PrismaClient } from '@prisma/client'

const envPath = path.resolve(process.cwd(), '.env')
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const match = line.match(/^([^#\s]+?)=(.*)$/)
      if (match) {
        let val = match[2].trim()
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        process.env[match[1].trim()] = val
      }
    })
}
const envLocalPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envLocalPath)) {
  fs.readFileSync(envLocalPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const match = line.match(/^([^#\s]+?)=(.*)$/)
      if (match) {
        let val = match[2].trim()
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1)
        process.env[match[1].trim()] = val
      }
    })
}

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
  .finally(async () => {
    await prisma.$disconnect()
  })
