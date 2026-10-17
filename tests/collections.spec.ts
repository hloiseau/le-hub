import { test, expect, type Page } from '@playwright/test'

const book = { id: '1', title: 'Une même histoire', authors: ['Auteure'], series: 'Saga', volume: '1.5', language: 'fr', publisher: 'Éditions Exemple', isbn: '0441172717', formats: ['EPUB'], url: 'https://books.example/book/1' }
const pageData = (books: object[] = [book], page = 1, hasMore = false) => ({ items: books.length ? [{ name: 'Saga', books }] : [], page, pageSize: 20, hasMore, source: 'grimmory_opds', referenceStatus: 'unavailable', fetchedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() })
async function signedIn(page: Page, enabled = true) {
  let signed = true
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/logout')) signed = false
    return route.fulfill({ json: path.endsWith('/session') ? { user: signed ? { name: 'Alice', plexId: '11111' } : null, plexConnected: signed }
      : path.endsWith('/capabilities') ? { bookCollections: enabled, booksCatalog: enabled, plexLink: true }
        : path.endsWith('/services') ? { items: [{ id: 'grimmory', name: 'Grimmory', category: 'read', url: 'https://books.example' }] }
          : { items: [] } })
  })
}

test('collections retain different editions, fractional numbers and source uncertainty', async ({ page }, testInfo) => {
  await signedIn(page)
  const queries: string[] = []
  await page.route('**/api/v1/book-collections**', route => {
    queries.push(new URL(route.request().url()).searchParams.get('series') || '')
    return route.fulfill({ json: pageData([book, { ...book, id: '2', volume: 'HS', language: 'en', publisher: undefined, url: 'https://books.example/book/2' }]) })
  })
  await page.goto('/collections')
  await expect(page.locator('.collection-book')).toHaveCount(2)
  await expect(page.locator('.collection-book').first()).toContainText('1.5')
  await expect(page.locator('.collection-book').last()).toContainText('HS')
  await expect(page.locator('.collection-book').last()).toContainText('en')
  await expect(page.getByText('Les manques et dates de sortie restent donc inconnus', { exact: false })).toBeVisible()
  await expect(page.getByText('Source : Grimmory OPDS', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Voir cette série' }).click()
  await expect(page.getByLabel('Nom exact de la série')).toHaveValue('Saga')
  await expect.poll(() => queries.includes('Saga')).toBe(true)
  await expect(page.getByRole('link', { name: 'Lire ou corriger dans Grimmory' }).first()).toHaveAttribute('href', 'https://books.example/book/1')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('collections.png'), fullPage: true })
})

test('empty filtered pages keep pagination and an access error withdraws old collections', async ({ page }) => {
  await signedIn(page)
  let denied = false
  await page.route('**/api/v1/book-collections**', route => {
    const current = Number(new URL(route.request().url()).searchParams.get('page'))
    return route.fulfill(denied ? { status: 403, json: { error: { message: 'Reliez vos identifiants OPDS personnels Grimmory.' } } } : { json: pageData(current === 1 ? [] : [book], current, current === 1) })
  })
  await page.goto('/collections')
  await expect(page.getByRole('heading', { name: 'Aucune série sur cette page' })).toBeVisible()
  await page.getByRole('button', { name: 'Page suivante' }).click()
  await expect(page.locator('.collection-book')).toHaveCount(1)
  denied = true
  await page.getByRole('button', { name: 'Actualiser les collections' }).click()
  await expect(page.getByRole('alert')).toContainText('Reliez vos identifiants OPDS')
  await expect(page.locator('.collection-book')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Gérer mon accès et mes livres' })).toHaveAttribute('href', '/livres')
})

test('Kobo guide links the real integration without pretending to know sync state', async ({ page }) => {
  await signedIn(page)
  await page.goto('/guides/kobo')
  await expect(page.getByRole('heading', { name: 'Lire sur Kobo.' })).toBeVisible()
  await expect(page.getByText('Aucun état de synchronisation', { exact: false })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Guide officiel Grimmory' })).toHaveAttribute('href', 'https://grimmory.org/docs/integration/kobo/')
  await expect(page.getByRole('link', { name: 'Ouvrir mon Grimmory' })).toHaveAttribute('href', 'https://books.example')
  await expect(page.getByText('.kobo/Kobo/Kobo eReader.conf')).toBeVisible()
  await expect(page.locator('input')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /synchroniser|télécharger/i })).toHaveCount(0)
})

test('late collections cannot restore data after logout and disabled capability makes no reads', async ({ page }) => {
  await signedIn(page, false)
  let reads = 0
  await page.route('**/api/v1/book-collections**', route => { reads++; return route.fulfill({ json: pageData() }) })
  await page.goto('/collections')
  await expect(page.getByRole('heading', { name: 'Collections à connecter' })).toBeVisible()
  expect(reads).toBe(0)
  await signedIn(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/book-collections**', async route => { reads++; await pending; await route.fulfill({ json: pageData() }) })
  await page.reload()
  await expect.poll(() => reads).toBe(1)
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  release()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.collection-book')).toHaveCount(0)
})
