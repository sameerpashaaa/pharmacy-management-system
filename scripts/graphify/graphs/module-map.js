'use strict'

const { nodeId, q, classDefs } = require('../lib/mermaid')
const { computeModuleStats, STATUS_META } = require('../lib/modules')

/**
 * Graphify — Module / Feature Map.
 *
 * Every business module in the PharmaCare navigation, with an honest status
 * derived from the codebase (pages/APIs/services/schema). Modules shown as
 * LIVE have real pages, API routes and services. DESIGNED modules exist in
 * the Prisma schema but have no application code yet (their pages are
 * "Coming in Phase N" placeholders).
 */

module.exports = function buildModuleMap(ctx) {
  const per = computeModuleStats(ctx)

  const byGroup = { live: [], partial: [], service: [], design: [], misc: [] }
  for (const key of Object.keys(per)) {
    if (['dashboard', 'middleware', 'hsn-codes'].includes(key)) continue
    byGroup[per[key].status].push(per[key])
  }

  const sortByLabel = (a, b) => a.label.localeCompare(b.label)

  const lines = ['flowchart TB']
  lines.push(
    classDefs({
      ...Object.fromEntries(Object.entries(STATUS_META).map(([k, v]) => [`s_${k}`, v.css])),
    })
  )
  lines.push('')

  let idx = 0
  const rank = (label) => {
    const id = 'mod_' + nodeId(label)
    return id
  }

  const groups = [
    { key: 'live', title: 'IMPLEMENTED — real pages, API routes & services' },
    { key: 'partial', title: 'PARTIAL — services / API exist, pages are placeholders' },
    { key: 'service', title: 'SERVICE-ONLY — reusable domain logic, UI comes in a later phase' },
    {
      key: 'design',
      title: 'DESIGNED — Prisma schema models exist, application code is a future phase',
    },
    { key: 'misc', title: 'SUPPORT — constants, hooks, utilities' },
  ]

  const states = {}

  for (const g of groups) {
    const items = byGroup[g.key].slice().sort(sortByLabel)
    if (items.length === 0) continue
    const body = []
    for (const m of items) {
      const id = rank(m.label)
      states[id] = `s_${g.key}`
      const extra = []
      if (m.api > 0) extra.push(`${m.api} api`)
      if (m.lib > 0) extra.push(`${m.lib} svc`)
      if (m.models > 0) extra.push(`${m.models} models`)
      if (m.pages > 0) extra.push(`${m.pages} page${m.pages > 1 ? 's' : ''}`)
      const hint = extra.length ? ' · ' + extra.join(' · ') : ''
      body.push(`  ${id}[${q(m.label + hint)}]:::s_${g.key}`)
    }
    lines.push(...['', `subgraph G_${g.key}_${idx}[${q(g.title)}]`, ...body, 'end'])
    idx++
  }

  for (const key of Object.keys(states)) {
    lines.push(`class ${key} ${states[key]}`)
  }

  // Legend
  lines.push(
    '',
    'subgraph LEG["Legend"]',
    '  Lv[Live]:::s_live',
    '  Lp[Partial]:::s_partial',
    '  Ls[Service only]:::s_service',
    '  Ld[Designed / schema only]:::s_design',
    'end'
  )

  const mermaid = lines.join('\n')

  return {
    id: 'module-map',
    title: 'Module / Feature Map',
    group: 'System',
    groupOrder: 2,
    accent: '#2563eb',
    description:
      'Business modules shown in the PharmaCare navigation with their real implementation status. Status is derived from the codebase: pages (are they placeholders?), API route handlers, domain services and Prisma models per module.',
    sourceFiles: [
      'src/components/layout/sidebar.tsx (navigation)',
      'src/app/** (pages)',
      'src/app/api/** (API routes)',
      'src/lib/** (services)',
      'prisma/schema.prisma (models per module)',
    ],
    mermaid,
  }
}
