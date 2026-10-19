import { test, expect, type Page } from '@playwright/test'

async function fixture(page: Page, enabled = true) {
  const state = { signed: true, linked: true, failed: false, reads: 0 }
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/logout')) state.signed = false
    if (path.endsWith('/session')) return route.fulfill({ json: { user: state.signed ? { name: 'Alice', plexId: '11111' } : null, plexConnected: state.signed } })
    if (path.endsWith('/capabilities')) return route.fulfill({ json: { plexLink: true, recentBooks: enabled } })
    if (path.endsWith('/books/link')) return route.fulfill({ json: { linked: state.linked } })
    if (path.endsWith('/books/recent')) {
      state.reads++
      if (state.failed) return route.fulfill({ status: 503, json: { error: { message: 'Catalogue indisponible' } } })
      const number = Number(new URL(route.request().url()).searchParams.get('page') || 1)
      return route.fulfill({ json: { items: number === 1 ? [{ id: '7', title: 'Édition <script>test</script>', authors: ['Autrice'], formats: ['EPUB'], url: 'https://books.example/book/7' }, { id: '8', title: 'Autre édition', authors: [], formats: ['PDF'] }] : [], page: number, pageSize: 20, hasMore: number === 1, updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() } })
    }
    return route.fulfill({ json: { items: [] } })
  })
  return state
}

test('recent books preserve editions and pagination and withdraw failed observations', async ({ page }) => {
  const state = await fixture(page)
  await page.goto('/')
  await expect(page.locator('.recent-book')).toHaveCount(2)
  await expect(page.locator('.recent-book script')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Édition <script>test</script>' })).toHaveAttribute('href', 'https://books.example/book/7')
  await page.getByRole('button', { name: 'Livres suivants' }).click()
  await expect(page.getByText('Aucun livre visible sur cette page.')).toBeVisible()
  state.failed = true
  await page.getByRole('button', { name: 'Livres précédents' }).click()
  await expect(page.getByText('Catalogue indisponible')).toBeVisible()
  await expect(page.locator('.recent-book')).toHaveCount(0)
})

test('recent books require a personal link and the backend capability', async ({ page }) => {
  const state = await fixture(page)
  state.linked = false
  await page.goto('/')
  await expect(page.getByText(/Reliez votre catalogue personnel/)).toBeVisible()
  expect(state.reads).toBe(0)
  await page.unroute('**/api/v1/**')
  const disabled = await fixture(page, false)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible()
  await expect(page.locator('.recent-books')).toHaveCount(0)
  expect(disabled.reads).toBe(0)
})

test('late recent books cannot reappear after logout', async ({ page }) => {
  await fixture(page)
  let release: (() => void) | undefined
  await page.route('**/api/v1/books/recent?*', async route => {
    await new Promise<void>(resolve => { release = resolve })
    await route.fulfill({ json: { items: [{ id: '9', title: 'Secret tardif', authors: [], formats: [] }], page: 1, pageSize: 20, hasMore: false, updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() } })
  })
  await page.goto('/')
  await expect.poll(() => !!release).toBe(true)
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click()
  release?.()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.getByText('Secret tardif')).toHaveCount(0)
})
