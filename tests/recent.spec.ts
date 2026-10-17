import { test, expect, type Page } from '@playwright/test'

async function signedIn(page: Page) {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({ json: path.endsWith('/session') ? { user: { name: 'Alice', plexId: '11111' }, plexConnected: true } : path.endsWith('/capabilities') ? { recent: true, requests: true, plexLink: true } : { items: [] } })
  })
}
const media = (id: string, title: string) => ({ id, title, type: 'show', addedAt: '2026-10-15T12:00:00Z', url: 'https://app.plex.tv' })

test('recent additions follow the upstream cursor and merge stable series IDs', async ({ page }) => {
  await signedIn(page)
  const offsets: number[] = []
  await page.route('**/api/v1/recent*', route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset'))
    offsets.push(offset)
    return route.fulfill({ json: { items: offset === 0 ? [media('series:1', 'Une série'), media('movie:2', 'Un film')] : [media('series:1', 'Une série'), media('movie:3', 'Un autre film')], nextOffset: offset === 0 ? 5 : null, offset, limit: 12, updatedAt: '2026-10-16T08:00:00Z' } })
  })
  await page.goto('/')
  await expect(page.locator('.media-card')).toHaveCount(2)
  await expect(page.getByText('Ajouté le', { exact: false }).first()).toContainText('15 oct. 2026')
  await page.getByRole('button', { name: 'Voir les ajouts suivants' }).click()
  await expect(page.locator('.media-card')).toHaveCount(3)
  await expect(page.getByRole('heading', { name: 'Une série', exact: true })).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Voir les ajouts suivants' })).toHaveCount(0)
  expect(offsets).toEqual([0, 5])
})

test('a later recent-page failure clears previous private entries', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/v1/recent*', route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset'))
    return route.fulfill(offset ? { status: 503, json: { error: { message: 'Plex temporairement indisponible.' } } } : { json: { items: [media('1', 'Une lecture privée')], nextOffset: 12, updatedAt: new Date().toISOString() } })
  })
  await page.goto('/')
  await expect(page.locator('.media-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Voir les ajouts suivants' }).click()
  await expect(page.getByRole('alert')).toContainText('Plex temporairement indisponible')
  await expect(page.locator('.media-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.locator('.media-card')).toHaveCount(1)
})

test('requests with unknown dates remain readable', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/v1/requests*', route => route.fulfill({ json: { items: [{ id: 1, title: 'Demande sans date', type: 'movie', status: 'unknown', createdAt: '', seasons: [] }], total: 1, offset: 0, limit: 10 } }))
  await page.goto('/demandes')
  await expect(page.locator('.request-row')).toContainText('Date inconnue')
  await expect(page.locator('.request-row')).not.toContainText('Invalid Date')
})

test('an expired hidden page cannot be restored by a delayed next page', async ({ page }) => {
  await signedIn(page)
  await page.clock.install()
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let nextRequested = false
  await page.route('**/api/v1/recent*', async route => {
    const offset = Number(new URL(route.request().url()).searchParams.get('offset'))
    if (offset) { nextRequested = true; await pending }
    await route.fulfill({ json: { items: [media(offset ? '2' : '1', offset ? 'Suite privée différée' : 'Première page')], nextOffset: offset ? null : 12, updatedAt: new Date().toISOString() } })
  })
  await page.goto('/')
  await expect(page.locator('.media-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Voir les ajouts suivants' }).click()
  await expect.poll(() => nextRequested).toBe(true)
  await page.evaluate(() => Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }))
  await page.clock.fastForward(60_001)
  await expect(page.locator('.media-card')).toHaveCount(0)
  const response = page.waitForResponse(r => new URL(r.url()).searchParams.get('offset') === '12')
  release()
  await response
  await page.waitForLoadState('networkidle')
  await expect(page.locator('.media-card')).toHaveCount(0)
  await expect(page.getByText('On ouvre la bibliothèque…', { exact: true })).toHaveCount(0)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect(page.getByRole('heading', { name: 'Première page', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Suite privée différée', exact: true })).toHaveCount(0)
})
