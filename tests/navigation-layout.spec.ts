import { test, expect, type Page } from '@playwright/test'

async function fixture(page: Page, admin = false) {
  const calls: string[] = []
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    calls.push(path)
    if (path.includes('/monitoring')) return route.fulfill({ status: 503, json: { error: { message: 'Collecteur indisponible.' } } })
    const fresh = { fetchedAt: new Date().toISOString(), publishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3600_000).toISOString() }
    const data = path.endsWith('/session') ? { user: { name: 'Compte de test', plexId: '12345' }, plexConnected: true, admin }
      : path.endsWith('/capabilities') ? { requests: true, departures: true, extensionRequests: true, booksCatalog: true, bookCollections: true, bookRequestTracking: true, monitoring: true, community: true, roadmap: true }
        : path.endsWith('/books/link') ? { linked: false }
          : path.endsWith('/services') ? { items: [{ id: 'grimmory', name: 'Grimmory', category: 'read', url: 'https://books.example.invalid' }] }
            : { items: [], ...fresh }
    return route.fulfill({ json: data })
  })
  return calls
}

test('old landing pages redirect directly and books share spaced section navigation', async ({ page }, testInfo) => {
  await fixture(page)
  await page.goto('/bibliotheque')
  await expect(page).toHaveURL(/\/livres$/)
  const books = page.getByRole('navigation', { name: 'Livres', exact: true })
  await expect(books.getByRole('link', { name: 'Catalogue', exact: true })).toHaveAttribute('aria-current', 'page')
  const links = books.getByRole('link')
  for (let i = 0; i < await links.count(); i++) expect((await links.nth(i).boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await expect(page.getByRole('navigation', { name: 'Navigation principale' }).getByRole('link', { name: 'Bibliothèque', exact: true })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('books-navigation.png'), fullPage: true })
  await books.getByRole('link', { name: 'Collections', exact: true }).click()
  await expect(page.getByRole('navigation', { name: 'Livres', exact: true }).getByRole('link', { name: 'Collections', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.goto('/serveur')
  await expect(page).toHaveURL(/\/performances$/)
  await expect(page.getByRole('heading', { name: 'Performances', exact: true })).toBeVisible()
})

test('admin queue is separate from personal removals and never fetched for a member', async ({ page }) => {
  const calls = await fixture(page)
  await page.goto('/admin/reports')
  await expect(page.getByRole('heading', { name: 'Accès administrateur requis' })).toBeVisible()
  expect(calls).not.toContain('/api/v1/admin/extension-requests')
  await page.goto('/avant-le-depart')
  await expect(page).toHaveURL(/\/retraits$/)
  await expect(page.getByRole('heading', { name: 'Retraits prévus', exact: true })).toBeVisible()
  await expect(page.getByText('Cette sélection personnelle ne représente pas tous les retraits du serveur.', { exact: false })).toBeVisible()
  await expect(page.getByRole('region', { name: 'En attente' })).toHaveCount(0)
  expect(calls).not.toContain('/api/v1/admin/extension-requests')
})

test('empty roadmap has no navigation entry and old admin bookmarks reach the dedicated queue', async ({ page }) => {
  await fixture(page, true)
  await page.goto('/communaute')
  await expect(page.getByRole('heading', { name: 'Aucun sujet publié' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Roadmap', exact: true })).toHaveCount(0)
  await page.goto('/avant-le-depart#extension-admin-heading')
  await expect(page).toHaveURL(/\/admin\/reports#extension-admin-heading$/)
  await expect(page.getByRole('region', { name: 'En attente' })).toBeVisible()
  await expect(page.locator('.departures')).toHaveCount(0)
})
