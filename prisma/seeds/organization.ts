import type { PrismaClient } from '@prisma/client'

export async function seedOrganization(prisma: PrismaClient) {
  const org = await prisma.organization.upsert({
    where: { id: 'default-org' },
    update: {},
    create: {
      id: 'default-org',
      name: 'PharmaCare Medical Store',
      legalName: 'PharmaCare Medical Store Pvt. Ltd.',
      gstin: '29ABCDE1234F1Z5',
      dlNumber: 'DL-KA-12345',
      email: 'info@pharmacare.local',
      phone: '+91-9876543210',
      address: '123, Medical Street, Health Nagar',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
      country: 'India',
      currency: 'INR',
      timezone: 'Asia/Kolkata',
      financialYearStart: 4,
    },
  })

  // Head office branch
  await prisma.branch.upsert({
    where: { id: 'default-branch' },
    update: {},
    create: {
      id: 'default-branch',
      organizationId: org.id,
      name: 'Main Branch',
      code: 'HO',
      gstin: '29ABCDE1234F1Z5',
      dlNumber: 'DL-KA-12345',
      email: 'main@pharmacare.local',
      phone: '+91-9876543210',
      address: '123, Medical Street, Health Nagar',
      city: 'Bangalore',
      state: 'Karnataka',
      pincode: '560001',
      isHeadOffice: true,
      isActive: true,
      invoicePrefix: 'PC',
      invoiceCounter: 1,
    },
  })

  console.log('  ✓ Organization and branch seeded')
}
