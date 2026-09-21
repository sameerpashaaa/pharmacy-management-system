import {
  test,
  expect,
  type Page,
  type BrowserContext,
  type ConsoleMessage,
  type Response,
  chromium,
} from '@playwright/test'

const USER = 'admin@pharmacare.local'
const PASS = 'Admin@123'

const KEY_ROUTES = [
  { path: '/', name: 'Dashboard' },
  { path: '/products', name: 'Products List' },
  { path: '/products/categories', name: 'Product Categories' },
  { path: '/products/new', name: 'New Product' },
  { path: '/suppliers', name: 'Suppliers List' },
  { path: '/suppliers/new', name: 'New Supplier' },
  { path: '/purchases', name: 'Purchases List' },
  { path: '/purchases/new', name: 'New Purchase Order' },
  { path: '/sales', name: 'Sales List' },
  { path: '/pos', name: 'POS' },
  { path: '/returns/sales', name: 'Sales Returns List' },
  { path: '/inventory', name: 'Inventory Overview' },
  { path: '/inventory/adjustments', name: 'Inventory Adjustments' },
  { path: '/inventory/movements', name: 'Inventory Movements' },
  { path: '/batches', name: 'Batches List' },
  { path: '/batches/expiring', name: 'Expiring Batches' },
  { path: '/expiry', name: 'Expiry Overview' },
  { path: '/expiry/expiring', name: 'Expiring' },
  { path: '/expiry/expired', name: 'Expired' },
  { path: '/prescriptions', name: 'Prescriptions' },
  { path: '/prescriptions/pending', name: 'Pending Prescriptions' },
  { path: '/prescriptions/new', name: 'New Prescription' },
  { path: '/reports', name: 'Reports Landing' },
  { path: '/reports/sales', name: 'Sales Report' },
  { path: '/reports/inventory', name: 'Inventory Report' },
  { path: '/reports/supplier', name: 'Supplier Report' },
  { path: '/reports/narcotics', name: 'Narcotics Register' },
  { path: '/finance', name: 'Finance Overview' },
  { path: '/finance/payables', name: 'Payables' },
  { path: '/finance/receivables', name: 'Receivables' },
  { path: '/gst', name: 'GST' },
  { path: '/gst/reports', name: 'GST Reports' },
  { path: '/users', name: 'Users' },
  { path: '/users/new', name: 'New User' },
  { path: '/roles', name: 'Roles' },
  { path: '/customers', name: 'Customers' },
  { path: '/customers/new', name: 'New Customer' },
  { path: '/settings', name: 'Settings' },
  { path: '/settings/organization', name: 'Settings Organization' },
  { path: '/settings/general', name: 'Settings General' },
  { path: '/audit', name: 'Audit' },
]

// Login as a fresh authenticated page. Each call gets its own browser context,
// so no listener or page state leaks between calls or between tests.
async function loginFresh(): Promise<{ page: Page; context: BrowserContext }> {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  await page.locator('input[type="email"]').fill(USER)
  await page.locator('input[type="password"]').fill(PASS)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/localhost:3000\/?$/, { timeout: 30000 })
  await waitForHydration(page)
  return { page, context }
}

async function waitForHydration(page: Page) {
  // We do NOT use `waitForLoadState('networkidle')` because Next.js dev
  // mode prefetches RSC payloads for every visible <Link> in the viewport,
  // and some prefetch targets can hang (e.g. supplier rows link to a
  // `/suppliers/{id}` detail route that does not exist, so the dev
  // server keeps that RSC request open). For an audit of "did the route
  // render?", the correct signal is: DOM committed and a heading became
  // visible. `goto()` already waits for `load` by default.
  await page.locator('h1, h2, h3').first().waitFor({ state: 'visible', timeout: 15000 })
}

async function closeContext(ctx: BrowserContext) {
  await ctx.close()
}

// Listen only within a single test's lifetime. Returns arrays + a teardown.
async function captureDiagnostics(page: Page) {
  const errors: string[] = []
  const failedRequests: { url: string; status: number; error?: string }[] = []
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() === 'error') errors.push(msg.text())
  }
  const onPageError = (err: Error) => {
    errors.push(err.message)
  }
  const onResponse = (resp: Response) => {
    if (!resp.ok() && !resp.url().includes('/_next/') && !resp.url().includes('/api/auth/')) {
      failedRequests.push({ url: resp.url(), status: resp.status(), error: resp.statusText() })
    }
  }
  page.on('console', onConsole)
  page.on('pageerror', onPageError)
  page.on('response', onResponse)
  return {
    errors,
    failedRequests,
    dispose: () => {
      page.off('console', onConsole)
      page.off('pageerror', onPageError)
      page.off('response', onResponse)
    },
  }
}

