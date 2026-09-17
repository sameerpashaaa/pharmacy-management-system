import type { PrismaClient } from '@prisma/client'

// All permissions for the system, organized by module
const PERMISSIONS = [
  // Auth & Users
  { code: 'users:create', name: 'Create Users', module: 'users', action: 'create' },
  { code: 'users:read', name: 'View Users', module: 'users', action: 'read' },
  { code: 'users:update', name: 'Update Users', module: 'users', action: 'update' },
  { code: 'users:delete', name: 'Delete Users', module: 'users', action: 'delete' },
  { code: 'roles:manage', name: 'Manage Roles & Permissions', module: 'roles', action: 'manage' },

  // Organization
  { code: 'organization:read', name: 'View Organization', module: 'organization', action: 'read' },
  {
    code: 'organization:update',
    name: 'Update Organization',
    module: 'organization',
    action: 'update',
  },
  { code: 'branches:manage', name: 'Manage Branches', module: 'branches', action: 'manage' },

  // Products
  { code: 'products:create', name: 'Create Products', module: 'products', action: 'create' },
  { code: 'products:read', name: 'View Products', module: 'products', action: 'read' },
  { code: 'products:update', name: 'Update Products', module: 'products', action: 'update' },
  { code: 'products:delete', name: 'Delete Products', module: 'products', action: 'delete' },
  { code: 'products:import', name: 'Import Products', module: 'products', action: 'import' },
  { code: 'categories:manage', name: 'Manage Categories', module: 'categories', action: 'manage' },

  // Inventory
  { code: 'inventory:read', name: 'View Inventory', module: 'inventory', action: 'read' },
  { code: 'inventory:adjust', name: 'Adjust Stock', module: 'inventory', action: 'adjust' },
  {
    code: 'inventory:approve_adjustment',
    name: 'Approve Stock Adjustments',
    module: 'inventory',
    action: 'approve',
  },
  {
    code: 'inventory:approve_adjustment_chief',
    name: 'Approve Chief Stock Adjustments',
    module: 'inventory',
    action: 'approve_chief',
  },

  // Batches
  { code: 'batches:read', name: 'View Batches', module: 'batches', action: 'read' },
  { code: 'batches:update', name: 'Update Batches', module: 'batches', action: 'update' },
  { code: 'batches:block', name: 'Block/Quarantine Batches', module: 'batches', action: 'block' },
  { code: 'batches:dispose', name: 'Dispose Batches', module: 'batches', action: 'dispose' },

  // POS / Sales
  { code: 'sales:create', name: 'Create Sales (POS)', module: 'sales', action: 'create' },
  { code: 'sales:read', name: 'View Sales', module: 'sales', action: 'read' },
  { code: 'sales:void', name: 'Void/Cancel Sales', module: 'sales', action: 'void' },
  { code: 'sales:discount', name: 'Apply Discounts', module: 'sales', action: 'discount' },
  {
    code: 'sales:discount_override',
    name: 'Override Max Discount',
    module: 'sales',
    action: 'discount_override',
  },
  { code: 'sales:credit', name: 'Sell on Credit', module: 'sales', action: 'credit' },
  { code: 'invoices:print', name: 'Print Invoices', module: 'invoices', action: 'print' },

  // Prescriptions
  {
    code: 'prescriptions:create',
    name: 'Create Prescriptions',
    module: 'prescriptions',
    action: 'create',
  },
  {
    code: 'prescriptions:read',
    name: 'View Prescriptions',
    module: 'prescriptions',
    action: 'read',
  },
  {
    code: 'prescriptions:approve',
    name: 'Approve Prescriptions',
    module: 'prescriptions',
    action: 'approve',
  },

  // Purchases
  {
    code: 'purchases:create',
    name: 'Create Purchase Orders',
    module: 'purchases',
    action: 'create',
  },
  { code: 'purchases:read', name: 'View Purchases', module: 'purchases', action: 'read' },
  {
    code: 'purchases:receive',
    name: 'Receive Stock (GRN)',
    module: 'purchases',
    action: 'receive',
  },
  { code: 'purchases:update', name: 'Update Purchases', module: 'purchases', action: 'update' },

  // Returns
  { code: 'returns:create', name: 'Process Returns', module: 'returns', action: 'create' },
  { code: 'returns:read', name: 'View Returns', module: 'returns', action: 'read' },
  { code: 'returns:approve', name: 'Approve Returns', module: 'returns', action: 'approve' },

  // Customers
  { code: 'customers:create', name: 'Create Customers', module: 'customers', action: 'create' },
  { code: 'customers:read', name: 'View Customers', module: 'customers', action: 'read' },
  { code: 'customers:update', name: 'Update Customers', module: 'customers', action: 'update' },
  {
    code: 'customers:payments',
    name: 'Record Customer Payments',
    module: 'customers',
    action: 'payments',
  },

  // Suppliers
  { code: 'suppliers:create', name: 'Create Suppliers', module: 'suppliers', action: 'create' },
  { code: 'suppliers:read', name: 'View Suppliers', module: 'suppliers', action: 'read' },
  { code: 'suppliers:update', name: 'Update Suppliers', module: 'suppliers', action: 'update' },
  {
    code: 'suppliers:payments',
    name: 'Record Supplier Payments',
    module: 'suppliers',
    action: 'payments',
  },

  // Finance
  { code: 'finance:read', name: 'View Financial Data', module: 'finance', action: 'read' },
  { code: 'finance:manage', name: 'Manage Finance', module: 'finance', action: 'manage' },

  // GST
  { code: 'gst:read', name: 'View GST Reports', module: 'gst', action: 'read' },
  { code: 'gst:manage', name: 'Manage GST Settings', module: 'gst', action: 'manage' },

  // Reports
  { code: 'reports:sales', name: 'View Sales Reports', module: 'reports', action: 'sales' },
  {
    code: 'reports:purchases',
    name: 'View Purchase Reports',
    module: 'reports',
    action: 'purchases',
  },
  {
    code: 'reports:inventory',
    name: 'View Inventory Reports',
    module: 'reports',
    action: 'inventory',
  },
  {
    code: 'reports:financial',
    name: 'View Financial Reports',
    module: 'reports',
    action: 'financial',
  },
  { code: 'reports:export', name: 'Export Reports', module: 'reports', action: 'export' },

  // Audit
  { code: 'audit:read', name: 'View Audit Logs', module: 'audit', action: 'read' },

  // Settings
  { code: 'settings:read', name: 'View Settings', module: 'settings', action: 'read' },
  { code: 'settings:manage', name: 'Manage System Settings', module: 'settings', action: 'manage' },
]

export async function seedPermissions(prisma: PrismaClient) {
  for (const perm of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: {
        code: perm.code,
        name: perm.name,
        module: perm.module,
        action: perm.action,
      },
    })
  }
  console.log(`  ✓ ${PERMISSIONS.length} permissions seeded`)
}
