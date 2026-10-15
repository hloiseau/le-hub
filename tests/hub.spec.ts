import { test, expect, type Page } from '@playwright/test'

async function api(page: Page, signedIn = false) {
  let preferences = false
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname
    let data: unknown = {}
    if (path.endsWith('/session')) data = signedIn ? { user: { discordId: '12345', name: 'Alex', plexId: '1', seerrId: 42, notifications: preferences }, plexConnected: true } : { user: null }
    else if (path.endsWith('/services')) data = { items: [
      { id: 'plex', name: 'Plex', description: 'Films et séries', category: 'watch', url: 'https://app.plex.tv' },
      { id: 'seerr', name: 'Seerr', description: 'Vos demandes', category: 'watch', url: 'https://seerr.example.com' },
      { id: 'downloadarr', name: 'Downloadarr', description: 'À emporter', category: 'tools' },
      { id: 'torrent-watch', name: 'Torrent Watch', description: 'Téléchargements', category: 'tools' },
      { id: 'shelfmark', name: 'Shelfmark', description: 'Demander une lecture', category: 'read' },
      { id: 'grimmory', name: 'Grimmory', description: 'Livres et mangas', category: 'read' },
    ] }
    else if (path.endsWith('/capabilities')) data = { version: 'test', discordLogin: true, plexLink: true, requests: true, recent: true, notifications: false, books: false, monitoring: false, subscriptions: false }
    else if (path.endsWith('/recent')) data = { items: [{ id: '1', title: 'Interstellar', type: 'movie', year: 2014, addedAt: '2026-10-15T12:00:00Z', url: 'https://app.plex.tv' }, { id: '2', title: 'Shōgun', type: 'show', year: 2024, addedAt: '2026-10-15T12:00:00Z' }] }
    else if (path.endsWith('/requests')) data = { items: [{ id: 1, title: '<img src=x onerror=alert(1)>', type: 'movie', status: 'available', createdAt: '2026-10-15T12:00:00Z', mediaId: 123, seasons: [] }, { id: 2, title: 'Fallout', type: 'tv', status: 'processing', createdAt: '2026-10-14T12:00:00Z', mediaId: 22, seasons: [1] }], total: 2, offset: 0, limit: 10 }
    else if (path.endsWith('/preferences')) { if (route.request().method() === 'PUT') preferences = route.request().postDataJSON().notifications; data = { notifications: preferences, notificationsAvailable: false, timezone: 'Europe/Paris' } }
    else if (path.endsWith('/auth/logout')) { signedIn = false; data = { ok: true } }
    await route.fulfill({ json: data })
  })
}
test('anonymous home, filters and account guidance', async ({ page }, testInfo) => {
  await api(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'On regarde quoi ?' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Votre bibliothèque vous attend' })).toBeVisible()
  await page.getByRole('button', { name: 'Lire', exact: true }).click()
  await expect(page.locator('.services-grid .service-card')).toHaveCount(2)
  await expect(page.locator('.services-grid')).toContainText('Grimmory')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true })
  await page.getByRole('link', { name: 'Ouvrir mon compte' }).click()
  await expect(page.getByRole('link', { name: 'Se connecter avec Discord' })).toHaveAttribute('href', '/api/v1/auth/discord/start')
})
test('personal requests render safely and filter by status', async ({ page }, testInfo) => {
  await api(page, true)
  await page.goto('/demandes')
  await expect(page.getByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeVisible()
  await expect(page.locator('.request-list img')).toHaveCount(0)
  await page.getByRole('combobox').selectOption('processing')
  await expect(page.locator('.request-row')).toHaveCount(1)
  await expect(page.locator('.request-row')).toContainText('Fallout')
  await page.screenshot({ path: testInfo.outputPath('requests.png'), fullPage: true })
})
test('preferences persist, future alerts stay explicit', async ({ page }) => {
  await api(page, true)
  await page.goto('/compte')
  await expect(page.getByRole('heading', { name: 'Vos comptes liés' })).toBeVisible()
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Enregistrer ma préférence' }).click()
  await expect(page.getByRole('status')).toContainText('Préférence enregistrée')
  await expect(page.getByRole('checkbox')).toBeChecked()
  await page.goto('/avant-le-depart')
  await expect(page.getByRole('heading', { name: 'Avant leur départ.' })).toBeVisible()
  await expect(page.getByText('Cette intégration n’est pas encore active.', { exact: false })).toBeVisible()
})
test('upstream failure is explained and retry works', async ({ page }) => {
  await api(page, true)
  let failed = true
  await page.route('**/api/v1/requests*', async route => route.fulfill(failed ? { status: 503, json: { error: { code: 'unavailable', message: 'Seerr ne répond pas actuellement.' } } } : { json: { items: [], total: 0, offset: 0, limit: 10 } }))
  await page.goto('/demandes')
  await expect(page.getByRole('alert')).toContainText('Seerr ne répond pas')
  failed = false
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.getByRole('heading', { name: 'Aucune demande à afficher' })).toBeVisible()
})
test('navigation and upcoming metrics on small screens', async ({ page, isMobile }) => {
  await api(page, true)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Interstellar' })).toBeVisible()
  if (isMobile) await page.getByRole('button', { name: 'Ouvrir la navigation' }).click()
  await page.getByRole('link', { name: 'Le serveur', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Les métriques ne sont pas encore connectées' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})
