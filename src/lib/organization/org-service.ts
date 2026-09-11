// ─────────────────────────────────────────────────────────────
// Organization Service
// ─────────────────────────────────────────────────────────────
import prisma from '@/lib/db/prisma'
import type { Organization, Branch, OrganizationSetting, Prisma } from '@prisma/client'

// ── Organization ──────────────────────────────────────────────

export async function getOrganization(): Promise<Organization | null> {
  return prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
  })
}

export async function getOrganizationWithBranches() {
  return prisma.organization.findFirst({
    orderBy: { createdAt: 'asc' },
    include: {
      branches: {
        where: { isActive: true },
        orderBy: { isHeadOffice: 'desc' },
      },
      settings: true,
    },
  })
}

export async function updateOrganization(
  id: string,
  data: Prisma.OrganizationUpdateInput
): Promise<Organization> {
  return prisma.organization.update({ where: { id }, data })
}

// ── Organization Settings ─────────────────────────────────────

export async function getSettings(organizationId: string): Promise<Record<string, string>> {
  const rows = await prisma.organizationSetting.findMany({ where: { organizationId } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

export async function upsertSetting(
  organizationId: string,
  key: string,
  value: string
): Promise<OrganizationSetting> {
  return prisma.organizationSetting.upsert({
    where: { organizationId_key: { organizationId, key } },
    update: { value },
    create: { organizationId, key, value },
  })
}

export async function upsertSettings(
  organizationId: string,
  settings: Record<string, string>
): Promise<void> {
  await Promise.all(
    Object.entries(settings).map(([key, value]) =>
      prisma.organizationSetting.upsert({
        where: { organizationId_key: { organizationId, key } },
        update: { value },
        create: { organizationId, key, value },
      })
    )
  )
}

// ── Branches ─────────────────────────────────────────────────

export async function getBranches(organizationId: string) {
  return prisma.branch.findMany({
    where: { organizationId },
    orderBy: [{ isHeadOffice: 'desc' }, { name: 'asc' }],
  })
}

export async function getBranchById(id: string): Promise<Branch | null> {
  return prisma.branch.findUnique({ where: { id } })
}

export async function createBranch(
  organizationId: string,
  data: Omit<Prisma.BranchCreateInput, 'organization'>
): Promise<Branch> {
  return prisma.branch.create({
    data: { ...data, organization: { connect: { id: organizationId } } },
  })
}

export async function updateBranch(
  id: string,
  data: Prisma.BranchUpdateInput
): Promise<Branch> {
  return prisma.branch.update({ where: { id }, data })
}

export async function deleteBranch(id: string): Promise<Branch> {
  // Soft-delete: mark inactive
  return prisma.branch.update({ where: { id }, data: { isActive: false } })
}
