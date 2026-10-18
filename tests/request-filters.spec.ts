import { test, expect, type Page } from '@playwright/test'

const requests = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, title: `Demande ${i + 1}`, type: 'movie', status: i < 10 ? 'available' : i < 22 ? 'processing' : 'error', createdAt: '2026-10-18T10:00:00Z', mediaId: i + 100, seasons: [] }))

async function setup(page: Page) {
  const state = { signedIn: true }
  await page.route('**/api/v1/**', route => {
    const url = new URL(route.request().url())
    const status = url.searchParams.get('status')
    const offset = Number(url.searchParams.get('offset') || 0)
    const items = requests.filter(item => !status || item.status === status)
    if (url.pathname.endsWith('/auth/logout')) state.signedIn = false
    const json = url.pathname.endsWith('/session') ? { user: state.signedIn ? { name: 'Alice', plexId: '1' } : null, plexConnected: state.signedIn }
      : url.pathname.endsWith('/capabilities') ? { requests: true, plexLink: true }
        : url.pathname.endsWith('/requests') ? { items: items.slice(offset, offset + 10), total: items.length, offset, limit: 10 }
          : { items: [] }
    return route.fulfill({ json })
  })
  return state
}

test('status filters find requests beyond the initial page and paginate filtered totals', async ({ page }, testInfo) => {
  await setup(page)
  await page.goto('/demandes')
  await expect(page.locator('.request-row')).toHaveCount(10)
  await expect(page.locator('.request-row')).not.toContainText(['Demande 11'])
  await page.getByRole('button', { name: 'Suivant', exact: true }).click()
  await expect(page.locator('.pagination')).toContainText('11–20 sur 25')
  await page.getByLabel('Afficher').selectOption('processing')
  await expect(page.locator('.pagination')).toContainText('1–10 sur 12')
  await expect(page.locator('.request-row').first()).toContainText('Demande 11')
  await page.getByRole('button', { name: 'Suivant', exact: true }).click()
  await expect(page.locator('.pagination')).toContainText('11–12 sur 12')
  await expect(page.locator('.request-row')).toHaveCount(2)
  await page.getByRole('button', { name: 'Actualiser mes demandes' }).click()
  await expect(page.locator('.pagination')).toContainText('11–12 sur 12')
  await page.getByLabel('Afficher').selectOption('error')
  await expect(page.locator('.request-row')).toHaveCount(3)
  await expect(page.locator('.request-row').first()).toContainText('Demande 23')
  await expect(page.locator('.pagination')).toHaveCount(0)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('request-filter-error.png'), fullPage: true })
  await page.getByLabel('Afficher').selectOption('all')
  await expect(page.locator('.pagination')).toContainText('1–10 sur 25')
})

for (const remaining of [8, 0]) test(`refreshing a vanished last page returns once to page zero with ${remaining} remaining requests`, async ({ page }) => {
  await setup(page)
  let reduced = false
  const offsets: number[] = []
  await page.route('**/api/v1/requests?*status=processing*', route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset'))
    offsets.push(offset)
    const items = requests.slice(10, reduced ? 10 + remaining : 22)
    return route.fulfill({ json: { items: items.slice(offset, offset + 10), total: items.length, offset, limit: 10 } })
  })
  await page.goto('/demandes')
  await page.getByLabel('Afficher').selectOption('processing')
  await expect(page.locator('.pagination')).toContainText('1–10 sur 12')
  await page.getByRole('button', { name: 'Suivant', exact: true }).click()
  await expect(page.locator('.pagination')).toContainText('11–12 sur 12')
  reduced = true
  await page.getByRole('button', { name: 'Actualiser mes demandes' }).click()
  await expect(page.getByRole('button', { name: 'Actualiser mes demandes' })).toBeEnabled()
  await expect(page.locator('.request-row')).toHaveCount(remaining)
  await expect(page.locator('.pagination')).toHaveCount(0)
  if (remaining) await expect(page.locator('.request-row').first()).toContainText('Demande 11')
  else await expect(page.getByRole('heading', { name: 'Aucune demande à afficher' })).toBeVisible()
  expect(offsets).toEqual([0, 10, 10, 0])
  await page.getByRole('button', { name: 'Actualiser mes demandes' }).click()
  await expect(page.getByRole('button', { name: 'Actualiser mes demandes' })).toBeEnabled()
  expect(offsets).toEqual([0, 10, 10, 0, 0])
})

test('late response for a previous status cannot replace the selected status', async ({ page }) => {
  await setup(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let reads = 0
  await page.route('**/api/v1/requests?*status=processing*', async route => {
    reads++; await pending
    await route.fulfill({ json: { items: [requests[10]], total: 1, offset: 0, limit: 10 } })
  })
  await page.goto('/demandes')
  await expect(page.locator('.request-row')).toHaveCount(10)
  await page.getByLabel('Afficher').selectOption('processing')
  await expect.poll(() => reads).toBe(1)
  await page.getByLabel('Afficher').selectOption('error')
  await expect(page.locator('.request-row')).toHaveCount(3)
  const response = page.waitForResponse(url => new URL(url.url()).searchParams.get('status') === 'processing')
  release()
  await (await response).finished()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(page.locator('.request-row').first()).toContainText('Demande 23')
  await expect(page.getByLabel('Afficher')).toHaveValue('error')
})

test('a failed global filter clears old results and retries the same filter', async ({ page }) => {
  await setup(page)
  let failed = true
  await page.route('**/api/v1/requests?*status=error*', route => failed
    ? route.fulfill({ status: 502, json: { error: { message: 'La liste complète des demandes est indisponible.' } } })
    : route.fallback())
  await page.goto('/demandes')
  await expect(page.locator('.request-row')).toHaveCount(10)
  await page.getByLabel('Afficher').selectOption('error')
  await expect(page.getByRole('alert')).toContainText('liste complète')
  await expect(page.locator('.request-row')).toHaveCount(0)
  failed = false
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.locator('.request-row')).toHaveCount(3)
  await expect(page.locator('.request-row').first()).toContainText('Demande 23')
})

test('logout discards a filtered response in flight', async ({ page }) => {
  await setup(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let started = false
  await page.route('**/api/v1/requests?*status=processing*', async route => {
    started = true; await pending
    await route.fulfill({ json: { items: [requests[10]], total: 1, offset: 0, limit: 10 } })
  })
  await page.goto('/demandes')
  await expect(page.locator('.request-row')).toHaveCount(10)
  await page.getByLabel('Afficher').selectOption('processing')
  await expect.poll(() => started).toBe(true)
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  const response = page.waitForResponse(url => new URL(url.url()).searchParams.get('status') === 'processing')
  release()
  await (await response).finished()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.request-row')).toHaveCount(0)
})
