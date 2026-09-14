'use strict'

/**
 * Graphify — render helpers.
 *
 * Writes:
 *   - documentation/graphify/viewer.html  (single-file offline viewer)
 *   - documentation/graphify/README.md    (how-to guide)
 */

const fs = require('fs')
const path = require('path')

function relViewerPath(outDir, file) {
  return path.relative(outDir, file).split(path.sep).join('/')
}

function jsonPayload(graphs) {
  const payload = graphs.map((g) => ({
    id: g.id,
    title: g.title,
    group: g.group || 'System',
    groupOrder: g.groupOrder || 99,
    accent: g.accent || '#16a34a',
    description: g.description || '',
    sourceFiles: g.sourceFiles || [],
    file: g.file || '',
    mermaid: g.mermaid,
  }))
  // Escape "<" so the JSON never terminates the surrounding <script> tag.
  return JSON.stringify(payload, null, 1).replace(/</g, '\\u003c')
}

function writeViewer(graphs, outDir) {
  const template = fs.readFileSync(path.join(__dirname, '..', 'templates', 'viewer.html'), 'utf8')
  const generated = new Date().toISOString().slice(0, 10)
  let html = template
  html = html.replace('__GRAPHS_JSON__', jsonPayload(graphs))
  html = html.replace('__GENERATED__', generated)
  const file = path.join(outDir, 'viewer.html')
  fs.writeFileSync(file, html, 'utf8')
  return file
}

