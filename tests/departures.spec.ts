import { test, expect, type Page } from '@playwright/test'

async function signedIn(page: Page) {
  let signed = true
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/logout')) signed = false
    const data = path.endsWith('/session') ? { user: signed ? { name: 'Alice', plexId: '11111' } : null, plexConnected: signed }
      : path.endsWith('/capabilities') ? { departures: true, plexLink: true }
        : { items: [] }
    return route.fulfill({ json: data })
  })
}
function departurePage() {
  return { scope: 'recorded_history', updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), items: [
    { id: '1', title: '<img src=x onerror=alert(1)>', type: 'movie', watch: 'in_progress', estimatedAt: new Date(Date.now() + 7 * 86400_000).toISOString(), url: 'https://app.plex.tv/desktop/#!/server/fixture/details?key=%2Flibrary%2Fmetadata%2F1' },
    { id: '2', title: 'Une saison à retrouver', type: 'season', watch: 'unknown', estimatedAt: new Date(Date.now() + 3 * 86400_000).toISOString(), url: 'https://app.plex.tv' },
    { id: '3', title: 'Un film terminé', type: 'movie', watch: 'completed', estimatedAt: new Date(Date.now() + 2 * 86400_000).toISOString(), url: 'https://app.plex.tv' },
  ] }
}

test('personal departures show uncertainty, safely render titles and refresh removals', async ({ page }, testInfo) => {
  await signedIn(page)
  let empty = false
  await page.route('**/api/v1/departures', route => { const data = departurePage(); if (empty) data.items = []; return route.fulfill({ json: data }) })
  await page.goto('/avant-le-depart')
  await expect(page.locator('.departure-row')).toHaveCount(2)
  await expect(page.getByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeVisible()
  await expect(page.locator('.departure-list img')).toHaveCount(0)
  await expect(page.getByText('Saison · Visionnage incertain')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Voir dans Plex' }).first()).toHaveAttribute('href', /^https:\/\/app\.plex\.tv\//)
  await page.getByRole('checkbox', { name: 'Inclure les contenus terminés' }).check()
  await expect(page.locator('.departure-row')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('departures.png'), fullPage: true })
  empty = true
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
  await expect(page.locator('.departure-row')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Aucun départ à reprendre confirmé' })).toBeVisible()
})

test('source failure clears previously visible departures and retry recovers', async ({ page }) => {
  await signedIn(page)
  let failed = false
  await page.route('**/api/v1/departures', route => route.fulfill(failed ? { status: 503, json: { error: { message: 'Sources indisponibles.' } } } : { json: departurePage() }))
  await page.goto('/avant-le-depart')
  await expect(page.locator('.departure-row')).toHaveCount(2)
  failed = true
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Sources indisponibles')
  await expect(page.locator('.departure-row')).toHaveCount(0)
  failed = false
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.locator('.departure-row')).toHaveCount(2)
})

test('an in-flight response cannot restore a private list after logout', async ({ page }) => {
  await signedIn(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let requested = false
  await page.route('**/api/v1/departures', async route => { requested = true; await pending; await route.fulfill({ json: departurePage() }) })
  await page.goto('/avant-le-depart')
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  release()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.departure-row')).toHaveCount(0)
})

test('home includes personal departures and expired results are withdrawn', async ({ page }) => {
  await signedIn(page)
  let calls = 0
  await page.route('**/api/v1/departures', route => {
    if (++calls > 1) return route.fulfill({ status: 503, json: { error: { message: 'Actualisation indisponible.' } } })
    const data = departurePage(); data.expiresAt = new Date(Date.now() + 2500).toISOString()
    return route.fulfill({ json: data })
  })
  await page.goto('/')
  await expect(page.locator('.departure-row')).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Voir mes départs' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Actualisation indisponible', { timeout: 10_000 })
  await expect(page.locator('.departure-row')).toHaveCount(0)
})
