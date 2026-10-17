import { test, expect, type Page } from '@playwright/test'

const poster = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAwCAIAAAD/zu84AAAAL0lEQVR4nO3NQQkAAAgEsItnDpMZ1RQ+hMH+S9ecikAgEAgEAoFAIBAIBAKB4FOwXVi8amAP0wUAAAAASUVORK5CYII=', 'base64')
async function signedIn(page: Page) {
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({ json: path.endsWith('/session') ? { user: { name: 'Alice', plexId: '11111' }, plexConnected: true } : path.endsWith('/capabilities') ? { recent: true, requests: true, plexLink: true } : { items: [] } })
  })
}

test('recent items display private Plex posters and retain readable fallback cards', async ({ page }, testInfo) => {
  await signedIn(page)
  const fetched: string[] = []
  await page.route('**/api/v1/posters/plex/*', route => {
    const path = new URL(route.request().url()).pathname
    fetched.push(path)
    return route.fulfill(path.endsWith('/12') ? { contentType: 'image/png', body: poster } : { status: 403, json: { error: { message: 'Affiche indisponible.' } } })
  })
  await page.route('**/api/v1/recent*', route => route.fulfill({ json: {
    items: [
      { id: 'movie:12', title: 'Une affiche Plex', posterUrl: '/api/v1/posters/plex/12' },
      { id: 'movie:13', title: 'Affiche privée indisponible', posterUrl: '/api/v1/posters/plex/13' },
      { id: 'movie:14', title: 'Source non autorisée', posterUrl: 'https://foreign.example/poster.jpg' },
    ].map(item => ({ ...item, type: 'movie', addedAt: '2026-10-17T12:00:00Z' })),
    nextOffset: null, updatedAt: new Date().toISOString(),
  } }))
  let foreignFetch = false
  await page.route('https://foreign.example/**', route => { foreignFetch = true; return route.abort() })
  await page.goto('/')
  const cards = page.locator('.media-card')
  await expect(cards).toHaveCount(3)
  await cards.first().scrollIntoViewIfNeeded()
  const image = cards.first().locator('img.media-artwork')
  await expect(image).toHaveAttribute('src', '/api/v1/posters/plex/12')
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
  await expect(image).toHaveAttribute('referrerpolicy', 'no-referrer')
  await cards.nth(1).scrollIntoViewIfNeeded()
  await expect(cards.nth(1).locator('.artwork-placeholder')).toBeVisible()
  await expect(cards.nth(2).locator('.artwork-placeholder')).toHaveCount(1)
  await expect(cards.nth(1).getByRole('heading')).toHaveText('Affiche privée indisponible')
  expect(fetched.sort()).toEqual(['/api/v1/posters/plex/12', '/api/v1/posters/plex/13'])
  expect(foreignFetch).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('recent-artwork.png'), fullPage: true })
})

test('Seerr requests show their posters and escaped requester names without accepting foreign image sources', async ({ page }, testInfo) => {
  await signedIn(page)
  await page.route('https://image.tmdb.org/t/p/w342/fixture.jpg', route => route.fulfill({ contentType: 'image/png', body: poster }))
  await page.route('**/api/v1/requests*', route => route.fulfill({ json: {
    items: [
      { id: 1, title: 'Une demande illustrée', posterUrl: 'https://image.tmdb.org/t/p/w342/fixture.jpg', requesterName: 'Alice' },
      { id: 2, title: 'Une demande sans affiche', posterUrl: 'https://image.tmdb.org.evil.example/t/p/w342/fixture.jpg', requesterName: '<img src=x onerror=alert(1)>' },
    ].map(item => ({ ...item, type: 'movie', mediaId: item.id, status: 'available', createdAt: '2026-10-17T12:00:00Z', seasons: [] })), total: 2, offset: 0, limit: 10,
  } }))
  let foreignFetch = false
  await page.route('https://image.tmdb.org.evil.example/**', route => { foreignFetch = true; return route.abort() })
  await page.goto('/demandes')
  const rows = page.locator('.request-row')
  await expect(rows).toHaveCount(2)
  const image = rows.first().locator('img.media-artwork')
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true)
  await expect(rows.first()).toContainText('Demandé par Alice')
  await expect(rows.nth(1)).toContainText('Demandé par <img src=x onerror=alert(1)>')
  await expect(rows.nth(1).locator('img')).toHaveCount(0)
  await expect(rows.nth(1).locator('.artwork-placeholder')).toBeVisible()
  expect(foreignFetch).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('request-artwork.png'), fullPage: true })
})
