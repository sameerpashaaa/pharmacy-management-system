// ─────────────────────────────────────────────────────────────
// Constants — System Roles
// ─────────────────────────────────────────────────────────────

export const ROLES = {
  OWNER: 'owner',
  MANAGER: 'manager',
  PHARMACIST: 'pharmacist',
  CASHIER: 'cashier',
  PURCHASE_MANAGER: 'purchase_manager',
  ACCOUNTANT: 'accountant',
} as const

export type RoleName = (typeof ROLES)[keyof typeof ROLES]

export const ROLE_LABELS: Record<RoleName, string> = {
  owner: 'Owner / Admin',
  manager: 'Store Manager',
  pharmacist: 'Pharmacist',
  cashier: 'Cashier',
  purchase_manager: 'Purchase Manager',
  accountant: 'Accountant',
}
