// ─────────────────────────────────────────────────────────────
// Constants — App Routes
// ─────────────────────────────────────────────────────────────

export const ROUTES = {
  // Auth
  LOGIN: '/login',
  LOGOUT: '/logout',
  RESET_PASSWORD: '/reset-password',
  REGISTER: '/register',

  // Dashboard
  DASHBOARD: '/',

  // POS
  POS: '/pos',

  // Products
  PRODUCTS: '/products',
  PRODUCTS_NEW: '/products/new',
  PRODUCT: (id: string) => `/products/${id}`,
  PRODUCT_EDIT: (id: string) => `/products/${id}/edit`,
  CATEGORIES: '/products/categories',

  // Inventory
  INVENTORY: '/inventory',
  INVENTORY_ADJUSTMENTS: '/inventory/adjustments',
  INVENTORY_MOVEMENTS: '/inventory/movements',

  // Batches
  BATCHES: '/batches',
  BATCHES_EXPIRING: '/batches/expiring',
  BATCH: (id: string) => `/batches/${id}`,

  // Purchases
  PURCHASES: '/purchases',
  PURCHASES_NEW: '/purchases/new',
  PURCHASE: (id: string) => `/purchases/${id}`,
  PURCHASE_RECEIVE: (id: string) => `/purchases/${id}/receive`,
  PURCHASE_RETURNS: '/purchases/returns',
  PURCHASE_RETURNS_NEW: '/purchases/returns/new',
  PURCHASE_RETURN: (id: string) => `/purchases/returns/${id}`,

  // Sales
  SALES: '/sales',
  SALES_NEW: '/sales/new',
  SALE: (id: string) => `/sales/${id}`,

  // Returns
  SALE_RETURNS: '/returns/sales',
  SALE_RETURNS_NEW: '/returns/sales/new',
  SALE_RETURN: (id: string) => `/returns/sales/${id}`,

  // Prescriptions
  PRESCRIPTIONS: '/prescriptions',
  PRESCRIPTIONS_PENDING: '/prescriptions/pending',
  PRESCRIPTION: (id: string) => `/prescriptions/${id}`,

  // Customers
  CUSTOMERS: '/customers',
  CUSTOMERS_NEW: '/customers/new',
  CUSTOMER: (id: string) => `/customers/${id}`,

  // Suppliers
  SUPPLIERS: '/suppliers',
  SUPPLIERS_NEW: '/suppliers/new',
  SUPPLIER: (id: string) => `/suppliers/${id}`,

  // Finance
  FINANCE: '/finance',
  RECEIVABLES: '/finance/receivables',
  PAYABLES: '/finance/payables',

  // GST
  GST: '/gst',
  GST_REPORTS: '/gst/reports',

  // Expiry
  EXPIRY: '/expiry',
  EXPIRY_EXPIRING: '/expiry/expiring',
  EXPIRY_EXPIRED: '/expiry/expired',

  // Reports
  REPORTS: '/reports',
  REPORTS_SALES: '/reports/sales',
  REPORTS_PURCHASES: '/reports/purchases',
  REPORTS_INVENTORY: '/reports/inventory',
  REPORTS_FINANCIAL: '/reports/financial',
  REPORTS_GST: '/gst/reports',
  REPORTS_NARCOTICS: '/reports/narcotics',
  REPORTS_SUPPLIER: '/reports/supplier',

  // Compliance
  COMPLIANCE_FORM35: '/compliance/form35',

  // Users & Roles
  USERS: '/users',
  USERS_NEW: '/users/new',
  USER: (id: string) => `/users/${id}`,
  ROLES: '/roles',
  ROLES_NEW: '/roles/new',
  ROLE: (id: string) => `/roles/${id}`,

  // Audit
  AUDIT: '/audit',

  // Settings
  SETTINGS: '/settings',
  SETTINGS_ORGANIZATION: '/settings/organization',
  SETTINGS_GENERAL: '/settings/general',
} as const

// Routes that don't require authentication
export const PUBLIC_ROUTES = [ROUTES.LOGIN, ROUTES.REGISTER, ROUTES.RESET_PASSWORD, '/api/auth']

// API base routes
export const API = {
  AUTH: {
    LOGIN: '/api/auth/login',
    LOGOUT: '/api/auth/logout',
    SESSION: '/api/auth/session',
    RESET_PASSWORD: '/api/auth/reset-password',
  },
  USERS: '/api/users',
  ROLES: '/api/roles',
  PERMISSIONS: '/api/permissions',
  PRODUCTS: '/api/products',
  INVENTORY: '/api/inventory',
  BATCHES: '/api/batches',
  SALES: '/api/sales',
  PURCHASES: '/api/purchases',
  CUSTOMERS: '/api/customers',
  SUPPLIERS: '/api/suppliers',
  RETURNS: '/api/returns',
  PRESCRIPTIONS: '/api/prescriptions',
  POS_PRODUCTS: '/api/pos/products',
  POS_CONFIG: '/api/pos/config',
  POS_HELD_BILLS: '/api/pos/held-bills',
  HELD_BILL: (id: string) => `/api/pos/held-bills/${id}`,
  ORGANIZATION: '/api/organization',
  BRANCHES: '/api/branches',
  SETTINGS: '/api/settings',
  REPORTS: '/api/reports',
  GST: '/api/gst',
  EXPIRY: '/api/expiry',
  EXPIRY_EXPIRING: '/api/expiry/expiring',
  EXPIRY_EXPIRED: '/api/expiry/expired',
  AUDIT: '/api/audit',
  NOTIFICATIONS: '/api/notifications',
  FILES: '/api/files',
} as const
