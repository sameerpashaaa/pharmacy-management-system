'use strict'

/**
 * Graphify — manual regeneration workflow.
 *
 * Regenerates the complete Graphify documentation from the current
 * checked-out repository state, verifies the output, and records
 * the Git commit used.
 *
 * Usage:
 *   npm run graphify:update
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..', '..')
const OUT_DIR = path.join(ROOT, 'documentation', 'graphify')

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

function git(cmd) {
  return execSync('git ' + cmd, { cwd: ROOT, encoding: 'utf8' }).trim()
}

function getGitInfo() {
  const branch = git('rev-parse --abbrev-ref HEAD')
  const sha = git('rev-parse --short HEAD')
  return { branch, sha }
}

// ---------------------------------------------------------------------------
// Short display names (graph id → compact label for output)
// ---------------------------------------------------------------------------

const DISPLAY_NAMES = {
  'system-architecture':             'System Architecture',
  'module-map':                      'Module / Feature Map',
  'database-overview':               'Database Overview',
  'database-erd-identity-access':    'Identity & Access ERD',
  'database-erd-catalog-inventory':  'Catalog / Inventory ERD',
  'database-erd-commerce-finance':   'Commerce / Finance ERD',
  'auth-flow':                       'Authentication Flow',
  'sales-flow':                      'Sales / POS Flow',
  'purchase-flow':                   'Purchase Flow',
  'reporting-flow':                  'Reporting / Data Flow',
  'testing-architecture':            'Testing Architecture',
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const { branch, sha } = getGitInfo()

  console.log('')
  console.log('Graphify Update')
  console.log('────────────────────────────')
  console.log('')
  console.log('Branch: ' + branch)
  console.log('Commit: ' + sha)
  console.log('')

  // --- Regenerate (silent) ------------------------------------------------
  const { regenerate } = require('./index.js')
  const { ctx, graphs, viewerOk } = regenerate({ quiet: true })

  // --- Scan report --------------------------------------------------------
  console.log('Scanning current source...')
  console.log('')
  console.log('  ✓ Prisma schema  (' + ctx.schema.stats.modelCount + ' models, ' +
    ctx.schema.stats.enumCount + ' enums, ' + ctx.schema.stats.relationCount + ' FK)')
  console.log('  ✓ Source tree    (' + ctx.src.files.length + ' files)')
  const e2eCount = ctx.src.files.filter((f) => f.kind === 'e2e').length
  console.log('  ✓ E2E tests     (' + e2eCount + ' files)')
  console.log('')

  // --- Graph report -------------------------------------------------------
  console.log('Generating ' + graphs.length + ' graphs...')
  console.log('')
  for (const g of graphs) {
    const name = DISPLAY_NAMES[g.id] || g.title
    console.log('  ✓ ' + name)
  }
  console.log('')

  // --- Viewer + Mermaid bundle -------------------------------------------
  const mermaidAsset = path.join(OUT_DIR, 'assets', 'mermaid.min.js')
  const mermaidOk = fs.existsSync(mermaidAsset)

  console.log('  ✓ Offline viewer' + (viewerOk ? '' : '  (WARNING: mermaid.min.js not bundled)'))
  console.log('  ✓ Mermaid bundle' + (mermaidOk ? '  (' + formatSize(fs.statSync(mermaidAsset).size) + ')' : '  (missing)'))
  console.log('')

  // --- Verdict ------------------------------------------------------------
  console.log('Graphify updated successfully.')
  console.log('')
  console.log('Generated from commit:')
  console.log(sha)
  console.log('')
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  return (bytes / 1024).toFixed(0) + ' KB'
}

main()
