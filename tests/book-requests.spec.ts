import { test, expect, type Page } from '@playwright/test'

const request = { id: '1', title: 'Le livre <script>alert(1)</script>', authors: ['Une autrice'], status: 'fulfilled', deliveryState: 'complete', catalogStatus: 'unverified', createdAt: '2026-10-15T12:00:00Z', reviewedAt: '2026-10-15T13:00:00Z', deliveryUpdatedAt: '2026-10-15T14:00:00Z' }
async function setup(page: Page, enabled = true) {
  const state = { signed: true, linked: false, denied: false, outage: false, invalidLogin: false, reads: 0, links: 0 }
  await page.route('**/api/v1/**', route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname
    if (path.endsWith('/auth/logout')) state.signed = false
    if (path.endsWith('/session')) return route.fulfill({ json: { user: state.signed ? { name: 'Alice', plexId: '11111' } : null, plexConnected: state.signed } })
    if (path.endsWith('/capabilities')) return route.fulfill({ json: { plexLink: true, bookRequestTracking: enabled } })
    if (path.endsWith('/services')) return route.fulfill({ json: { items: [{ id: 'shelfmark', name: 'Shelfmark', description: '', category: 'read', url: 'https://requests.example/' }] } })
    if (path === '/api/v1/book-requests/link-session') {
      if (req.method() === 'POST') {
        state.links++
        expect(req.postDataJSON()).toEqual({ username: 'alice', password: 'personal-password' })
        if (state.invalidLogin) return route.fulfill({ status: 403, json: { error: { message: 'Identifiants personnels refusés.' } } })
        state.linked = true
      }
      if (req.method() === 'DELETE') state.linked = false
      return route.fulfill({ json: { linked: state.linked, ...(state.linked ? { expiresAt: new Date(Date.now() + 60_000).toISOString() } : {}) } })
    }
    if (path === '/api/v1/book-requests') {
      expect(req.method()).toBe('GET'); state.reads++
      if (state.denied) { state.linked = false; return route.fulfill({ status: 403, json: { error: { message: 'Votre accès Shelfmark a expiré.' } } }) }
      if (state.outage) return route.fulfill({ status: 503, json: { error: { message: 'Shelfmark est indisponible.' } } })
      const number = Number(url.searchParams.get('page') || 1)
      return route.fulfill({ json: { items: number === 1 ? [request] : [], page: number, pageSize: 20, hasMore: number === 1, checkedAt: '2026-10-16T10:00:00Z' } })
    }
    return route.fulfill({ json: {} })
  })
  return state
}
async function enterCredentials(page: Page) {
  await page.getByLabel('Nom d’utilisateur Shelfmark').fill('alice')
  await page.getByLabel('Mot de passe Shelfmark').fill('personal-password')
  await page.getByRole('button', { name: 'Relier mon compte Shelfmark' }).click()
}
test('personal Shelfmark states stay distinct from verified catalog import', async ({ page }, testInfo) => {
  const state = await setup(page)
  await page.goto('/demandes-livres'); await enterCredentials(page)
  await expect(page.locator('.request-card')).toHaveCount(1)
  await expect(page.locator('.request-card h3')).toHaveText(request.title)
  await expect(page.locator('.request-card script')).toHaveCount(0)
  await expect(page.locator('.request-card')).toContainText('Livraison terminée dans Shelfmark')
  await expect(page.locator('.request-card')).toContainText('Présence dans le catalogue Grimmory : non vérifiée.')
  expect(state.links).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('book-request-tracking.png'), fullPage: true })
  await page.getByRole('button', { name: 'Page suivante' }).click()
  await expect(page.getByRole('heading', { name: 'Aucune demande sur cette page' })).toBeVisible()
  await page.getByRole('button', { name: 'Page précédente' }).click()
  await expect(page.locator('.request-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Retirer mon association Shelfmark' }).click()
  await expect(page.locator('.request-card')).toHaveCount(0)
  await expect(page.getByLabel('Mot de passe Shelfmark')).toHaveValue('')
})
test('outage removes old requests and revoked session returns to login', async ({ page }) => {
  const state = await setup(page); state.linked = true
  await page.goto('/demandes-livres'); await expect(page.locator('.request-card')).toHaveCount(1)
  state.outage = true
  await page.getByRole('button', { name: 'Actualiser les demandes' }).click()
  await expect(page.getByRole('alert')).toContainText('Shelfmark est indisponible')
  await expect(page.locator('.request-card')).toHaveCount(0)
  state.outage = false
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.locator('.request-card')).toHaveCount(1)
  state.denied = true
  await page.getByRole('button', { name: 'Actualiser les demandes' }).click()
  await expect(page.getByLabel('Mot de passe Shelfmark')).toBeVisible()
  await expect(page.locator('.request-card')).toHaveCount(0)
})
test('failed personal login clears password and allows retry', async ({ page }) => {
  const state = await setup(page); state.invalidLogin = true
  await page.goto('/demandes-livres'); await enterCredentials(page)
  await expect(page.getByRole('alert')).toContainText('Identifiants personnels refusés')
  await expect(page.getByLabel('Mot de passe Shelfmark')).toHaveValue('')
  state.invalidLogin = false
  await enterCredentials(page)
  await expect(page.locator('.request-card')).toHaveCount(1)
})
for (const phase of ['link', 'requests']) test(`late Shelfmark ${phase} response stays hidden after logout`, async ({ page }) => {
  const state = await setup(page); state.linked = phase === 'requests'
  let release!: () => void; let started!: () => void
  const pending = new Promise<void>(resolve => { release = resolve }); const reached = new Promise<void>(resolve => { started = resolve })
  const pattern = phase === 'link' ? '**/api/v1/book-requests/link-session' : '**/api/v1/book-requests?**'
  await page.route(pattern, async route => {
    if (phase === 'link' && route.request().method() !== 'POST') return route.fulfill({ json: { linked: false } })
    started(); await pending
    return route.fulfill({ json: phase === 'link' ? { linked: true, expiresAt: new Date(Date.now() + 60_000).toISOString() } : { items: [request], page: 1, pageSize: 20, hasMore: false, checkedAt: '2026-10-16T10:00:00Z' } })
  })
  await page.goto('/demandes-livres')
  if (phase === 'link') await enterCredentials(page)
  await reached
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click(); release()
  await expect(page.locator('.request-card')).toHaveCount(0)
  await expect(page.getByText('Votre compte Shelfmark est relié pour cette session.')).toHaveCount(0)
})
test('disabled tracking does not read personal Shelfmark state', async ({ page }) => {
  const state = await setup(page, false)
  await page.goto('/demandes-livres')
  await expect(page.getByRole('heading', { name: 'Suivi Shelfmark à connecter' })).toBeVisible()
  await expect(page.getByLabel('Mot de passe Shelfmark')).toHaveCount(0)
  expect(state.reads).toBe(0); expect(state.links).toBe(0)
})
