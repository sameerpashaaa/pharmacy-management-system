import type { PrismaClient } from '@prisma/client'

const SETTINGS = [
  // General
  {
    category: 'general',
    key: 'app_name',
    value: 'PharmaCare',
    dataType: 'string',
    label: 'Application Name',
  },
  {
    category: 'general',
    key: 'date_format',
    value: 'dd/MM/yyyy',
    dataType: 'string',
    label: 'Date Format',
  },
  {
    category: 'general',
    key: 'currency_symbol',
    value: '₹',
    dataType: 'string',
    label: 'Currency Symbol',
  },
  {
    category: 'general',
    key: 'decimal_places',
    value: '2',
    dataType: 'number',
    label: 'Decimal Places',
  },

  // POS
  {
    category: 'pos',
    key: 'auto_print_invoice',
    value: 'false',
    dataType: 'boolean',
    label: 'Auto Print Invoice',
  },
  {
    category: 'pos',
    key: 'invoice_type',
    value: 'thermal',
    dataType: 'string',
    label: 'Invoice Type (thermal/a4)',
  },
  {
    category: 'pos',
    key: 'max_discount_percent',
    value: '20',
    dataType: 'number',
    label: 'Max Discount %',
  },
  {
    category: 'pos',
    key: 'allow_credit_sales',
    value: 'true',
    dataType: 'boolean',
    label: 'Allow Credit Sales',
  },
  {
    category: 'pos',
    key: 'require_customer_for_credit',
    value: 'true',
    dataType: 'boolean',
    label: 'Require Customer for Credit',
  },
  {
    category: 'pos',
    key: 'round_off_total',
    value: 'true',
    dataType: 'boolean',
    label: 'Round Off Invoice Total',
  },

  // Inventory
  {
    category: 'inventory',
    key: 'fefo_enabled',
    value: 'true',
    dataType: 'boolean',
    label: 'FEFO Batch Selection',
  },
  {
    category: 'inventory',
    key: 'negative_stock',
    value: 'false',
    dataType: 'boolean',
    label: 'Allow Negative Stock',
  },
  {
    category: 'inventory',
    key: 'low_stock_threshold',
    value: '10',
    dataType: 'number',
    label: 'Low Stock Threshold',
  },
  {
    category: 'inventory',
    key: 'expiry_alert_days',
    value: '90',
    dataType: 'number',
    label: 'Expiry Alert Days',
  },
  {
    category: 'inventory',
    key: 'approval_tier_self_max',
    value: '10',
    dataType: 'number',
    label: 'Self Approval Max Quantity',
  },
  {
    category: 'inventory',
    key: 'approval_tier_manager_max',
    value: '50',
    dataType: 'number',
    label: 'Manager Approval Max Quantity',
  },

  // Notifications
  {
    category: 'notifications',
    key: 'low_stock_enabled',
    value: 'true',
    dataType: 'boolean',
    label: 'Low Stock Alerts',
  },
  {
    category: 'notifications',
    key: 'expiry_alert_enabled',
    value: 'true',
    dataType: 'boolean',
    label: 'Expiry Alerts',
  },
  {
    category: 'notifications',
    key: 'payment_due_enabled',
    value: 'true',
    dataType: 'boolean',
    label: 'Payment Due Alerts',
  },

  // GST
  {
    category: 'gst',
    key: 'tax_inclusive',
    value: 'false',
    dataType: 'boolean',
    label: 'Prices are Tax Inclusive',
  },
  {
    category: 'gst',
    key: 'default_gst_rate',
    value: '12',
    dataType: 'number',
    label: 'Default GST Rate %',
  },
  {
    category: 'gst',
    key: 'state_code',
    value: '29',
    dataType: 'string',
    label: 'State Code (for GST)',
  },
]

export async function seedSettings(prisma: PrismaClient) {
  for (const setting of SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { category_key: { category: setting.category, key: setting.key } },
      update: {},
      create: setting,
    })
  }
  console.log(`  ✓ ${SETTINGS.length} system settings seeded`)
}
