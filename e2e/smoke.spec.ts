import { test, expect } from '@playwright/test'

test.describe('Smoke tests', () => {
  test('login page loads', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByText('PharmaCare', { exact: true }).first()).toBeVisible()
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('redirects to login when accessing dashboard without auth', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('authenticated dashboard renders at / without redirect loop', async ({ page }) => {
    await page.goto('/login')
    await page.locator('input[type="email"]').fill('admin@pharmacare.local')
    await page.locator('input[type="password"]').fill('Admin@123')
    await page.locator('button[type="submit"]').click()

    await expect(page).toHaveURL(/localhost:3000\/?$/, { timeout: 20000 })
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByText('Quick Actions')).toBeVisible()

    await page.waitForTimeout(1000)
    await expect(page).toHaveURL(/localhost:3000\/?$/)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  })
})
