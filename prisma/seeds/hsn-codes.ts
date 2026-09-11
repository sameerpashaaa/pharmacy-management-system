import type { PrismaClient } from '@prisma/client'

const HSN_CODES = [
  { code: '3004', description: 'Medicaments for therapeutic or prophylactic uses', gstRate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12, cessRate: 0 },
  { code: '3003', description: 'Medicaments (not in dosage forms)', gstRate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12, cessRate: 0 },
  { code: '3002', description: 'Human blood, vaccines, toxins', gstRate: 5, cgstRate: 2.5, sgstRate: 2.5, igstRate: 5, cessRate: 0 },
  { code: '3001', description: 'Glands, organs for organo-therapeutical uses', gstRate: 0, cgstRate: 0, sgstRate: 0, igstRate: 0, cessRate: 0 },
  { code: '3006', description: 'Pharmaceutical goods (surgical gut, sutures, etc.)', gstRate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12, cessRate: 0 },
  { code: '3005', description: 'Wadding, gauze, bandages', gstRate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12, cessRate: 0 },
  { code: '9018', description: 'Instruments and appliances used in medicine', gstRate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12, cessRate: 0 },
  { code: '9019', description: 'Mechano-therapy appliances, massage apparatus', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, cessRate: 0 },
  { code: '9021', description: 'Orthopaedic appliances, prosthetics', gstRate: 12, cgstRate: 6, sgstRate: 6, igstRate: 12, cessRate: 0 },
  { code: '3307', description: 'Toiletries, cosmetics', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, cessRate: 0 },
  { code: '2106', description: 'Food preparations (health supplements)', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, cessRate: 0 },
  { code: '9402', description: 'Medical furniture', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18, cessRate: 0 },
]

export async function seedHsnCodes(prisma: PrismaClient) {
  for (const hsn of HSN_CODES) {
    await prisma.hsnCode.upsert({
      where: { code: hsn.code },
      update: {},
      create: hsn,
    })
  }
  console.log(`  ✓ ${HSN_CODES.length} HSN codes seeded`)
}
