import { test, expect, type Page } from '@playwright/test'
import type { Book, BookRequestPage } from '../app/types/api'
import type { components } from '../app/types/generated'

const request: BookRequestPage['items'][number] = { id: '1', title: 'Une lecture demandée', authors: ['Une autrice'], status: 'fulfilled', deliveryState: 'complete', catalogStatus: 'unverified', createdAt: '2026-10-15T12:00:00Z' }
const edition = (id = '7', title = 'Une même histoire'): Book => ({ id, title, authors: ['Une autrice'], series: 'Saga', volume: '1.5', language: id === '7' ? 'fr' : 'en', publisher: 'Éditions Exemple', isbn: `978000000000${id}`, formats: ['EPUB'], url: `https://books.example/book/${id}` })
async function setup(page: Page, identity = 'Alice') {
  const state = { signed: true, linked: true, catalogLinked: true, catalogExpiresIn: 3_600_000, catalogEmpty: false, catalogOutage: false, postError: '', request: { ...request }, match: null as components['schemas']['BookCatalogMatch'] | null, reads: 0, writes: 0, deletes: 0, input: null as unknown, books: [edition(), edition('8'), { ...edition('9'), formats: [] }] }
  await page.route('**/api/v1/**', route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname
    if (path.endsWith('/auth/logout')) state.signed = false
    if (path.endsWith('/session')) return route.fulfill({ json: { user: state.signed ? { name: identity, plexId: identity === 'Alice' ? '11111' : '22222' } : null, plexConnected: state.signed } })
    if (path.endsWith('/capabilities')) return route.fulfill({ json: { plexLink: true, booksCatalog: true, bookRequestTracking: true } })
    if (path.endsWith('/services')) return route.fulfill({ json: { items: [{ id: 'shelfmark', name: 'Shelfmark', category: 'read', url: 'https://requests.example/' }, { id: 'grimmory', name: 'Grimmory', category: 'read', url: 'https://books.example' }] } })
    if (path === '/api/v1/book-requests/link-session') {
      if (req.method() === 'DELETE') state.linked = false
      return route.fulfill({ json: { linked: state.linked, expiresAt: new Date(Date.now() + 3_600_000).toISOString() } })
    }
    if (path === '/api/v1/book-requests') return route.fulfill({ json: { items: [{ ...state.request, ...(state.match ? { catalogStatus: 'available', catalogMatch: state.match } : {}) }], page: 1, pageSize: 20, hasMore: false, checkedAt: new Date().toISOString() } })
    if (path === '/api/v1/books/link') return route.fulfill({ json: { linked: state.catalogLinked, ...(state.catalogLinked ? { expiresAt: new Date(Date.now() + state.catalogExpiresIn).toISOString() } : {}) } })
    if (path === '/api/v1/books') {
      state.reads++
      if (state.catalogOutage) return route.fulfill({ status: 503, json: { error: { message: 'Grimmory est indisponible.' } } })
      if (!state.catalogLinked) return route.fulfill({ status: 403, json: { error: { code: 'books_link_required', message: 'Reliez votre catalogue personnel.' } } })
      const number = Number(url.searchParams.get('page') || 1)
      const searched = !!url.searchParams.get('q')
      return route.fulfill({ json: { items: state.catalogEmpty ? [] : searched || number > 1 ? [state.books[1]] : state.books, page: number, pageSize: 20, hasMore: number === 1 && !searched } })
    }
    if (path === '/api/v1/book-requests/1/catalog-match') {
      if (req.method() === 'DELETE') { state.deletes++; state.match = null; return route.fulfill({ status: 204 }) }
      expect(req.method()).toBe('POST'); state.writes++; state.input = req.postDataJSON()
      if (state.postError) return route.fulfill({ status: 409, json: { error: { code: 'selection_changed', message: state.postError } } })
      const book = state.books.find(item => item.id === req.postDataJSON().bookId)!
      state.match = { book, method: 'user_confirmed', confirmedAt: new Date().toISOString(), verifiedAt: new Date().toISOString() }
      return route.fulfill({ json: { catalogStatus: 'available', catalogMatch: state.match } })
    }
    return route.fulfill({ json: {} })
  })
  return state
}
async function choose(page: Page) {
  await page.getByRole('button', { name: 'Choisir l’édition disponible', exact: true }).click()
  await expect(page.locator('.catalog-editions .book-card')).toHaveCount(3)
}

