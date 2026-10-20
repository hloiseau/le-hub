import { test, expect, type Page } from '@playwright/test'

const item = { id: 1, type: 'movie', tmdbId: 12, title: 'Le film partagé', channel: 'hub', status: 'following', createdAt: '2026-10-16T12:00:00Z' }
const request = { id: 73, type: 'tv', mediaId: 12, title: 'Ma série demandée', status: 'partial', seasons: [2, 3], createdAt: '2026-10-16T12:00:00Z' }
const list = (items: object[] = [], total = items.length, offset = 0) => ({ items, total, offset, limit: 10 })
async function signedIn(page: Page, enabled = true, notifications = false) {
  let signed = true
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/logout')) signed = false
    return route.fulfill({ json: path.endsWith('/session') ? { user: signed ? { name: 'Alice', plexId: '11111', ...(notifications ? { discordId: '11111' } : {}) } : null, plexConnected: signed }
      : path.endsWith('/capabilities') ? { requests: enabled, subscriptions: enabled, notifications, subscriptionNotifications: notifications, discordDMs: notifications, plexLink: true }
        : path.endsWith('/reminders/preferences') ? { enabled: true, discordDmEnabled: true, allUnwatched: false, daysBefore: [7, 2], quietStartHour: 22, quietEndHour: 8, dailyCap: 10 }
          : path.endsWith('/subscriptions/notifications') ? inbox()
            : path.endsWith('/services') ? { items: [{ id: 'seerr', name: 'Seerr', category: 'watch', url: 'https://seerr.example.invalid' }] }
              : list() })
  })
}
const inbox = (items: object[] = []) => ({ items, updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() })
const notice = { subscriptionId: 1, type: 'movie', tmdbId: 12, title: 'Le film arrivé', url: 'https://app.plex.tv/desktop/#!/server/fixture/details?key=42', availableAt: '2026-10-16T12:00:00Z', deliveredAt: '2026-10-16T12:00:00Z' }

test('Seerr requests are followed automatically without adding IDs or creating subscriptions', async ({ page }, testInfo) => {
  await signedIn(page)
  const mutations: string[] = []
  page.on('request', request => { if (request.method() !== 'GET') mutations.push(request.url()) })
  await page.route('**/api/v1/requests?*', route => route.fulfill({ json: list([request, { ...request, id: 74, type: 'movie', title: 'Mon film demandé', status: 'processing', seasons: [] }]) }))
  await page.goto('/demandes')
  await expect(page.getByRole('heading', { name: 'Mes demandes.' })).toBeVisible()
  await expect(page.locator('.request-row')).toHaveCount(2)
  await expect(page.locator('.request-row').first()).toContainText('Saisons 2, 3')
  await expect(page.locator('.request-row').first()).toContainText('Disponibilité partielle')
  await expect(page.locator('.request-row').last()).toContainText('En cours')
  await expect(page.getByLabel('Identifiant TMDB')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Suivre ce contenu' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mes suivis ajoutés' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mes disponibilités' })).toHaveCount(0)
  await page.locator('.request-row').first().locator('summary').click()
  await expect(page.getByRole('link', { name: 'Ouvrir la fiche dans Seerr' }).first()).toHaveAttribute('href', 'https://seerr.example.invalid/tv/12')
  expect(mutations).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('automatic-following.png'), fullPage: true })
})

