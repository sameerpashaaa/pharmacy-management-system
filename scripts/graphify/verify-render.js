'use strict'

/**
 * Graphify — render verification.
 *
 * Opens the generated offline viewer in headless Chromium (via the project's
 * Playwright install) and renders every Mermaid graph, reporting any graph
 * that fails to parse or crashes the Mermaid renderer.
 *
 * Usage:
 *   node scripts/graphify/verify-render.js
 */

const { chromium } = require('playwright')
const path = require('path')
const url = require('url')

const viewer = path.resolve(__dirname, '..', '..', 'documentation', 'graphify', 'viewer.html')

async function main() {
  const fileUrl = url.pathToFileURL(viewer).href
  const browser = await chromium.launch()

  try {
    const page = await browser.newPage()
    const consoleErrors = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto(fileUrl)

    const results = await page.evaluate(async () => {
      const payload = JSON.parse(document.getElementById('graphify-payload').textContent)
      const out = []
      for (const g of payload) {
        const id = 'vrfy_' + g.id.replace(/[^a-zA-Z0-9]/g, '_')
        try {
          const { svg } = await mermaid.render(id, g.mermaid)
          out.push({ id: g.id, ok: true, hasSvg: /<svg/.test(svg) })
        } catch (e) {
          out.push({
            id: g.id,
            ok: false,
            error: (e && e.message ? e.message : String(e)).slice(0, 800),
          })
        }
      }
      return out
    })

    let failed = 0
    console.log('')
    console.log('Graphify render check (headless Chromium)')
    console.log('------------------------------------------')
    for (const r of results) {
      if (r.ok) console.log(`   PASS  ${r.id}`)
      else {
        failed++
        console.log(`   FAIL  ${r.id}`)
        console.log('         ' + (r.error || 'unknown error').split('\n').join('\n         '))
      }
    }
    console.log('')
    console.log(`   ${results.length - failed}/${results.length} graphs rendered successfully.`)

    const pageErrors = consoleErrors.filter((e) => !/favicon|net::ERR/i.test(e))
    if (pageErrors.length) {
      console.log('')
      console.log(`   Browser console errors (${pageErrors.length}):`)
      for (const e of pageErrors.slice(0, 10)) console.log('     - ' + e.slice(0, 300))
    }

    if (failed > 0 || pageErrors.length > 0) process.exitCode = 1
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('Graphify render check could not run:', err.message)
  console.error('Ensure Playwright browsers are installed (`npx playwright install chromium`).')
  process.exit(1)
})