test('explicit edition choice preserves pagination and provenance, then can be reset', async ({ page }, testInfo) => {
  const state = await setup(page)
  await page.goto('/demandes-livres'); await choose(page)
  expect(state.writes).toBe(0)
  await expect(page.getByRole('button', { name: 'Aucun format disponible' })).toBeDisabled()
  await expect(page.locator('.catalog-editions .book-card').first()).toContainText('fr · Éditions Exemple')
  await expect(page.locator('.catalog-editions .book-card').nth(1)).toContainText('en · Éditions Exemple')
  await expect(page.locator('.catalog-choice')).toContainText('aucune n’est sélectionnée automatiquement')
  await page.getByRole('button', { name: 'Éditions suivantes' }).click()
  await expect(page.locator('.catalog-editions .book-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Confirmer cette édition', exact: true }).click()
  await expect(page.locator('.matched-book')).toHaveCount(1)
  expect(state.input).toEqual({ requestPage: 1, bookId: '8', catalogPage: 2, catalogQuery: '' })
  await expect(page.locator('.request-catalog')).toContainText('Correspondance confirmée par vous')
  await expect(page.locator('.request-catalog')).toContainText('Cela ne prouve pas un import automatique depuis Shelfmark.')
  await expect(page.getByRole('link', { name: 'Ouvrir dans Grimmory' })).toHaveAttribute('href', 'https://books.example/book/8')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('book-catalog-match.png'), fullPage: true })
  await page.getByRole('button', { name: 'Retirer la correspondance' }).click()
  await expect(page.locator('.matched-book')).toHaveCount(0)
  await expect(page.locator('.request-card')).toContainText('Présence dans le catalogue Grimmory : non vérifiée.')
  await expect(page.locator('.request-card')).toContainText('Livraison terminée dans Shelfmark')
  expect(state.writes).toBe(1); expect(state.deletes).toBe(1)
})

test('selection errors clear old editions and a fresh search sends its exact scope', async ({ page }) => {
  const state = await setup(page); state.postError = 'La sélection a changé. Choisissez à nouveau.'
  await page.goto('/demandes-livres'); await choose(page)
  await page.getByRole('button', { name: 'Confirmer cette édition', exact: true }).first().click()
  await expect(page.getByRole('alert')).toContainText('La sélection a changé')
  await expect(page.locator('.catalog-editions .book-card')).toHaveCount(0)
  await expect(page.locator('.matched-book')).toHaveCount(0)
  state.postError = ''
  await page.getByRole('button', { name: 'Réessayer le choix' }).click()
  await page.getByLabel('Titre, auteur, série ou ISBN').fill('ISBN 9780000000008')
  await page.getByRole('button', { name: 'Rechercher les éditions' }).click()
  await expect(page.locator('.catalog-editions .book-card')).toHaveCount(1)
  await page.getByRole('button', { name: 'Confirmer cette édition', exact: true }).click()
  await expect(page.locator('.matched-book')).toHaveCount(1)
  expect(state.input).toEqual({ requestPage: 1, bookId: '8', catalogPage: 1, catalogQuery: 'ISBN 9780000000008' })
})