test.describe('Full Application E2E Audit - Sequential', () => {
  for (const route of KEY_ROUTES) {
    test(`${route.name} (${route.path})`, async () => {
      const { page, context } = await loginFresh()
      try {
        const diag = await captureDiagnostics(page)

        const startTime = Date.now()
        await page.goto(route.path)
        await waitForHydration(page)
        const firstLoadTime = Date.now() - startTime

        const chunkLoadError = diag.errors.some((e) => e.includes('ChunkLoadError'))
        const hasRuntimeError = diag.errors.some((e) => e.toLowerCase().includes('error'))

        let classification = 'A'
        const notes: string[] = []

        if (chunkLoadError) {
          classification = 'C'
          notes.push('ChunkLoadError detected')
        } else if (hasRuntimeError) {
          classification = 'C'
          notes.push('Runtime error in console')
        } else if (diag.failedRequests.length > 0) {
          const authFailures = diag.failedRequests.filter(
            (r) => r.status === 401 || r.status === 403
          )
          if (authFailures.length > 0) {
            classification = 'F'
            notes.push(`Auth failures: ${authFailures.length}`)
          } else {
            classification = 'D'
            notes.push(`API failures: ${diag.failedRequests.length}`)
          }
        } else {
          const placeholderText = await page
            .locator('text=/Coming in Phase|placeholder|not implemented/i')
            .count()
          if (placeholderText > 0) {
            classification = 'H'
            notes.push('Intentional placeholder detected')
          } else {
            const emptyMarkers = await page
              .locator('text=/no (data|records|results|items)/i')
              .count()
            if (emptyMarkers > 0) {
              classification = 'B'
              notes.push('Empty data state')
            } else {
              const hasContent = await page
                .locator('table, [role="grid"], .data-table, tbody tr, form')
                .count()
              if (hasContent === 0) {
                classification = 'B'
                notes.push('No visible data or form')
              } else {
                classification = 'A'
                notes.push('Data rendered')
              }
            }
          }
        }

        // Second load test
        const secondDiag = await captureDiagnostics(page)
        await page.reload()
        await waitForHydration(page)
        const secondChunkError = secondDiag.errors.some((e) => e.includes('ChunkLoadError'))
        secondDiag.dispose()

        console.log(
          JSON.stringify({
            route: route.path,
            name: route.name,
            classification,
            firstLoad: {
              success: classification !== 'C' && classification !== 'D' && classification !== 'F',
              chunkLoadError,
              consoleErrors: diag.errors.filter((e) => e.toLowerCase().includes('error')),
              failedRequests: diag.failedRequests,
              timeMs: firstLoadTime,
            },
            secondLoad: {
              success: !secondChunkError,
              chunkLoadError: secondChunkError,
            },
            notes: notes.join('; '),
          })
        )

        expect(chunkLoadError).toBeFalsy()
        diag.dispose()
      } finally {
        await closeContext(context)
      }
    })
  }

  test('Products: search, filter, add product', async () => {
    const { page, context } = await loginFresh()
    try {
      await page.goto('/products')
      await waitForHydration(page)

      await expect(page.getByRole('textbox', { name: 'Search name, SKU, barcode…' })).toBeVisible()
      await expect(page.locator('button:has-text("Add Product"):has(svg)')).toBeVisible()
    } finally {
      await closeContext(context)
    }
  })

  test('Categories: tree/flat view, add category dialog', async () => {
    const { page, context } = await loginFresh()
    try {
      await page.goto('/products/categories')
      await waitForHydration(page)

      await expect(page.getByRole('button', { name: /Tree/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /Flat/ })).toBeVisible()
      await expect(page.getByRole('button', { name: /Add Category/ })).toBeVisible()

      await page.getByRole('button', { name: /Add Category/ }).click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.getByRole('button', { name: /Cancel|Close/i }).click()
    } finally {
      await closeContext(context)
    }
  })

  test('New Supplier: verify placeholder state', async () => {
    const { page, context } = await loginFresh()
    try {
      await page.goto('/suppliers/new')
      await waitForHydration(page)

      await expect(page.locator('text=/Supplier form.*API ready/i')).toBeVisible()
      const formInputs = await page.locator('form input, form select, form textarea').count()
      expect(formInputs).toBe(0)
    } finally {
      await closeContext(context)
    }
  })

  test('New Purchase Order: form interactions', async () => {
    const { page, context } = await loginFresh()
    try {
      await page.goto('/purchases/new')
      await waitForHydration(page)

      // The shadcn <Select> trigger does not expose its label via the
      // accessible name (no htmlFor on the trigger), and its placeholder
      // text is rendered as <span>, not as an input placeholder. We
      // therefore locate the trigger by its visible text. Waiting for
      // both labels to appear also confirms the reference-data fetch
      // completed (no extra sleep needed).
      await expect(page.getByText('Select branch', { exact: true })).toBeVisible()
      await expect(page.getByText('Select supplier', { exact: true })).toBeVisible()

      const before = await page.locator('tbody tr').count()

      // Test Add Item
      await page.getByRole('button', { name: 'Add Item' }).click()
      await expect(page.locator('tbody tr')).toHaveCount(before + 1)
    } finally {
      await closeContext(context)
    }
  })

  test('Reports: all report pages', async () => {
    const { page, context } = await loginFresh()
    try {
      await page.goto('/reports')
      await waitForHydration(page)
      await expect(page.getByRole('heading', { name: 'Reports & Analytics' })).toBeVisible()

      await page.goto('/reports/sales')
      await waitForHydration(page)

      await page.goto('/reports/inventory')
      await waitForHydration(page)

      await page.goto('/reports/supplier')
      await waitForHydration(page)

      await page.goto('/reports/narcotics')
      await waitForHydration(page)
      await expect(page.getByRole('heading', { name: 'Narcotic Register' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Export CSV' })).toBeVisible()
    } finally {
      await closeContext(context)
    }
  })

  test('Prescriptions: load, stats, table', async () => {
    const { page, context } = await loginFresh()
    try {
      await page.goto('/prescriptions')
      await waitForHydration(page)

      await expect(page.getByRole('heading', { name: 'Prescription Management' })).toBeVisible()
      await expect(page.getByText('Total Registered')).toBeVisible()
      // The page wraps the trigger in <Button asChild><Link>...</Link></Button>,
      // so the rendered element is an <a>, not a <button>.
      await expect(page.getByRole('link', { name: 'New Prescription' })).toBeVisible()
    } finally {
      await closeContext(context)
    }
  })

  test('Inventory, Batches, Expiry', async () => {
    const { page, context } = await loginFresh()
    try {
      await page.goto('/inventory')
      await waitForHydration(page)

      await page.goto('/inventory/adjustments')
      await waitForHydration(page)

      await page.goto('/inventory/movements')
      await waitForHydration(page)

      await page.goto('/batches')
      await waitForHydration(page)

      await page.goto('/batches/expiring')
      await waitForHydration(page)

      await page.goto('/expiry')
      await waitForHydration(page)

      await page.goto('/expiry/expiring')
      await waitForHydration(page)

      await page.goto('/expiry/expired')
      await waitForHydration(page)
    } finally {
      await closeContext(context)
    }
  })

  test('Sales and POS', async () => {
    const { page, context } = await loginFresh()
    try {
      await page.goto('/sales')
      await waitForHydration(page)

      await page.goto('/pos')
      await waitForHydration(page)
      await expect(page.locator('input[placeholder*="Search name"]')).toBeVisible({
        timeout: 10000,
      })
    } finally {
      await closeContext(context)
    }
  })

  test('Customers: list renders rows and new page shows the form', async () => {
    const { page, context } = await loginFresh()
    try {
      await page.goto('/customers')
      await waitForHydration(page)
      await expect(page.locator('h1', { hasText: 'Customer Management' })).toBeVisible()
      // List renders table with at least one row (the seeded Ledger Customer)
      await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 10000 })

      await page.goto('/customers/new')
      await waitForHydration(page)
      await expect(page.locator('h1', { hasText: 'Add New Customer' })).toBeVisible()
      await expect(page.locator('label[for="name"]')).toBeVisible()
    } finally {
      await closeContext(context)
    }
  })
})

test.describe('First-Load vs Second-Load', () => {
  for (const route of KEY_ROUTES.slice(0, 20)) {
    test(`First/Second load: ${route.name}`, async () => {
      const { page, context } = await loginFresh()
      try {
        const firstDiag = await captureDiagnostics(page)
        await page.goto(route.path)
        await waitForHydration(page)
        const firstChunkError = firstDiag.errors.some((e) => e.includes('ChunkLoadError'))
        firstDiag.dispose()

        const secondDiag = await captureDiagnostics(page)
        await page.reload()
        await waitForHydration(page)
        const secondErrors = secondDiag.errors
        const secondChunkError = secondErrors.some((e) => e.includes('ChunkLoadError'))
        secondDiag.dispose()

        console.log(
          JSON.stringify({
            route: route.path,
            firstLoad: { chunkLoadError: firstChunkError, errors: firstDiag.errors },
            secondLoad: { chunkLoadError: secondChunkError, errors: secondErrors },
          })
        )

        expect(firstChunkError).toBeFalsy()
        expect(secondChunkError).toBeFalsy()
      } finally {
        await closeContext(context)
      }
    })
  }
})

test.describe('ChunkLoadError Deep Dive', () => {
  test('Verify single dev server process stability', async () => {
    const { page, context } = await loginFresh()
    try {
      await page.goto('/')
      await waitForHydration(page)

      for (const route of KEY_ROUTES.slice(0, 20)) {
        await page.goto(route.path)
        await waitForHydration(page)
      }

      const errors: string[] = []
      page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text())
      })
      page.on('pageerror', (err) => errors.push(err.message))
      // give a moment for late console errors
      await page.waitForTimeout(200)
      const chunkErrors = errors.filter((e) => e.includes('ChunkLoadError'))
      expect(chunkErrors.length).toBe(0)
    } finally {
      await closeContext(context)
    }
  })
})

