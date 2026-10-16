import { test, expect } from '@playwright/test'

test('request details distinguish source states and link only to configured Seerr fiches', async ({ page }, testInfo) => {
  const states = ['available', 'partial', 'processing', 'error', 'unknown']
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    const json = path.endsWith('/session') ? { user: { name: 'Alice', plexId: '1', seerrId: 42 }, plexConnected: true }
      : path.endsWith('/services') ? { items: [{ id: 'seerr', name: 'Seerr', description: '', category: 'watch', url: 'https://requests.example/base/' }] }
        : path.endsWith('/requests') ? { items: states.map((status, i) => ({ id: i + 1, title: i === 0 ? '<img src=x onerror=alert(1)>' : `Demande ${status}`, type: i === 1 ? 'tv' : 'movie', status, createdAt: '2026-10-16T12:00:00Z', mediaId: 100 + i, seasons: i === 1 ? [1, 2] : [] })), total: 5, offset: 0, limit: 10 }
          : { requests: true }
    return route.fulfill({ json })
  })
  await page.goto('/demandes')
  const rows = page.locator('.request-row')
  await expect(rows).toHaveCount(5)
  for (const row of await rows.all()) {
    await row.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(row.locator('details')).toHaveAttribute('open', '')
  }
  await expect(rows.nth(0)).toContainText('La lecture et votre accès dans Plex ne sont pas vérifiés')
  await expect(rows.nth(1)).toContainText('Cela ne confirme pas que tous les épisodes')
  await expect(rows.nth(2)).toContainText('attendre son import et son indexation')
  await expect(rows.nth(3)).toContainText('Seerr signale un échec')
  await expect(rows.nth(4)).toContainText('La disponibilité reste inconnue')
  await expect(rows.nth(0).getByRole('link')).toHaveAttribute('href', 'https://requests.example/base/movie/100')
  await expect(rows.nth(1).getByRole('link')).toHaveAttribute('href', 'https://requests.example/base/tv/101')
  await expect(page.locator('.request-list img')).toHaveCount(0)
  await page.getByRole('combobox').selectOption('error')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('Demande Seerr n° 4')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('request-error-detail.png'), fullPage: true })
})

test('request detail does not build a link for invalid media IDs or absent service links', async ({ page }) => {
  let hasService = true
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    const json = path.endsWith('/session') ? { user: { name: 'Alice', plexId: '1' }, plexConnected: true }
      : path.endsWith('/services') ? { items: hasService ? [{ id: 'seerr', url: 'https://requests.example' }] : [] }
        : path.endsWith('/requests') ? { items: [{ id: 1, title: 'Demande', type: 'movie', status: 'unknown', createdAt: '', mediaId: hasService ? -1 : 12, seasons: [] }], total: 1, offset: 0, limit: 10 }
          : { requests: true }
    return route.fulfill({ json })
  })
  await page.goto('/demandes')
  await expect(page.locator('.request-row')).toBeVisible()
  await expect(page.locator('.request-detail a')).toHaveCount(0)
  hasService = false
  await page.reload()
  await expect(page.locator('.request-row')).toBeVisible()
  await expect(page.locator('.request-detail a')).toHaveCount(0)
})
