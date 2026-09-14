'use strict'

/**
 * Graphify — source tree scanner.
 *
 * Walks `src/` and `e2e/`, classifies every file into a graph-feeding kind
 * (app page, API route, layout, component, domain service, validation,
 * hook, store, db client, utility, type, middleware, test, e2e, config),
 * assigns a business module where one can be derived from the path, and
 * detects "Coming in Phase N" placeholder pages.
 */

const fs = require('fs')
const path = require('path')

const MODULE_LABELS = {
  auth: 'Authentication',
  users: 'Users',
  roles: 'Roles & Permissions',
  permissions: 'Permissions',
  organization: 'Organization',
  branches: 'Branches',
  products: 'Products',
  categories: 'Categories',
  'hsn-codes': 'HSN Codes',
  inventory: 'Inventory',
  batches: 'Batches',
  expiry: 'Expiry Tracking',
  sales: 'Sales',
  pos: 'POS / Billing',
  purchases: 'Purchases',
  suppliers: 'Suppliers',
  customers: 'Customers',
  prescriptions: 'Prescriptions',
  returns: 'Returns',
  finance: 'Finance',
  gst: 'GST / Tax',
  reports: 'Reports',
  audit: 'Audit',
  settings: 'Settings',
  notifications: 'Notifications',
  files: 'Files',
}

const FILE_KIND_LABELS = {
  appPage: 'App Router page',
  apiRoute: 'API route',
  layoutComponent: 'Layout component',
  uiComponent: 'UI primitive',
  featureComponent: 'Feature component',
  libService: 'Domain service / logic',
  libConstants: 'Constants',
  libValidation: 'Validation schema',
  libHook: 'React hook',
  libStore: 'Client state store',
  libDb: 'Database client',
  libUtils: 'Utilities',
  libTypes: 'Types',
  middleware: 'Next.js middleware',
  test: 'Test file',
  e2e: 'E2E test',
  config: 'Config',
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

function contentOf(file) {
  try {
    return fs.readFileSync(file, 'utf8')
  } catch {
    return ''
  }
}

function kindOf(rel) {
  const isTest = /\.(test|spec)\.(ts|tsx|js|mjs)$/.test(rel)
  if (isTest) return rel.startsWith('e2e') ? 'e2e' : 'test'

  if (/app\/api\//.test(rel) && /route\.ts$/.test(rel)) return 'apiRoute'
  if (/middleware\.ts$/.test(rel)) return 'middleware'
  if (/app\/\(auth\)\//.test(rel) && /page\.tsx$/.test(rel)) return 'appPage'
  if (/app\/\(pos\)\//.test(rel) && /page\.tsx$/.test(rel)) return 'appPage'
  if (/app\/\(dashboard\)\//.test(rel) && /page\.tsx$/.test(rel)) return 'appPage'
  if (/app\/.*\/layout\.tsx$/.test(rel) || /app\/layout\.tsx$/.test(rel)) return 'layoutComponent'
  if (/components\/layout\//.test(rel)) return 'layoutComponent'
  if (/components\/ui\//.test(rel)) return 'uiComponent'
  if (/components\//.test(rel)) return 'featureComponent'
  if (/lib\/(constants|config)\//.test(rel)) return 'libConstants'
  if (/lib\/validations\//.test(rel)) return 'libValidation'
  if (/lib\/hooks\//.test(rel)) return 'libHook'
  if (/lib\/stores\//.test(rel)) return 'libStore'
  if (/lib\/db\//.test(rel)) return 'libDb'
  if (/lib\/utils\//.test(rel)) return 'libUtils'
  if (/lib\/types\//.test(rel)) return 'libTypes'
  if (/lib\//.test(rel)) return 'libService'
  return 'config'
}

function moduleOfRel(rel) {
  const segments = rel.split(/[\\/]/)
  for (const seg of segments) {
    if (MODULE_LABELS[seg]) return seg
  }
  return null
}

function scan(srcDir, e2eDir) {
  const sources = []
  if (fs.existsSync(srcDir)) sources.push(srcDir)
  if (fs.existsSync(e2eDir)) sources.push(e2eDir)

  const allAbs = []
  for (const base of sources) {
    for (const abs of walk(base)) {
      if (!/\.(ts|tsx|js|mjs|css)$/.test(abs)) continue
      allAbs.push(abs)
    }
  }

  const classified = []
  const moduleStats = {}
  const placeholders = []
  const apiRoutes = []
  const appPages = []

  for (const abs of allAbs) {
    const rel = path.relative(process.cwd(), abs).split(path.sep).join('/')
    const kind = kindOf(rel)
    const mod = moduleOfRel(rel)

    const entry = {
      rel,
      abs,
      kind,
      module: mod,
      kindLabel: FILE_KIND_LABELS[kind],
    }

    if (kind === 'appPage' || kind === 'apiRoute') {
      const content = contentOf(abs)
      const ph = content.match(/Coming in Phase (\d+)/)
      if (ph) {
        entry.placeholder = true
        entry.placeholderPhase = Number(ph[1])
        placeholders.push(entry)
      }
      if (kind === 'apiRoute') apiRoutes.push(entry)
      if (kind === 'appPage') appPages.push(entry)
    }

    if (mod) {
      moduleStats[mod] = (moduleStats[mod] || 0) + 1
    }
    classified.push(entry)
  }

  return {
    files: classified,
    moduleStats,
    placeholders,
    apiRoutes,
    appPages,
  }
}

module.exports = { scan, MODULE_LABELS, FILE_KIND_LABELS }