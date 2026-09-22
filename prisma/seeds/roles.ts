import type { PrismaClient } from '@prisma/client'

// Role → Permission mapping
const ROLES = [
  {
    name: 'owner',
    displayName: 'Owner / Admin',
    description: 'Full access to all features',
    isSystem: true,
    permissions: 'ALL', // Special flag - gets all permissions
  },
  {
    name: 'manager',
    displayName: 'Store Manager',
    description: 'Can manage most features except system settings',
    isSystem: true,
    permissions: [
      'users:read',
      'users:create',
      'users:update',
      'organization:read',
      'branches:manage',
      'products:create',
      'products:read',
      'products:update',
      'products:delete',
      'products:import',
      'categories:manage',
      'inventory:read',
      'inventory:adjust',
      'inventory:approve_adjustment',
      'batches:read',
      'batches:update',
      'batches:block',
      'batches:dispose',
      'sales:create',
      'sales:read',
      'sales:void',
      'sales:discount',
      'sales:discount_override',
      'sales:credit',
      'invoices:print',
      'prescriptions:create',
      'prescriptions:read',
      'prescriptions:approve',
      'purchases:create',
      'purchases:read',
      'purchases:receive',
      'purchases:update',
      'returns:create',
      'returns:read',
      'returns:approve',
      'customers:create',
      'customers:read',
      'customers:update',
      'customers:delete',
      'customers:payments',
      'suppliers:create',
      'suppliers:read',
      'suppliers:update',
      'suppliers:payments',
      'doctors:create',
      'doctors:read',
      'doctors:update',
      'doctors:delete',
      'finance:read',
      'finance:manage',
      'gst:read',
      'gst:manage',
      'reports:sales',
      'reports:purchases',
      'reports:inventory',
      'reports:financial',
      'reports:export',
      'audit:read',
      'settings:read',
    ],
  },
  {
    name: 'pharmacist',
    displayName: 'Pharmacist',
    description: 'Can dispense medicines and manage prescriptions',
    isSystem: true,
    permissions: [
      'products:read',
      'inventory:read',
      'batches:read',
      'sales:create',
      'sales:read',
      'sales:discount',
      'invoices:print',
      'prescriptions:create',
      'prescriptions:read',
      'prescriptions:approve',
      'doctors:read',
      'customers:create',
      'customers:read',
      'returns:read',
      'reports:sales',
    ],
  },
  {
    name: 'chief_pharmacist',
    displayName: 'Chief Pharmacist',
    description: 'Senior pharmacist with authority for large stock adjustments',
    isSystem: true,
    permissions: [
      'products:read',
      'inventory:read',
      'inventory:adjust',
      'inventory:approve_adjustment',
      'inventory:approve_adjustment_chief',
      'batches:read',
      'batches:update',
      'batches:block',
      'batches:dispose',
      'sales:read',
      'prescriptions:read',
      'prescriptions:create',
      'prescriptions:approve',
      'customers:read',
      'reports:sales',
      'reports:inventory',
      'audit:read',
    ],
  },
  {
    name: 'cashier',
    displayName: 'Cashier',
    description: 'Can create sales and basic customer management',
    isSystem: true,
    permissions: [
      'products:read',
      'inventory:read',
      'batches:read',
      'sales:create',
      'sales:read',
      'invoices:print',
      'customers:create',
      'customers:read',
    ],
  },
  {
    name: 'purchase_manager',
    displayName: 'Purchase Manager',
    description: 'Manages procurement and supplier relations',
    isSystem: false,
    permissions: [
      'products:read',
      'inventory:read',
      'batches:read',
      'purchases:create',
      'purchases:read',
      'purchases:receive',
      'purchases:update',
      'returns:create',
      'returns:read',
      'suppliers:create',
      'suppliers:read',
      'suppliers:update',
      'suppliers:payments',
      'reports:purchases',
      'reports:inventory',
    ],
  },
  {
    name: 'accountant',
    displayName: 'Accountant',
    description: 'Financial tracking, GST, and reporting',
    isSystem: false,
    permissions: [
      'customers:read',
      'customers:payments',
      'suppliers:read',
      'suppliers:payments',
      'finance:read',
      'finance:manage',
      'gst:read',
      'gst:manage',
      'reports:sales',
      'reports:purchases',
      'reports:financial',
      'reports:export',
      'audit:read',
    ],
  },
]

export async function seedRoles(prisma: PrismaClient) {
  const allPermissions = await prisma.permission.findMany()
  const permMap = new Map(allPermissions.map((p) => [p.code, p.id]))

  for (const role of ROLES) {
    const created = await prisma.role.upsert({
      where: { name: role.name },
      update: { displayName: role.displayName, description: role.description },
      create: {
        name: role.name,
        displayName: role.displayName,
        description: role.description,
        isSystem: role.isSystem,
      },
    })

    // Assign permissions
    const permCodes =
      role.permissions === 'ALL' ? allPermissions.map((p) => p.code) : role.permissions

    // Delete existing role permissions first
    await prisma.rolePermission.deleteMany({ where: { roleId: created.id } })

    // Recreate
    for (const code of permCodes) {
      const permId = permMap.get(code)
      if (permId) {
        await prisma.rolePermission.create({
          data: { roleId: created.id, permissionId: permId },
        })
      }
    }
  }
  console.log(`  ✓ ${ROLES.length} roles seeded`)
}
