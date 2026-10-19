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
    else if (path.endsWith('/requests')) {
      const filter = new URL(route.request().url()).searchParams.get('status')
      const items = [{ id: 1, title: '<img src=x onerror=alert(1)>', type: 'movie', status: 'available', createdAt: '2026-10-15T12:00:00Z', mediaId: 123, seasons: [] }, { id: 2, title: 'Fallout', type: 'tv', status: 'processing', createdAt: '2026-10-14T12:00:00Z', mediaId: 22, seasons: [1] }].filter(item => !filter || item.status === filter)
      data = { items, total: items.length, offset: 0, limit: 10 }
    }
    else if (path.endsWith('/preferences')) { if (route.request().method() === 'PUT') preferences = route.request().postDataJSON().notifications; data = { notifications: preferences, notificationsAvailable: false, timezone: 'Europe/Paris' } }
    else if (path.endsWith('/auth/logout')) { signedIn = false; data = { ok: true } }
    await route.fulfill({ json: data })
  })
  return { signIn: () => { signedIn = true }, signOut: () => { signedIn = false } }
}
test('authenticated home and service filters', async ({ page }, testInfo) => {
  await api(page, true)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Interstellar' })).toBeVisible()
  await page.getByRole('button', { name: 'Lire', exact: true }).click()
  await expect(page.locator('.services-grid .service-card')).toHaveCount(2)
  await expect(page.locator('.services-grid')).toContainText('Grimmory')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true })
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
test('unconfigured notifications do not offer a second preference form', async ({ page }) => {
  await api(page, true)
  await page.goto('/compte')
  await expect(page.getByRole('heading', { name: 'Vos comptes liés' })).toBeVisible()
  await expect(page.getByText('Les notifications ne sont pas activées sur ce serveur.')).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Enregistrer ma préférence' })).toHaveCount(0)
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
test('navigation reaches the dedicated monitoring page on small screens', async ({ page, isMobile }) => {
  await api(page, true)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Interstellar' })).toBeVisible()
  if (isMobile) await page.getByRole('button', { name: 'Ouvrir la navigation' }).click()
  await page.getByRole('link', { name: 'Le serveur', exact: true }).click()
  await page.getByRole('link', { name: 'Consulter les performances' }).click()
  await expect(page.getByRole('heading', { name: 'Les mesures ne sont pas activées' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})

test('departure navigation is direct and the mobile drawer supports keyboard dismissal', async ({ page, isMobile }) => {
  await api(page, true)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Accueil', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Délais à examiner' })).toHaveCount(0)
  if (isMobile) {
    await expect(page.locator('#sidebar')).toHaveAttribute('inert', '')
    const toggle = page.getByRole('button', { name: 'Ouvrir la navigation' })
    await toggle.click()
    await expect(page.locator('#sidebar')).not.toHaveAttribute('inert', '')
    await page.keyboard.press('Escape')
    await expect(toggle).toBeFocused()
    await expect(page.locator('#sidebar')).toHaveAttribute('inert', '')
    await toggle.click()
  }
  await page.getByRole('navigation').getByRole('link', { name: 'Avant leur départ', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Avant leur départ.' })).toBeVisible()
  await expect(page.locator('.breadcrumb')).toContainText('Avant leur départ')
  if (isMobile) await expect(page.locator('#sidebar')).toHaveAttribute('inert', '')
})

test('Seerr association can be retried after signing in with Plex', async ({ page }) => {
  await api(page, true)
  let linked = false
  await page.route('**/api/v1/session', route => route.fulfill({ json: {
    user: { discordId: '12345', name: 'Alex', plexId: '1', ...(linked ? { seerrId: 42 } : {}) }, plexConnected: true,
  } }))
  await page.goto('/compte')
  await expect(page.getByRole('link', { name: 'Ouvrir Seerr' })).toHaveAttribute('href', 'https://seerr.example.com')
  await page.getByRole('button', { name: 'Actualiser l’association' }).click()
  await expect(page.getByRole('status')).toContainText('Association non confirmée')
  linked = true
  await page.getByRole('button', { name: 'Actualiser l’association' }).click()
  await expect(page.getByRole('status')).toContainText('associé automatiquement')
  await expect(page.getByRole('button', { name: 'Actualiser l’association' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})


test('all portal routes stay behind the Plex gate without private requests', async ({ page }) => {
  await api(page)
  const privateRequests: string[] = []
  page.on('request', r => { if (/\/api\/v1\/(services|requests|recent|preferences|departures)/.test(r.url())) privateRequests.push(r.url()) })
  for (const route of ['/', '/demandes', '/suivis', '/bibliotheque', '/serveur', '/compte', '/aide', '/avant-le-depart']) {
    await page.goto(route)
    await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
    await expect(page.getByRole('navigation')).toHaveCount(0)
    await expect(page.locator('.services-grid')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Lier Discord' })).toHaveCount(0)
  }
  expect(privateRequests).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})

test('Plex login opens the requested page without Discord', async ({ page }) => {
  await api(page)
  let connected = false
  await page.route('**/api/v1/session', route => route.fulfill({ json: connected ? { user: { name: 'Alice Plex', plexId: '77', notifications: false }, plexConnected: true } : { user: null } }))
  await page.route('**/api/v1/auth/plex/start', route => route.fulfill({ json: { url: 'https://app.plex.tv/auth#?clientID=test&code=long-pin-code', expiresIn: 300 } }))
  await page.route('**/api/v1/auth/plex/poll', route => { connected = true; return route.fulfill({ json: { connected: true } }) })
  await page.goto('/compte')
  await page.getByRole('button', { name: 'Se connecter avec Plex' }).click()
  await expect(page.getByRole('link', { name: 'Continuer sur Plex' })).toHaveAttribute('href', /^https:\/\/app\.plex\.tv\/auth#/)
  await expect(page.getByRole('heading', { name: 'Vos comptes liés' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Lier Discord' })).toBeVisible()
  await expect(page.getByText('Facultatif · Pour utiliser les commandes du bot')).toBeVisible()
  await expect(page.locator('.login-screen')).toHaveCount(0)
})

test('denied Plex access keeps the gate closed with a useful message', async ({ page }) => {
  await api(page)
  await page.route('**/api/v1/auth/plex/start', route => route.fulfill({ json: { url: 'https://app.plex.tv/auth#?clientID=test', expiresIn: 300 } }))
  await page.route('**/api/v1/auth/plex/poll', route => route.fulfill({ status: 403, json: { error: { code: 'plex_denied', message: 'Ce compte Plex n’a pas accès à ce serveur.' } } }))
  await page.goto('/')
  await page.getByRole('button', { name: 'Se connecter avec Plex' }).click()
  await expect(page.getByRole('alert')).toContainText('n’a pas accès')
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.getByRole('navigation')).toHaveCount(0)
})

test('logout removes the portal and its cached service links', async ({ page }) => {
  await api(page, true)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Vos services' })).toBeVisible()
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.services-grid')).toHaveCount(0)
  await page.goto('/demandes')
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
})

test('expired sessions close the gate when returning to the tab', async ({ page }) => {
  const auth = await api(page, true)
  await page.goto('/demandes')
  await expect(page.getByRole('heading', { name: 'Fallout' })).toBeVisible()
  auth.signOut()
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.request-list')).toHaveCount(0)
})
