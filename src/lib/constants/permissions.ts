// ─────────────────────────────────────────────────────────────
// Constants — Permission Codes
// ─────────────────────────────────────────────────────────────

export const PERMISSIONS = {
  // Users
  USERS_CREATE: 'users:create',
  USERS_READ: 'users:read',
  USERS_UPDATE: 'users:update',
  USERS_DELETE: 'users:delete',
  ROLES_MANAGE: 'roles:manage',

  // Organization
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_UPDATE: 'organization:update',
  BRANCHES_MANAGE: 'branches:manage',

  // Products
  PRODUCTS_CREATE: 'products:create',
  PRODUCTS_READ: 'products:read',
  PRODUCTS_UPDATE: 'products:update',
  PRODUCTS_DELETE: 'products:delete',
  PRODUCTS_IMPORT: 'products:import',
  CATEGORIES_MANAGE: 'categories:manage',

  // Inventory
  INVENTORY_READ: 'inventory:read',
  INVENTORY_ADJUST: 'inventory:adjust',
  INVENTORY_APPROVE_ADJUSTMENT: 'inventory:approve_adjustment',
  INVENTORY_APPROVE_ADJUSTMENT_CHIEF: 'inventory:approve_adjustment_chief',

  // Batches
  BATCHES_READ: 'batches:read',
  BATCHES_UPDATE: 'batches:update',
  BATCHES_BLOCK: 'batches:block',
  BATCHES_DISPOSE: 'batches:dispose',

  // Sales / POS
  SALES_CREATE: 'sales:create',
  SALES_READ: 'sales:read',
  SALES_VOID: 'sales:void',
  SALES_DISCOUNT: 'sales:discount',
  SALES_DISCOUNT_OVERRIDE: 'sales:discount_override',
  SALES_CREDIT: 'sales:credit',
  INVOICES_PRINT: 'invoices:print',

  // Prescriptions
  PRESCRIPTIONS_CREATE: 'prescriptions:create',
  PRESCRIPTIONS_READ: 'prescriptions:read',
  PRESCRIPTIONS_APPROVE: 'prescriptions:approve',

  // Purchases
  PURCHASES_CREATE: 'purchases:create',
  PURCHASES_READ: 'purchases:read',
  PURCHASES_RECEIVE: 'purchases:receive',
  PURCHASES_UPDATE: 'purchases:update',

  // Returns
  RETURNS_CREATE: 'returns:create',
  RETURNS_READ: 'returns:read',
  RETURNS_APPROVE: 'returns:approve',

  // Customers
  CUSTOMERS_CREATE: 'customers:create',
  CUSTOMERS_READ: 'customers:read',
  CUSTOMERS_UPDATE: 'customers:update',
  CUSTOMERS_PAYMENTS: 'customers:payments',

  // Suppliers
  SUPPLIERS_CREATE: 'suppliers:create',
  SUPPLIERS_READ: 'suppliers:read',
  SUPPLIERS_UPDATE: 'suppliers:update',
  SUPPLIERS_PAYMENTS: 'suppliers:payments',

  // Finance
  FINANCE_READ: 'finance:read',
  FINANCE_MANAGE: 'finance:manage',

  // GST
  GST_READ: 'gst:read',
  GST_MANAGE: 'gst:manage',

  // Reports
  REPORTS_SALES: 'reports:sales',
  REPORTS_PURCHASES: 'reports:purchases',
  REPORTS_INVENTORY: 'reports:inventory',
  REPORTS_FINANCIAL: 'reports:financial',
  REPORTS_EXPORT: 'reports:export',

  // Audit
  AUDIT_READ: 'audit:read',

  // Settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_MANAGE: 'settings:manage',
} as const

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]