function writeReadme(graphs, outDir, viewerOk, projectRoot) {
  const byGroup = {}
  for (const g of graphs) {
    byGroup[g.group] = byGroup[g.group] || []
    byGroup[g.group].push(g)
  }

  const graphRows = []
  let idx = 0
  for (const groupName of Object.keys(byGroup)) {
    graphRows.push(`### ${groupName}`)
    graphRows.push('')
    graphRows.push('| # | Graph | Markdown |')
    graphRows.push('|---|-------|----------|')
    for (const g of byGroup[groupName]) {
      idx++
      graphRows.push(
        `| ${idx} | **${g.title}** — ${g.description} | [\`graphs/${g.id}.md\`](graphs/${g.id}.md) |`
      )
    }
    graphRows.push('')
  }

  const viewerNote = viewerOk
    ? 'Embedded in the viewer is a local copy of Mermaid — no internet required.'
    : '> The offline viewer needs the Mermaid bundle. Run `npm install` first, then `npm run graphify` (it copies `node_modules/mermaid/dist/mermaid.min.js` to `assets/`).'

  const readme = `# Graphify — PharmaCare Architecture Documentation

> Locally generated architecture & database diagrams for the PharmaCare
> pharmacy-management-system, built **from the actual source code**
> (\`prisma/schema.prisma\` + \`src/**\`). Nothing is hand-drawn, and nothing
> is pushed to GitHub.

---

## 1 · What Graphify does here

Graphify is a **project-local visualization tool** (all code lives in
\`scripts/graphify/\`). It:

- **Parses the real Prisma schema** (\`prisma/schema.prisma\`) to produce
  entity-relationship diagrams with models, primary keys, foreign keys,
  cardinality and enums.
- **Scans the real \`src/\` tree** (App Router pages, API routes, components,
  domain services) to produce the system architecture, module map and
  business-flow diagrams.
- **Marks reality honestly**: implemented flows (products, inventory,
  batches, expiry, POS/sales, auth) vs. designed-but-not-yet-built modules
  (purchases, returns, finance, GST, reports — their pages are
  "Coming in Phase N" placeholders).

It renders diagrams as **Mermaid** and emits both Markdown files and a
single-file HTML viewer so any developer can open the docs in a browser
without installing anything extra.

---

## 2 · Where the graphs live

\`\`\`
documentation/
└── graphify/
    ├── README.md          ← this file
    ├── viewer.html        ← single-file interactive viewer (open in a browser)
    ├── assets/
    │   └── mermaid.min.js ← offline renderer bundle (copied from node_modules)
    └── graphs/
        ├── system-architecture.md
        ├── module-map.md
        ├── database-overview.md
        ├── database-erd-identity-access.md
        ├── database-erd-catalog-inventory.md
        ├── database-erd-commerce-finance.md
        ├── auth-flow.md
        ├── sales-flow.md
        ├── purchase-flow.md
        ├── reporting-flow.md
        └── testing-architecture.md
\`\`\`

---

## 3 · How to regenerate

Requirements: **Node.js ≥ 18** (the project already needs it) and the
dependencies installed (\`npm install\`).

\`\`\`bash
npm run graphify          # regenerate everything (markdown + viewer)
npm run graphify:build    # same as \`graphify\`
npm run graphify:watch    # regenerate automatically while you edit src/ or schema
\`\`\`

---

## 4 · How to view it locally

Fastest: open the generated viewer in a browser.

\`\`\`bash
npm run graphify:view     # regenerates, then opens viewer.html in your default browser
\`\`\`

Or manually open \`documentation/graphify/viewer.html\` (double-click /
\`start documentation\\graphify\\viewer.html\`). ${viewerOk ? 'The viewer is fully self-contained and works offline.' : ''}

The **Markdown** files under \`documentation/graphify/graphs/\` also render
anywhere Mermaid is supported: VS Code (Mermaid extension), Obsidian, Typora,
GitLab/GitHub markdown, etc.

---

## 5 · What each graph represents

${graphRows.join('\n')}

---

## 6 · Where the data comes from

| Graph | Input source(s) |
|---|---|
| System Architecture | \`src/app/**\`, \`src/components/**\`, \`src/lib/**\`, \`src/middleware.ts\`, \`next.config.js\`, \`package.json\` |
| Module / Feature Map | \`src/components/layout/sidebar.tsx\`, \`src/app/**\`, \`src/app/api/**\`, \`src/lib/**\`, \`prisma/schema.prisma\` |
| Database overview + ERDs | \`prisma/schema.prisma\` (models, attributes, \`@relation\`, enums) |
| Authentication flow | \`src/lib/auth/auth-config.ts\`, \`src/lib/auth/auth-helpers.ts\`, \`src/middleware.ts\`, \`src/app/(auth)/login/**\`, seed role/permission files |
| Sales / POS flow | \`src/lib/sales/sales-service.ts\`, \`src/lib/sales/pricing.ts\`, \`src/lib/batches/fefo-service.ts\`, \`src/app/api/pos/**\`, \`src/components/pos/**\` |
| Purchase flow | \`prisma/schema.prisma\` (schema-only — Phase 4 not started) |
| Reporting flow | \`src/app/(dashboard)/page.tsx\`, \`src/app/(dashboard)/reports/**\`, \`src/lib/constants/permissions.ts\` |
| Testing architecture | \`jest.config.ts\`, \`playwright.config.ts\`, \`e2e/**\`, \`src/**/*.test.ts(x)\`, \`.github/workflows/ci.yml\` |

The generator itself is deterministic: it parses files (no guessing), so the
diagrams stay accurate as long as the code changes.

---

## 7 · Updating the diagrams when the architecture changes

1. **Just regenerate** — most changes (new pages, routes, models, relations)
   are picked up automatically by the parsers. Run \`npm run graphify:watch\`
   while working, or \`npm run graphify\` when you finish.
2. **Frequency** — regenerate before committing non-trivial architecture
   changes so the docs never drift far from the code.
3. **If a graph misses something** — the generators are small, plain-JS
   modules under \`scripts/graphify/graphs/*.js\`; the ERD logic is derived
   from \`scripts/graphify/lib/prisma-schema-parser.js\` and the module map
   from \`scripts/graphify/lib/modules.js\`. Everything is documented in-code.
4. The generated \`graphs/*.md\`, \`viewer.html\` and \`README.md\` are
   outputs — prefer editing the **generator**, not the outputs.

---

## 8 · Notes & limitations

- This is strictly a **documentation / visualization** capability. It adds no
  runtime code to the application, changes no UI, no API, no schema.
- The upstream \`Graphify-Labs\` CLI (\`graphifyy\`, a Python + \`uv\` tool for
  AI assistants) is intentionally **not** used: it requires Python 3.12 +
  \`uv\`, which is not present on this machine, and its non-code passes expect
  an AI model API. A deterministic, dependency-light local generator covers
  this project's needs and runs anywhere the repo already runs.
- The Mermaid viewer asset is git-ignored; it is re-created on every
  \`npm run graphify\`.
`

  fs.writeFileSync(path.join(outDir, 'README.md'), readme, 'utf8')
}

module.exports = { writeViewer, writeReadme, jsonPayload, relViewerPath }
