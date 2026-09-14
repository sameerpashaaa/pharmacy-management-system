'use strict'

const { nodeId, q, classDefs } = require('../lib/mermaid')
const { MODEL_TO_MODULE, STATUS_META } = require('../lib/modules')

/**
 * Graphify — Database ERD.
 *
 * Generates four graph documents directly from the real Prisma schema:
 *
 *  1. database-overview  — flowchart grouping all models by module
 *  2. database-erd-identity-access   — ERD (User, Role, Permission, Branch, Org, AuditLog, …)
 *  3. database-erd-catalog-inventory — ERD (Product, Category, HSN, Batch, Inventory, …)
 *  4. database-erd-commerce-finance  — ERD (Sale, Payment, Purchase, Customer, Supplier, Ledger, …)
 *
 * Models, attributes and FK relations are all parsed from schema.prisma —
 * nothing is hand-invented.
 */

const ERD_GROUPS = [
  {
    id: 'identity-access',
    title: 'Identity & Access, Organization, Audit & Config',
    modules: ['auth', 'roles', 'organization', 'audit', 'settings', 'notifications', 'files'],
    enums: [], // no enums in this domain
  },
  {
    id: 'catalog-inventory',
    title: 'Catalog, Inventory & Batch Management',
    modules: ['products', 'gst', 'inventory', 'batches'],
    enums: [
      'DrugSchedule',
      'BatchStatus',
      'DisposalReason',
      'AdjustmentType',
      'AdjustmentStatus',
      'MovementType',
    ],
  },
  {
    id: 'commerce-finance',
    title: 'Sales, Purchasing, Customers, Finance & Tax',
    modules: [
      'sales',
      'pos',
      'prescriptions',
      'purchases',
      'customers',
      'suppliers',
      'returns',
      'finance',
      'notifications',
    ],
    enums: [
      'SaleStatus',
      'PaymentStatus',
      'PaymentMethod',
      'PrescriptionStatus',
      'PurchaseStatus',
      'PurchaseReturnStatus',
      'SaleReturnStatus',
      'RestockDecision',
      'CreditNoteStatus',
      'LedgerType',
      'LedgerEntryType',
      'GstTxType',
      'NotificationType',
    ],
  },
]

const SCALAR_TYPES = new Set([
  'String',
  'Int',
  'BigInt',
  'Boolean',
  'DateTime',
  'Float',
  'Decimal',
  'Json',
  'Bytes',
])

function formatAttrs(model) {
  const out = []
  for (const f of model.fields) {
    if (!SCALAR_TYPES.has(f.type)) continue
    const parts = []
    parts.push(f.isId ? 'PK' : f.isUnique ? 'UK' : '')
    parts.push(f.type)
    parts.push(f.name)
    if (f.optional) parts.push('"optional"')
    out.push(parts.join(' ').trim())
  }
  return out.join('\n    ')
}

function collectEnums(schema, names) {
  return schema.enums.filter((e) => names.includes(e.name))
}

function erdDiagram(relations, modelsInGroup, modelSet, schema) {
  const lines = ['erDiagram']
  lines.push(
    classDefs({
      pk: 'stroke:#16a34a,fill:#f0fdf4',
    })
  )
  lines.push('')

  for (const model of modelsInGroup) {
    lines.push(`    ${model.name} {`)
    lines.push('    ' + formatAttrs(model))
    lines.push('    }')
    lines.push('')
  }

  for (const rel of relations) {
    const left = rel.parent
    const right = rel.child
    if (!modelSet.has(left) || !modelSet.has(right)) continue
    const cardinality = rel.isOneToOne ? '||--||' : rel.childFieldOptional ? '||--o{' : '||--|{'
    lines.push(`    ${left} ${cardinality} ${right} : "${rel.label || rel.childField}"`)
  }

  return lines.join('\n')
}

