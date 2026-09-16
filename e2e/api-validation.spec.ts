import { test, expect, type APIResponse } from '@playwright/test'

test.describe('Backend API verification (R6/R14/R15)', () => {
  test('Roles API: GET a role, create, rename, delete (R14)', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('admin@pharmacare.local')
    await page.locator('input[type="password"]').fill('Admin@123')
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/localhost:3000\/?$/, { timeout: 20000 })

    const base = 'http://localhost:3000'
    const j = (r: APIResponse) => r.json()
    const headers = { 'Content-Type': 'application/json' }

    // GET roles list (roles:manage)
    const rolesRes = await page.request.get(`${base}/api/roles`)
    const rolesJson = await j(rolesRes)
    expect(rolesRes.status()).toBe(200)
    expect(rolesJson.success).toBe(true)
    const ownerRole = rolesJson.data.find((r: { name: string }) => r.name === 'owner')
    expect(ownerRole).toBeTruthy()

    // Use real permission IDs from a role for create/update
    const pid = (code: string) =>
      rolesJson.data
        .flatMap((r: { rolePermissions: { permission: { code: string } }[] }) =>
          r.rolePermissions.map((rp) => rp.permission)
        )
        .find((p: { code: string }) => p.code === code)?.id
    const readPerm = pid('products:read')
    const invPerm = pid('inventory:read')
    expect(readPerm).toBeTruthy()
    expect(invPerm).toBeTruthy()

    // GET single role
    const single = await page.request.get(`${base}/api/roles/${ownerRole.id}`)
    expect(single.status()).toBe(200)

    // Create a temp role
    const created = await page.request.post(`${base}/api/roles`, {
      headers,
      data: {
        name: '__api_temp',
        displayName: 'API Temp',
        description: 'temp',
        permissionIds: [readPerm, invPerm],
      },
    })
    const createdJson = await created.json()
    expect(created.status()).toBe(201)
    expect(createdJson.success).toBe(true)

    // Rename it via PUT
    const renamed = await page.request.put(`${base}/api/roles/${createdJson.data.id}`, {
      headers,
      data: {
        name: '__api_temp_b',
        displayName: 'API Temp B',
        description: 'temp2',
        permissionIds: [readPerm, invPerm],
      },
    })
    expect(renamed.status()).toBe(200)

    // System-role rename must be blocked (400/403)
    const sysRename = await page.request.put(`${base}/api/roles/${ownerRole.id}`, {
      headers,
      data: { name: '__hack_name', displayName: 'Hack' },
    })
    expect(sysRename.status()).toBeGreaterThanOrEqual(400)

    // Delete temp role
    const del = await page.request.delete(`${base}/api/roles/${createdJson.data.id}`)
    expect(del.status()).toBe(200)

    // Delete system role blocked
    const delSys = await page.request.delete(`${base}/api/roles/${ownerRole.id}`)
    expect(delSys.status()).toBeGreaterThanOrEqual(400)
  })

  test('Users API: role swap works; last owner downgrade blocked (R15/R6)', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('admin@pharmacare.local')
    await page.locator('input[type="password"]').fill('Admin@123')
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/localhost:3000\/?$/, { timeout: 20000 })

    const base = 'http://localhost:3000'
    const j = (r: APIResponse) => r.json()
    const headers = { 'Content-Type': 'application/json' }

    // Get cashier user + roles
    const rolesRes = await page.request.get(`${base}/api/roles`)
    const roles = (await j(rolesRes)).data
    const cashierRole = roles.find((r: { name: string }) => r.name === 'cashier')
    const managerRole = roles.find((r: { name: string }) => r.name === 'manager')

    const usersRes = await page.request.get(`${base}/api/users`)
    const users = (await j(usersRes)).data
    const cashier = users.find((u: { email: string }) => u.email === 'cashier@pharmacare.local')
    const admin = users.find((u: { email: string }) => u.email === 'admin@pharmacare.local')
    expect(cashier).toBeTruthy()

    // Swap cashier role → cashier (no-op) works
    const swap = await page.request.put(`${base}/api/users/${cashier.id}`, {
      headers,
      data: { roleIds: [cashierRole.id], isActive: true },
    })
    expect(swap.status()).toBe(200)

    // Swap cashier → manager works (actor is owner)
    const swap2 = await page.request.put(`${base}/api/users/${cashier.id}`, {
      headers,
      data: { roleIds: [managerRole.id], isActive: true },
    })
    expect(swap2.status()).toBe(200)

    // Swap back to cashier
    const swap3 = await page.request.put(`${base}/api/users/${cashier.id}`, {
      headers,
      data: { roleIds: [cashierRole.id], isActive: true },
    })
    expect(swap3.status()).toBe(200)

    // Empty roleIds → 400
    const emptyRoles = await page.request.put(`${base}/api/users/${cashier.id}`, {
      headers,
      data: { roleIds: [], isActive: true },
    })
    expect(emptyRoles.status()).toBeGreaterThanOrEqual(400)

    // Last owner downgrade: admin (only owner) cannot self-demote
    const lastOwner = await page.request.put(`${base}/api/users/${admin.id}`, {
      headers,
      data: { roleIds: [cashierRole.id], isActive: true },
    })
    expect(lastOwner.status()).toBe(409)
    const body = await lastOwner.json()
    expect(body.error.message).toContain('last owner')
  })
})