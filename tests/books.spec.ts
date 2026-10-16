import { test, expect, type Page } from '@playwright/test'

const item = (id = '7', title = 'Une histoire <script>alert(1)</script>') => ({ id, title, authors: ['Une autrice'], series: 'Une série', volume: '2', isbn: '123456789X', formats: ['EPUB', 'PDF'], url: `https://books.example/book/${id}` })
async function bookSession(page: Page, enabled = true) {
  const state = { signed: true, linked: false, revoked: false, outage: false, writes: 0, reads: 0 }
  await page.route('**/api/v1/**', route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname
    if (path.endsWith('/auth/logout')) state.signed = false
    if (path.endsWith('/session')) return route.fulfill({ json: { user: state.signed ? { name: 'Alice', plexId: '11111' } : null, plexConnected: state.signed } })
    if (path.endsWith('/capabilities')) return route.fulfill({ json: { plexLink: true, booksCatalog: enabled, bookRequests: enabled } })
    if (path.endsWith('/services')) return route.fulfill({ json: { items: [{ id: 'grimmory', name: 'Grimmory', category: 'read', description: '', url: 'https://books.example' }, { id: 'shelfmark', name: 'Shelfmark', category: 'read', description: '', url: 'https://requests.example/' }] } })
    if (path === '/api/v1/books/link') {
      if (req.method() === 'POST') { state.writes++; expect(req.postDataJSON()).toEqual({ username: 'alice-opds', password: 'personal-secret' }); state.linked = true }
      if (req.method() === 'DELETE') { state.writes++; state.linked = false }
      return route.fulfill({ json: { linked: state.linked, ...(state.linked ? { expiresAt: new Date(Date.now() + 60_000).toISOString() } : {}) } })
    }
    if (path === '/api/v1/books') {
      state.reads++
      if (state.revoked) { state.linked = false; return route.fulfill({ status: 403, json: { error: { message: 'Votre accès OPDS a été révoqué.' } } }) }
      if (state.outage) return route.fulfill({ status: 503, json: { error: { message: 'Grimmory est indisponible.' } } })
      const number = Number(url.searchParams.get('page') || 1)
      return route.fulfill({ json: { items: number === 1 ? [item(), item('8')] : [], page: number, pageSize: 20, hasMore: number === 1 } })
    }
    if (path === '/api/v1/book-requests/link') return route.fulfill({ json: { mode: 'external', url: `https://requests.example/#q=${encodeURIComponent(url.searchParams.get('q') || '')}&search_by=general`, message: 'Choisissez une édition et confirmez dans Shelfmark. Aucune demande créée par Le Hub.' } })
    return route.fulfill({ json: {} })
  })
  return state
}
async function connect(page: Page) {
  await page.getByLabel('Nom d’utilisateur OPDS').fill('alice-opds')
  await page.getByLabel('Mot de passe OPDS').fill('personal-secret')
  await page.getByRole('button', { name: 'Relier mon catalogue' }).click()
  await expect(page.locator('.book-card')).toHaveCount(2)
}

test('personal books connect, preserve editions, paginate and unlink', async ({ page }, testInfo) => {
  const state = await bookSession(page)
  await page.goto('/livres')
  await connect(page)
  expect(state.writes).toBe(1)
  await expect(page.locator('.book-card h3').first()).toHaveText('Une histoire <script>alert(1)</script>')
  await expect(page.locator('.book-card script')).toHaveCount(0)
  await expect(page.locator('.book-card').first()).toContainText('EPUB · PDF')
  await expect(page.getByRole('link', { name: 'Ouvrir dans Grimmory' }).first()).toHaveAttribute('href', 'https://books.example/book/7')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('books-catalog.png'), fullPage: true })
  await page.getByRole('button', { name: 'Page suivante' }).click()
  await expect(page.getByRole('heading', { name: 'Aucun livre sur cette page' })).toBeVisible()
  await expect(page.getByText('Page 2', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Page précédente' }).click()
  await expect(page.locator('.book-card')).toHaveCount(2)
  await page.getByLabel('Titre, auteur, série ou ISBN').fill('Une série')
  await page.getByRole('button', { name: 'Rechercher les livres' }).click()
  await expect(page.locator('.book-card')).toHaveCount(2)
  await page.getByRole('button', { name: 'Retirer mon association Grimmory' }).click()
  await expect(page.getByLabel('Mot de passe OPDS')).toHaveValue('')
  await expect(page.locator('.book-card')).toHaveCount(0)
  expect(state.writes).toBe(2)
})