test('missing personal access, an empty catalogue and an outage never confirm a book', async ({ page }) => {
  const state = await setup(page); state.catalogLinked = false
  await page.goto('/demandes-livres')
  await page.getByRole('button', { name: 'Choisir l’édition disponible', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Gérer mon accès Grimmory' })).toHaveAttribute('href', '/livres')
  expect(state.reads).toBe(0)
  await page.getByRole('button', { name: 'Fermer le choix' }).click()
  state.catalogLinked = true; state.catalogEmpty = true
  await page.getByRole('button', { name: 'Choisir l’édition disponible', exact: true }).click()
  await expect(page.getByText('Aucune édition accessible sur cette page.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Confirmer cette édition' })).toHaveCount(0)
  state.catalogEmpty = false; state.catalogOutage = true
  await page.getByRole('button', { name: 'Éditions suivantes' }).click()
  await expect(page.getByRole('alert')).toContainText('Grimmory est indisponible')
  await expect(page.locator('.catalog-editions .book-card')).toHaveCount(0)
  expect(state.writes).toBe(0)
})

for (const expiry of ['proof', 'grant']) test(`expired ${expiry} hides prior edition details and retains reset`, async ({ page }) => {
  await page.clock.install()
  const state = await setup(page)
  state.catalogExpiresIn = expiry === 'grant' ? 10_000 : 3_600_000
  state.match = { book: edition(), method: 'user_confirmed', confirmedAt: new Date().toISOString(), verifiedAt: new Date(Date.now() - (expiry === 'proof' ? 290_000 : 0)).toISOString() }
  await page.goto('/demandes-livres')
  await expect(page.locator('.matched-book')).toHaveCount(1)
  await page.clock.fastForward(11_000)
  await expect(page.locator('.matched-book')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ouvrir dans Grimmory' })).toHaveCount(0)
  await expect(page.locator('.request-catalog')).toContainText('présence dans votre catalogue à revérifier')
  await expect(page.getByRole('button', { name: 'Retirer la correspondance' })).toBeVisible()
})

test('separate accounts only see their own editions and confirmations', async ({ page, context }) => {
  const alice = await setup(page)
  const bobPage = await context.newPage()
  const bob = await setup(bobPage, 'Bob'); bob.books = [edition('17', 'Lecture réservée à Bob')]
  await page.goto('/demandes-livres'); await choose(page)
  await page.getByRole('button', { name: 'Confirmer cette édition', exact: true }).first().click()
  await expect(page.locator('.matched-book')).toHaveCount(1)
  await bobPage.goto('/demandes-livres')
  await expect(bobPage.locator('.matched-book')).toHaveCount(0)
  await bobPage.getByRole('button', { name: 'Choisir l’édition disponible', exact: true }).click()
  await expect(bobPage.locator('.catalog-editions .book-card')).toHaveCount(1)
  await expect(bobPage.locator('.catalog-editions')).toContainText('Lecture réservée à Bob')
  await expect(bobPage.getByText('Une même histoire', { exact: true })).toHaveCount(0)
  expect(alice.writes).toBe(1); expect(bob.writes).toBe(0)
  await bobPage.close()
})

for (const phase of ['catalogue', 'confirmation']) test(`late ${phase} response cannot restore personal data after logout`, async ({ page }) => {
  await setup(page)
  let release!: () => void; let started!: () => void
  const pending = new Promise<void>(resolve => { release = resolve }); const reached = new Promise<void>(resolve => { started = resolve })
  await page.route(phase === 'catalogue' ? '**/api/v1/books?**' : '**/api/v1/book-requests/1/catalog-match', async route => {
    started(); await pending
    return route.fulfill({ json: phase === 'catalogue' ? { items: [edition()], page: 1, pageSize: 20, hasMore: false } : { catalogStatus: 'available', catalogMatch: { book: edition(), method: 'user_confirmed', confirmedAt: new Date().toISOString(), verifiedAt: new Date().toISOString() } } })
  })
  await page.goto('/demandes-livres')
  await page.getByRole('button', { name: 'Choisir l’édition disponible', exact: true }).click()
  if (phase === 'confirmation') await page.getByRole('button', { name: 'Confirmer cette édition', exact: true }).first().click()
  await reached
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click(); release()
  await expect(page.locator('.book-card')).toHaveCount(0)
  await expect(page.getByText('La correspondance avec votre édition Grimmory est confirmée.', { exact: true })).toHaveCount(0)
})

test('pending requests cannot select an edition', async ({ page }) => {
  const state = await setup(page); state.request.status = 'pending'; state.request.deliveryState = 'none'
  await page.goto('/demandes-livres')
  await expect(page.locator('.request-card')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Choisir l’édition disponible' })).toHaveCount(0)
  expect(state.reads).toBe(0); expect(state.writes).toBe(0)
})

test('returning to a suspended tab withdraws an expired catalogue proof', async ({ page }) => {
  await page.clock.install()
  const state = await setup(page)
  state.match = { book: edition(), method: 'user_confirmed', confirmedAt: new Date().toISOString(), verifiedAt: new Date().toISOString() }
  await page.goto('/demandes-livres')
  await expect(page.locator('.matched-book')).toHaveCount(1)
  await page.clock.setSystemTime(new Date(Date.now() + 6 * 60_000))
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect(page.locator('.matched-book')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Ouvrir dans Grimmory' })).toHaveCount(0)
  expect(state.writes).toBe(0)
})

test('a request no longer delivered cannot expose a formerly verified edition', async ({ page }) => {
  const state = await setup(page)
  state.request.deliveryState = 'error'
  state.match = { book: edition(), method: 'user_confirmed', confirmedAt: new Date().toISOString(), verifiedAt: new Date().toISOString() }
  await page.goto('/demandes-livres')
  await expect(page.locator('.request-card')).toContainText('Échec de livraison')
  await expect(page.locator('.matched-book')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Retirer la correspondance' })).toBeVisible()
})
