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
  await page.route('**/api/v1/departures', route => { const data = departurePage(); data.scope = 'personal_interest'; data.items[0]!.watch = 'unstarted'; if (empty) data.items = []; return route.fulfill({ json: data }) })
  await page.goto('/avant-le-depart')
  await expect(page.locator('.departure-row:visible')).toHaveCount(2)
  await expect(page.getByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeVisible()
  await expect(page.locator('.departure-list img')).toHaveCount(0)
  await expect(page.getByText('Saison · Visionnage incertain')).toBeVisible()
  await expect(page.getByText('Film · Marqué non vu dans Plex')).toBeVisible()
  await expect(page.locator('.page-heading')).toContainText('vos demandes, suivis et visionnages')
  await expect(page.locator('.editorial-panel')).toContainText('Une demande ou un suivi peut apparaître même si vous n’avez pas commencé à regarder.')
  await expect(page.getByText('Les demandes jamais lancées et les suivis ne sont pas encore inclus.', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Voir dans Plex' }).first()).toHaveAttribute('href', /^https:\/\/app\.plex\.tv\//)
  await page.getByRole('checkbox', { name: 'Inclure les contenus terminés' }).check()
  await expect(page.locator('.departure-row')).toHaveCount(3)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('departures.png'), fullPage: true })
  empty = true
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
  await expect(page.locator('.departure-row')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Aucun départ confirmé' })).toBeVisible()
})

test('source failure clears previously visible departures and retry recovers', async ({ page }) => {
  await signedIn(page)
  let failed = false
  await page.route('**/api/v1/departures', route => route.fulfill(failed ? { status: 503, json: { error: { message: 'Sources indisponibles.' } } } : { json: departurePage() }))
  await page.goto('/avant-le-depart')
  await expect(page.locator('.departure-row:visible')).toHaveCount(2)
  failed = true
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Sources indisponibles')
  await expect(page.locator('.departure-row')).toHaveCount(0)
  failed = false
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click()
  await expect(page.locator('.departure-row:visible')).toHaveCount(2)
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
  await expect(page.locator('.departure-tile')).toContainText('Vos demandes, suivis et visionnages concernés par un départ estimé.')
  await expect(page.locator('.departure-row:visible')).toHaveCount(2)
  await expect(page.getByRole('link', { name: 'Voir mes départs' })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Actualisation indisponible', { timeout: 10_000 })
  await expect(page.locator('.departure-row')).toHaveCount(0)
})

test('departure filters combine title, media type and deadline without reordering the source', async ({ page }, testInfo) => {
  await signedIn(page)
  await page.route('**/api/v1/departures', route => {
    const data = departurePage()
    data.items = [
      { ...data.items[0]!, id: '1', title: 'Été sur Mars', estimatedAt: new Date(Date.now() + 6 * 86400_000).toISOString() },
      { ...data.items[1]!, id: '2', title: 'Été — Saison 1', type: 'season' },
      { ...data.items[1]!, id: '4', title: 'Été — Épisode 2', type: 'episode', estimatedAt: new Date(Date.now() + 12 * 86400_000).toISOString() },
      { ...data.items[1]!, id: '5', title: 'Autre série', type: 'show' },
      data.items[2]!,
    ]
    return route.fulfill({ json: data })
  })
  await page.goto('/avant-le-depart')
  await expect(page.locator('.departure-row:visible h3')).toHaveText(['Été sur Mars', 'Été — Saison 1', 'Été — Épisode 2', 'Autre série'])
  await expect(page.locator('.departure-count')).toHaveText('4 contenu(s) affiché(s) sur 5 départ(s) confirmé(s).')
  await page.getByRole('searchbox', { name: 'Rechercher un titre' }).fill('ETE')
  await page.getByLabel('Type de contenu', { exact: true }).selectOption('series')
  await expect(page.locator('.departure-row:visible h3')).toHaveText(['Été — Saison 1', 'Été — Épisode 2'])
  await page.getByLabel('Échéance estimée', { exact: true }).selectOption('7')
  await expect(page.locator('.departure-row:visible h3')).toHaveText(['Été — Saison 1'])
  await expect(page.locator('.departure-count')).toHaveText('1 contenu(s) affiché(s) sur 5 départ(s) confirmé(s).')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: `.cache/extension-cancellation-captures/filters-${testInfo.project.name}.png`, fullPage: true })
  await page.getByLabel('Type de contenu', { exact: true }).selectOption('movie')
  await expect(page.locator('.departure-row:visible h3')).toHaveText(['Été sur Mars'])
  await page.getByRole('searchbox', { name: 'Rechercher un titre' }).fill('Absent')
  await expect(page.getByRole('heading', { name: 'Aucun départ avec ces filtres' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Aucun départ confirmé', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click()
  await expect(page.locator('.departure-row:visible h3')).toHaveText(['Été sur Mars', 'Été — Saison 1', 'Été — Épisode 2', 'Autre série'])
  await expect(page.getByRole('searchbox', { name: 'Rechercher un titre' })).toHaveValue('')
  await page.getByRole('checkbox', { name: 'Inclure les contenus terminés' }).check()
  await expect(page.locator('.departure-row:visible')).toHaveCount(5)
})

test('filtering preserves a delay draft, its pending submission and its confirmed outcome', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/v1/capabilities', route => route.fulfill({ json: { departures: true, plexLink: true, extensionRequests: true } }))
  await page.route('**/api/v1/departures', route => route.fulfill({ json: departurePage() }))
  let writes = 0; let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/extension-requests', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { items: [] } })
    expect(route.request().postDataJSON()).toEqual({ mediaId: '2', days: 12, reason: 'Terminer cette saison.' })
    writes++; await pending
    return route.fulfill({ json: { status: 'pending' } })
  })
  await page.goto('/avant-le-depart')
  const season = page.locator('.departure-row').filter({ has: page.getByRole('heading', { name: 'Une saison à retrouver', exact: true, includeHidden: true }) })
  await season.getByRole('button', { name: 'Demander un délai', exact: true }).click()
  await season.getByLabel('Délai souhaité en jours').fill('12')
  await season.getByLabel('Motif (facultatif)').fill('Terminer cette saison.')
  await page.getByLabel('Type de contenu', { exact: true }).selectOption('movie')
  await expect(season).toBeHidden()
  await expect(season.locator('button[type=submit]')).toBeDisabled()
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click()
  await expect(season.getByLabel('Motif (facultatif)')).toHaveValue('Terminer cette saison.')
  await expect(season.getByLabel('Délai souhaité en jours')).toHaveValue('12')
  await season.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect.poll(() => writes).toBe(1)
  await page.getByRole('searchbox', { name: 'Rechercher un titre' }).fill('Aucun résultat')
  await expect(season).toBeHidden()
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click()
  await expect(season.getByRole('button', { name: 'Enregistrement…', exact: true })).toBeDisabled()
  release()
  await expect(season.locator('.extension-form [role=status]')).toContainText('Demande enregistrée pour examen.')
  await page.getByLabel('Type de contenu', { exact: true }).selectOption('movie')
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click()
  await expect(season.locator('.extension-form [role=status]')).toContainText('Demande enregistrée pour examen.')
  expect(writes).toBe(1)
})