function overviewDiagram(schema) {
  const modelModule = {}
  for (const m of schema.models) {
    const mod = MODEL_TO_MODULE[m.name] || 'other'
    modelModule[mod] = modelModule[mod] || []
    modelModule[mod].push(m.name)
  }

  const moduleOrder = [
    'auth',
    'roles',
    'organization',
    'products',
    'gst',
    'inventory',
    'batches',
    'sales',
    'pos',
    'prescriptions',
    'purchases',
    'customers',
    'suppliers',
    'returns',
    'finance',
    'notifications',
    'audit',
    'settings',
    'files',
  ]

  const lines = ['flowchart LR']
  lines.push(classDefs({ mod: 'fill:#f8fafc,stroke:#94a3b8,color:#1e293b' }))
  lines.push('')

  for (const mod of moduleOrder) {
    const models = modelModule[mod]
    if (!models || models.length === 0) continue
    const id = 'DB_' + nodeId(mod)
    const body = models.map((name) => `    ${name}[${q(name)}]:::mod`)
    lines.push(...['', `subgraph ${id}[${q(MODULE_LABELS_MOD[mod] || mod)}]`, ...body, 'end'])
  }

  return lines.join('\n')
}

// Use the same MODULE_LABELS source.
const { MODULE_LABELS } = require('../lib/source-scanner')
const MODULE_LABELS_MOD = { ...MODULE_LABELS }

module.exports = function buildDatabaseERDs(ctx) {
  const schema = ctx.schema

  const graphs = []

  // Overview
  graphs.push({
    id: 'database-overview',
    title: 'Database Overview — all ' + schema.models.length + ' models by module',
    group: 'Database',
    groupOrder: 3,
    accent: '#a21caf',
    description:
      'Every Prisma model grouped by its business module. This is a structural overview; the three following ERDs show fields and FK relations per domain.',
    sourceFiles: ['prisma/schema.prisma'],
    mermaid: overviewDiagram(schema),
  })

  // Three domain ERDs
  for (const group of ERD_GROUPS) {
    const modelSet = new Set()
    const models = []
    for (const model of schema.models) {
      const mod = MODEL_TO_MODULE[model.name]
      if (group.modules.includes(mod)) {
        modelSet.add(model.name)
        models.push(model)
      }
    }

    // Sort by module (insertion order in MODEL_TO_MODULE gives a decent order; sort by group.modules rank)
    const modRank = {}
    group.modules.forEach((m, i) => (modRank[m] = i))
    models.sort((a, b) => {
      const ra = modRank[MODEL_TO_MODULE[a.name]] ?? 99
      const rb = modRank[MODEL_TO_MODULE[b.name]] ?? 99
      return ra - rb || a.name.localeCompare(b.name)
    })

    const relations = schema.relations.filter(
      (r) => modelSet.has(r.child) && modelSet.has(r.parent)
    )
    const enums = collectEnums(schema, group.enums)

    let md = `# ${group.title}\n\n`
    md += `> Auto-generated by \`scripts/graphify\` — source of truth: \`prisma/schema.prisma\` · \`models: ${models.length}\` · \`FK relations: ${relations.length}\` · \`enums: ${enums.length}\`\n\n`
    md += '```mermaid\n' + erdDiagram(relations, models, modelSet, schema) + '\n```\n\n'

    if (enums.length > 0) {
      md += '## Enums\n\n'
      md += '| Enum | Values |\n|---|---|\n'
      for (const e of enums) {
        md += `| \`${e.name}\` | ${e.values.map((v) => '`' + v + '`').join(', ')} |\n`
      }
      md += '\n'
    }

    md += '## Models in this ERD\n\n'
    md += '| Model | Table | Fields | Notes |\n|---|---|---|---|\n'
    for (const m of models) {
      const pk = m.fields.find((f) => f.isId)
      const uk = m.fields.filter((f) => f.isUnique).length
      md += `| \`${m.name}\` | \`${m.table}\` | ${m.fields.length} | ${pk ? 'PK: `' + pk.name + '`' : ''}${uk > 0 ? ', UK: ' + uk : ''} |\n`
    }

    md += '\n'
    md += '---\n'
    md += '*Auto-generated by Graphify — do not edit. Regenerate with `npm run graphify`.*\n'

    graphs.push({
      id: 'database-erd-' + group.id,
      title: 'Database ERD — ' + group.title,
      group: 'Database',
      groupOrder: 3 + ERD_GROUPS.indexOf(group) + 1,
      accent: '#a21caf',
      description:
        'Schema-derived entity/relationship diagram for the ' +
        group.title.toLowerCase() +
        ' domain, including attributes, PKs, UKs and FK relations.',
      sourceFiles: ['prisma/schema.prisma'],
      // plain ERD body — the md includes the full doc
      mermaid: erdDiagram(relations, models, modelSet, schema),
      _fullMarkdown: md,
    })
  }

  return graphs
}
