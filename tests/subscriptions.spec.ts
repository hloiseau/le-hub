import { test, expect, type Page } from '@playwright/test'

const item = { id: 1, type: 'movie', tmdbId: 12, title: 'Le film partagé', channel: 'hub', status: 'following', createdAt: '2026-10-16T12:00:00Z' }
const list = (items: object[] = [], total = items.length, offset = 0) => ({ items, total, offset, limit: 10 })
async function signedIn(page: Page, enabled = true) {
  let signed = true
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/logout')) signed = false
    return route.fulfill({ json: path.endsWith('/session') ? { user: signed ? { name: 'Alice', plexId: '11111' } : null, plexConnected: signed }
      : path.endsWith('/capabilities') ? { subscriptions: enabled, plexLink: true }
        : path.endsWith('/services') ? { items: [{ id: 'seerr', name: 'Seerr', category: 'watch', url: 'https://seerr.example.invalid' }] }
          : list() })
  })
}

test('follow a season, view its availability, and unsubscribe from the shared Hub list', async ({ page }, testInfo) => {
  await signedIn(page)
  let saved: Record<string, unknown> | undefined
  let following = false
  let available = false
  await page.route('**/api/v1/subscriptions**', route => {
    if (route.request().method() === 'POST') {
      saved = route.request().postDataJSON(); following = true
      return route.fulfill({ json: { status: 'following', title: 'La série partagée', subscription: { ...item, ...saved, title: 'La série partagée' } } })
    }
    if (route.request().method() === 'DELETE') { following = false; return route.fulfill({ json: { ok: true } }) }
    return route.fulfill({ json: list(following ? [{ ...item, ...saved, title: 'La série partagée', status: available ? 'available' : 'following', ...(available ? { url: 'https://app.plex.tv/desktop/#!/server/fixture/details?key=%2Flibrary%2Fmetadata%2F42' } : {}) }] : []) })
  })
  await page.goto('/suivis')
  await expect(page.getByRole('heading', { name: 'Mes suivis.' })).toBeVisible()
  await page.getByLabel('Type de contenu').selectOption('tv')
  await page.getByLabel('Identifiant TMDB').fill('12')
  await page.getByLabel('Saison (facultatif)').fill('0')
  await page.getByRole('button', { name: 'Suivre ce contenu' }).click()
  await expect(page.locator('.follow-feedback')).toContainText('Vous suivez La série partagée')
  expect(saved).toEqual({ type: 'tv', tmdbId: 12, season: 0, channel: 'hub' })
  await expect(page.locator('.subscription-row')).toHaveCount(1)
  await expect(page.locator('.subscription-row')).toContainText('Saison 0')
  available = true
  await page.getByRole('button', { name: 'Actualiser mes suivis' }).click()
  await expect(page.locator('.subscription-row')).toContainText('Disponible pour vous')
  await expect(page.getByRole('link', { name: 'Ouvrir dans Plex' })).toHaveAttribute('href', /^https:\/\/app\.plex\.tv\//)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('subscriptions.png'), fullPage: true })
  await page.getByRole('button', { name: 'Ne plus suivre La série partagée' }).click()
  await expect(page.locator('.subscription-row')).toHaveCount(0)
  await expect(page.locator('.follow-feedback')).toContainText('Vous ne suivez plus ce contenu')
})

test('already available content immediately links to Plex without announcing a future alert', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/v1/subscriptions**', route => route.fulfill({ json: route.request().method() === 'POST'
    ? { status: 'already_available', title: 'Le film partagé', url: 'https://app.plex.tv/desktop/#!/server/fixture/details?key=42' }
    : list() }))
  await page.goto('/suivis')
  await page.getByLabel('Identifiant TMDB').fill('12')
  await page.getByRole('button', { name: 'Suivre ce contenu' }).click()
  await expect(page.locator('.follow-feedback')).toContainText('déjà disponible pour vous. Aucun nouveau suivi')
  await expect(page.getByRole('link', { name: 'Ouvrir dans Plex' })).toBeVisible()
  await expect(page.locator('.subscription-row')).toHaveCount(0)
})

test('subscription pagination withdraws stale titles after an outage and renders titles as text', async ({ page }) => {
  await signedIn(page)
  let failed = false
  const offsets: string[] = []
  await page.route('**/api/v1/subscriptions**', route => {
    const offset = new URL(route.request().url()).searchParams.get('offset') || '0'; offsets.push(offset)
    return route.fulfill(failed ? { status: 503, json: { error: { message: 'Suivis temporairement indisponibles.' } } }
      : { json: list([{ ...item, id: Number(offset) + 1, title: offset === '0' ? '<img src=x onerror=alert(1)>' : 'Page suivante' }], 11, Number(offset)) })
  })
  await page.goto('/suivis')
  await expect(page.getByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeVisible()
  await expect(page.locator('.subscription-list img')).toHaveCount(0)
  await page.getByRole('button', { name: 'Suivant', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Page suivante' })).toBeVisible()
  expect(offsets).toContain('10')
  failed = true
  await page.getByRole('button', { name: 'Actualiser mes suivis' }).click()
  await expect(page.getByRole('alert')).toContainText('Suivis temporairement indisponibles')
  await expect(page.locator('.subscription-row')).toHaveCount(0)
})

test('disabled subscription capability provides no mutation form', async ({ page }) => {
  await signedIn(page, false)
  let reads = 0
  await page.route('**/api/v1/subscriptions**', route => { reads++; return route.fulfill({ json: list() }) })
  await page.goto('/suivis')
  await expect(page.getByRole('heading', { name: 'Les suivis arrivent bientôt' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Suivre ce contenu' })).toHaveCount(0)
  expect(reads).toBe(0)
})

test('a no-longer-accessible follow keeps a private unsubscribe action', async ({ page }) => {
  await signedIn(page)
  let removed = false
  await page.route('**/api/v1/subscriptions**', route => {
    if (route.request().method() === 'DELETE') { removed = true; return route.fulfill({ json: { ok: true } }) }
    return route.fulfill({ json: list(removed ? [] : [{ ...item, title: 'Contenu inaccessible', status: 'unavailable' }]) })
  })
  await page.goto('/suivis')
  await expect(page.locator('.subscription-row')).toContainText('Accès indisponible')
  await expect(page.getByRole('link', { name: 'Ouvrir dans Plex' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ne plus suivre Contenu inaccessible' }).click()
  await expect(page.locator('.subscription-row')).toHaveCount(0)
  expect(removed).toBe(true)
})

test('a late subscription response cannot restore private results after logout', async ({ page }) => {
  await signedIn(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let requested = false
  await page.route('**/api/v1/subscriptions**', async route => { requested = true; await pending; await route.fulfill({ json: list([item]) }) })
  await page.goto('/suivis')
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  release()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.subscription-row')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mes suivis.' })).toHaveCount(0)
})