test('requests keep content while account owns notification settings and old anchors redirect', async ({ page }) => {
  await signedIn(page, true, true)
  await page.route('**/api/v1/requests?*', route => route.fulfill({ json: list([request]) }))
  await page.goto('/suivis')
  await expect(page).toHaveURL(/\/demandes$/)
  await expect(page.locator('.request-row')).toHaveCount(1)
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  await page.getByRole('link', { name: 'Régler mes notifications', exact: true }).click()
  await expect(page).toHaveURL(/\/compte#rappels$/)
  await expect(page.getByRole('checkbox', { name: 'Notifications personnelles' })).toBeChecked()
  await page.goto('/demandes#rappels')
  await expect(page).toHaveURL(/\/compte#rappels$/)
})

test('saved consent in account is rechecked when returning to subscriptions', async ({ page }) => {
  await signedIn(page, true, true)
  let preferences = { enabled: false, discordDmEnabled: false, allUnwatched: false, daysBefore: [7, 2], quietStartHour: 22, quietEndHour: 8, dailyCap: 10 }
  await page.route('**/api/v1/subscriptions?*', route => route.fulfill({ json: list([item]) }))
  await page.route('**/api/v1/reminders/preferences', route => {
    if (route.request().method() === 'PUT') preferences = route.request().postDataJSON()
    return route.fulfill({ json: preferences })
  })
  await page.goto('/demandes')
  const discordChoice = page.getByLabel('Canal pour Le film partagé').locator('option[value="discord"]')
  await expect(discordChoice).toHaveJSProperty('disabled', true)
  await page.goto('/compte#rappels')
  await page.getByRole('checkbox', { name: 'Notifications personnelles' }).check()
  await page.getByRole('checkbox', { name: 'Messages privés Discord' }).check()
  expect(preferences.discordDmEnabled).toBe(false)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await page.goto('/demandes')
  await expect(discordChoice).toHaveJSProperty('disabled', false)
  await page.goto('/compte#rappels')
  await page.getByRole('checkbox', { name: 'Notifications personnelles' }).uncheck()
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await page.goto('/demandes')
  await expect(discordChoice).toHaveJSProperty('disabled', true)
})

test('channel reminders remain explained without personal notification settings', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/v1/capabilities', route => route.fulfill({ json: { requests: true, discordChannelReminders: true, notifications: false, subscriptions: false, plexLink: true } }))
  let preferenceReads = 0
  await page.route('**/api/v1/reminders/preferences', route => { preferenceReads++; return route.fulfill({ status: 503 }) })
  await page.goto('/compte#rappels')
  await expect(page.getByText('Elles sont distinctes de vos notifications personnelles', { exact: false })).toBeVisible()
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  expect(preferenceReads).toBe(0)
})

test('Seerr follow pagination preserves statuses and clears stale titles on an outage', async ({ page }) => {
  await signedIn(page)
  let failed = false
  const offsets: string[] = []
  await page.route('**/api/v1/requests?*', route => {
    const offset = new URL(route.request().url()).searchParams.get('offset') || '0'; offsets.push(offset)
    return route.fulfill(failed ? { status: 502, json: { error: { message: 'Seerr temporairement indisponible.' } } }
      : { json: list([{ ...request, title: offset === '0' ? '<img src=x onerror=alert(1)>' : 'Ma demande suivante', status: offset === '0' ? 'declined' : 'error' }], 11, Number(offset)) })
  })
  await page.goto('/demandes')
  await expect(page.getByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeVisible()
  await expect(page.locator('.request-list img')).toHaveCount(0)
  await expect(page.locator('.request-row')).toContainText('Refusée')
  await page.getByRole('button', { name: 'Suivant', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Ma demande suivante' })).toBeVisible()
  await expect(page.locator('.request-row')).toContainText('En erreur')
  expect(offsets).toContain('10')
  failed = true
  await page.getByRole('button', { name: 'Actualiser mes demandes' }).click()
  await expect(page.getByRole('alert')).toContainText('Seerr temporairement indisponible')
  await expect(page.locator('.request-row')).toHaveCount(0)
})

test('an old follow failure does not hide automatic Seerr follows', async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/v1/requests?*', route => route.fulfill({ json: list([request]) }))
  await page.route('**/api/v1/subscriptions?*', route => route.fulfill({ status: 503, json: { error: { message: 'Suivis ajoutés indisponibles.' } } }))
  await page.goto('/demandes')
  await expect(page.getByRole('heading', { name: request.title })).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('Suivis ajoutés indisponibles')
})

test('unconfigured Seerr provides no manual copy form or reads', async ({ page }) => {
  await signedIn(page, false)
  let reads = 0
  await page.route('**/api/v1/requests?*', route => { reads++; return route.fulfill({ json: list() }) })
  await page.goto('/demandes')
  await expect(page.getByRole('heading', { name: 'Les demandes ne sont pas encore disponibles' })).toBeVisible()
  await expect(page.getByLabel('Identifiant TMDB')).toHaveCount(0)
  expect(reads).toBe(0)
})

test('existing manual follows can be removed without affecting Seerr requests', async ({ page }) => {
  await signedIn(page)
  let removed = false
  await page.route('**/api/v1/requests?*', route => route.fulfill({ json: list([request]) }))
  await page.route('**/api/v1/subscriptions**', route => {
    if (route.request().method() === 'DELETE') { removed = true; return route.fulfill({ json: { ok: true } }) }
    return route.fulfill({ json: list(removed ? [] : [{ ...item, title: 'Contenu inaccessible', status: 'unavailable' }]) })
  })
  await page.goto('/demandes')
  await expect(page.locator('.subscription-row')).toContainText('Accès indisponible')
  await expect(page.getByRole('link', { name: 'Ouvrir dans Plex' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Ne plus suivre Contenu inaccessible' }).click()
  await expect(page.locator('.subscription-row')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: request.title })).toBeVisible()
  expect(removed).toBe(true)
})

test('a late Seerr response cannot restore private follows after logout', async ({ page }) => {
  await signedIn(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let requested = false
  await page.route('**/api/v1/requests?*', async route => { requested = true; await pending; await route.fulfill({ json: list([request]) }) })
  await page.goto('/demandes')
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  release()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.request-row')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mes demandes.' })).toHaveCount(0)
})

test('an existing follow keeps its per-follow private Discord choice', async ({ page }) => {
  await signedIn(page, true, true)
  let channel = 'hub'
  const mutations: object[] = []
  await page.route('**/api/v1/subscriptions**', route => {
    if (new URL(route.request().url()).pathname.endsWith('/notifications')) return route.fulfill({ json: inbox() })
    if (route.request().method() === 'PATCH') {
      const body = route.request().postDataJSON(); mutations.push(body); channel = body.channel
      return route.fulfill({ json: { ok: true } })
    }
    return route.fulfill({ json: list([{ ...item, channel }]) })
  })
  await page.goto('/demandes')
  await page.getByLabel('Canal pour Le film partagé').selectOption('discord')
  await expect(page.getByLabel('Canal pour Le film partagé')).toHaveValue('discord')
  await page.getByLabel('Canal pour Le film partagé').selectOption('hub')
  await expect(page.locator('.follow-feedback')).toContainText('uniquement dans Le Hub')
  expect(mutations).toEqual([{ channel: 'discord' }, { channel: 'hub' }])
})

test('private Discord follow delivery still requires personal consent', async ({ page }) => {
  await signedIn(page, true, true)
  await page.route('**/api/v1/subscriptions?*', route => route.fulfill({ json: list([item]) }))
  await page.route('**/api/v1/reminders/preferences', route => route.fulfill({ json: { enabled: false, discordDmEnabled: false, allUnwatched: false, daysBefore: [7, 2], quietStartHour: 22, quietEndHour: 8, dailyCap: 10 } }))
  await page.goto('/demandes')
  await expect(page.getByLabel('Canal pour Le film partagé').locator('option[value="discord"]')).toHaveJSProperty('disabled', true)
  await expect(page.getByText('Activez vos notifications dans Mon compte', { exact: false })).toBeVisible()
})

test('availability inbox withdraws old content on errors and after unsubscribe', async ({ page }) => {
  await signedIn(page, true, true)
  let failed = false
  let removed = false
  await page.route('**/api/v1/subscriptions**', route => {
    if (route.request().method() === 'DELETE') { removed = true; return route.fulfill({ json: { ok: true } }) }
    if (new URL(route.request().url()).pathname.endsWith('/notifications')) return route.fulfill(failed ? { status: 503, json: { error: { message: 'Vérification indisponible.' } } } : { json: inbox(removed ? [] : [notice]) })
    return route.fulfill({ json: list(removed ? [] : [item]) })
  })
  await page.goto('/demandes')
  await expect(page.locator('.availability-row')).toContainText('Le film arrivé')
  failed = true
  await page.getByRole('button', { name: 'Actualiser les disponibilités' }).click()
  await expect(page.locator('.availability-inbox').getByRole('alert')).toContainText('Vérification indisponible')
  await expect(page.locator('.availability-row')).toHaveCount(0)
  failed = false
  await page.getByRole('button', { name: 'Réessayer les disponibilités' }).click()
  await expect(page.locator('.availability-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Ne plus suivre Le film partagé' }).click()
  await expect(page.locator('.availability-row')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mes disponibilités' })).toHaveCount(0)
})

test('an expired availability response and a late response after logout expose no content', async ({ page }) => {
  await signedIn(page, true, true)
  let late = false
  let requested = false
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/subscriptions/notifications', async route => {
    if (late) { requested = true; await pending }
    await route.fulfill({ json: { ...inbox([notice]), ...(!late ? { expiresAt: '2020-01-01T00:00:00Z' } : {}) } })
  })
  await page.goto('/demandes')
  await expect(page.locator('.availability-inbox').getByRole('alert')).toBeVisible()
  await expect(page.locator('.availability-row')).toHaveCount(0)
  late = true
  await page.getByRole('button', { name: 'Réessayer les disponibilités' }).click()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  release()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.availability-row')).toHaveCount(0)
})