test('catalog outage clears cards; revocation removes the personal link', async ({ page }) => {
  const state = await bookSession(page)
  state.linked = true
  await page.goto('/livres')
  await expect(page.locator('.book-card')).toHaveCount(2)
  state.outage = true
  await page.getByRole('button', { name: 'Actualiser le catalogue' }).click()
  await expect(page.getByRole('alert')).toContainText('Grimmory est indisponible')
  await expect(page.locator('.book-card')).toHaveCount(0)
  state.outage = false
  await page.getByRole('button', { name: 'Réessayer le catalogue' }).click()
  await expect(page.locator('.book-card')).toHaveCount(2)
  state.revoked = true
  await page.getByRole('button', { name: 'Actualiser le catalogue' }).click()
  await expect(page.getByRole('alert')).toContainText('révoqué')
  await expect(page.locator('.book-card')).toHaveCount(0)
  await expect(page.getByLabel('Mot de passe OPDS')).toBeVisible()
})

test('Shelfmark preparation only creates a search link and explains confirmation', async ({ page }, testInfo) => {
  const state = await bookSession(page)
  let upstreamWrites = 0
  await page.route('https://requests.example/**', route => { upstreamWrites++; return route.abort() })
  await page.goto('/livres')
  await page.getByLabel('Livre à demander').fill('Dune & Herbert')
  await page.getByRole('button', { name: 'Préparer la recherche Shelfmark' }).click()
  const link = page.getByRole('link', { name: 'Choisir et confirmer dans Shelfmark' })
  await expect(link).toBeVisible()
  const href = new URL((await link.getAttribute('href'))!)
  expect(new URLSearchParams(href.hash.slice(1)).get('q')).toBe('Dune & Herbert')
  await expect(page.locator('.book-request-confirm')).toContainText('Aucune demande créée')
  expect(state.writes).toBe(0)
  expect(upstreamWrites).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('book-request-link.png'), fullPage: true })
  await page.getByLabel('Livre à demander').fill('Autre livre')
  await expect(link).toHaveCount(0)
})

test('late link responses cannot reappear after logout', async ({ page }) => {
  await bookSession(page)
  let release!: () => void
  let started!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const startedPromise = new Promise<void>(resolve => { started = resolve })
  await page.route('**/api/v1/books/link', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { linked: false } })
    started(); await pending
    return route.fulfill({ json: { linked: true, expiresAt: new Date(Date.now() + 60_000).toISOString() } })
  })
  await page.goto('/livres')
  await page.getByLabel('Nom d’utilisateur OPDS').fill('alice-opds')
  await page.getByLabel('Mot de passe OPDS').fill('personal-secret')
  await page.getByRole('button', { name: 'Relier mon catalogue' }).click()
  await startedPromise
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click()
  release()
  await expect(page.getByRole('heading', { name: 'Vos livres.' })).toHaveCount(0)
  await expect(page.locator('.book-card')).toHaveCount(0)
  await expect(page.getByText('Votre catalogue personnel est relié pour cette session.')).toHaveCount(0)
})

test('invalid OPDS credentials clear the password and permit retry', async ({ page }) => {
  await bookSession(page)
  let denied = true
  await page.route('**/api/v1/books/link', route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { linked: false } })
    return route.fulfill(denied ? { status: 403, json: { error: { message: 'Identifiants OPDS refusés.' } } } : { json: { linked: true, expiresAt: new Date(Date.now() + 60_000).toISOString() } })
  })
  await page.goto('/livres')
  await page.getByLabel('Nom d’utilisateur OPDS').fill('alice-opds')
  await page.getByLabel('Mot de passe OPDS').fill('bad-secret')
  await page.getByRole('button', { name: 'Relier mon catalogue' }).click()
  await expect(page.getByRole('alert')).toContainText('Identifiants OPDS refusés')
  await expect(page.getByLabel('Mot de passe OPDS')).toHaveValue('')
  denied = false
  await connect(page)
})

test('late catalog responses cannot reappear after logout', async ({ page }) => {
  const state = await bookSession(page)
  state.linked = true
  let release!: () => void
  let started!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  const startedPromise = new Promise<void>(resolve => { started = resolve })
  await page.route('**/api/v1/books?**', async route => {
    started(); await pending
    return route.fulfill({ json: { items: [item()], page: 1, pageSize: 20, hasMore: false } })
  })
  await page.goto('/livres')
  await startedPromise
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click()
  release()
  await expect(page.locator('.book-card')).toHaveCount(0)
  await expect(page.getByText('Une histoire <script>alert(1)</script>')).toHaveCount(0)
})

test('disabled book capabilities never fetch personal catalog', async ({ page }) => {
  const state = await bookSession(page, false)
  await page.goto('/livres')
  await expect(page.getByRole('heading', { name: 'Catalogue à connecter' })).toBeVisible()
  await expect(page.getByLabel('Mot de passe OPDS')).toHaveCount(0)
  await expect(page.getByLabel('Livre à demander')).toHaveCount(0)
  expect(state.reads).toBe(0)
  expect(state.writes).toBe(0)
})