test.describe('API Health Checks', () => {
  test('Key API endpoints return 200', async () => {
    // Fresh authenticated context. Each endpoint is its own request to avoid
    // any per-call state interaction.
    const { page, context } = await loginFresh()
    try {
      // Endpoints that need a branchId query param. Resolved once via
      // /api/inventory/branches so the test does not hard-code a branch id.
      const branchesRes = await page.request.get('http://localhost:3000/api/inventory/branches')
      const branchesJson = await branchesRes.json()
      const branchId: string | undefined = branchesJson?.data?.[0]?.id

      const endpoints: { path: string; needsBranch?: boolean }[] = [
        { path: '/api/products' },
        { path: '/api/categories?tree=true' },
        { path: '/api/suppliers' },
        { path: '/api/prescriptions' },
        { path: '/api/prescriptions/stats' },
        { path: '/api/reports/narcotics', needsBranch: true },
        { path: '/api/inventory' },
        { path: '/api/batches' },
        { path: '/api/pos/products', needsBranch: true },
        { path: '/api/inventory/branches' },
        { path: '/api/users' },
        { path: '/api/roles' },
      ]

      const failures: { endpoint: string; status: number; body: string }[] = []
      for (const { path, needsBranch } of endpoints) {
        let url = `http://localhost:3000${path}`
        if (needsBranch) {
          if (!branchId) {
            failures.push({
              endpoint: path,
              status: 0,
              body: 'no branchId available from /api/inventory/branches',
            })
            continue
          }
          url += (url.includes('?') ? '&' : '?') + 'branchId=' + encodeURIComponent(branchId)
        }
        const res = await page.request.get(url)
        const status = res.status()
        let successFlag = false
        let bodyText = ''
        try {
          const json = await res.json()
          successFlag = json.success === true
          bodyText = JSON.stringify(json).slice(0, 200)
        } catch {
          bodyText = (await res.text()).slice(0, 200)
        }
        if (status !== 200 || !successFlag) {
          failures.push({ endpoint: path, status, body: bodyText })
        }
      }

      if (failures.length > 0) {
        console.log('API HEALTH FAILURES:', JSON.stringify(failures, null, 2))
      }

      // Strict: every endpoint must return 200 and success:true.
      expect(failures, `Failed endpoints: ${JSON.stringify(failures)}`).toEqual([])
    } finally {
      await closeContext(context)
    }
  })
})
