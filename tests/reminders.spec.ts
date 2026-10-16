import { test, expect, type Page } from '@playwright/test'

const defaults = { enabled: false, discordDmEnabled: false, availableUnwatched: false, daysBefore: [7, 2], quietStartHour: 22, quietEndHour: 8, dailyCap: 10, allUnwatched: false }

test('old request reminders need a separate opt in and share the existing preferences', async ({ page }) => {
  await signedIn(page)
  let preferences = { ...defaults }
  await page.route('**/api/v1/reminders/preferences', route => {
    if (route.request().method() === 'PUT') preferences = route.request().postDataJSON()
    return route.fulfill({ json: preferences })
  })
  await page.goto('/compte')
  const choice = page.getByRole('checkbox', { name: 'Me rappeler mes anciennes demandes non vues' })
  await expect(choice).not.toBeChecked()
  await expect(choice).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Activer mes rappels dans Le Hub' }).check()
  await expect(choice).not.toBeChecked()
  await choice.check()
  await page.getByRole('button', { name: 'Enregistrer mes rappels' }).click()
  await expect(page.getByRole('status')).toContainText('préférences sont enregistrées')
  expect(preferences.availableUnwatched).toBe(true)
  expect(preferences.discordDmEnabled).toBe(false)
  await page.reload()
  await expect(choice).toBeChecked()
  await expect(page.getByText('Une relance entre 30 et 90 jours', { exact: false })).toBeVisible()
})

test('old request inbox shows the actual Plex addition without inventing a departure', async ({ page }) => {
  await signedIn(page)
  const data = reminderPage()
  const { estimatedAt: _deadline, ...base } = data.items[0]!
  await page.route('**/api/v1/reminders', route => route.fulfill({ json: { ...data, items: [{ ...base, reason: 'available_unwatched', milestoneDays: 0, availableAt: new Date(Date.now() - 40 * 86400_000).toISOString() }] } }))
  await page.goto('/avant-le-depart')
  const row = page.locator('.reminder-row')
  await expect(row).toContainText('Demandé et toujours non vu')
  await expect(row).toContainText('Ajouté dans Plex le')
  await expect(row).not.toContainText('Départ estimé')
  await expect(page.getByRole('link', { name: 'Ouvrir dans Plex' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
})

test('all unwatched stays optional and its explicit choice survives saving', async ({ page }) => {
  await signedIn(page)
  let preferences = { ...defaults }
  await page.route('**/api/v1/reminders/preferences', route => {
    if (route.request().method() === 'PUT') preferences = route.request().postDataJSON()
    return route.fulfill({ json: preferences })
  })
  await page.goto('/compte')
  const choice = page.getByRole('checkbox', { name: 'Inclure tous mes contenus non vus' })
  await expect(choice).not.toBeChecked()
  await choice.check()
  await page.getByRole('button', { name: 'Enregistrer mes rappels' }).click()
  await expect(page.getByRole('status')).toContainText('préférences sont enregistrées')
  expect(preferences.allUnwatched).toBe(true)
  await page.reload()
  await expect(choice).toBeChecked()
})

test('unstarted reminder names the Plex state and offers to open the film', async ({ page }) => {
  await signedIn(page)
  const data = reminderPage()
  data.scope = 'personal_interest'
  data.items[0]!.reason = 'unstarted_before_removal'
  await page.route('**/api/v1/reminders', route => route.fulfill({ json: data }))
  await page.goto('/avant-le-depart')
  await expect(page.locator('.reminder-row')).toContainText('Marqué non vu dans Plex')
  await expect(page.getByRole('link', { name: 'Ouvrir dans Plex' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reprendre dans Plex' })).toHaveCount(0)
})
async function signedIn(page: Page, discord: { enabled?: boolean, linked?: boolean } = {}) {
  let signed = true
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/logout')) signed = false
    const data = path.endsWith('/session') ? { user: signed ? { name: 'Alice', plexId: '11111', ...(discord.linked ? { discordId: '22222' } : {}) } : null, plexConnected: signed }
      : path.endsWith('/capabilities') ? { departures: true, requests: true, plexLink: true, notifications: true, discordDMs: discord.enabled === true }
        : path.endsWith('/reminders/preferences') ? defaults
          : { items: [], scope: 'recorded_history', updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }
    return route.fulfill({ json: data })
  })
}
function reminderPage() {
  return { scope: 'recorded_history', updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), items: [
    { id: 1, title: '<img src=x onerror=alert(1)>', type: 'movie', reason: 'unfinished_before_removal', milestoneDays: 7, estimatedAt: new Date(Date.now() + 7 * 86400_000).toISOString(), sentAt: new Date().toISOString(), url: 'https://app.plex.tv/desktop/#!/server/fixture/details?key=%2Flibrary%2Fmetadata%2F1' },
  ] }
}

test('reminder preferences opt in explicitly and persist only targeted inbox delivery', async ({ page }, testInfo) => {
  await signedIn(page)
  let preferences = { ...defaults }
  let writes = 0
  await page.route('**/api/v1/reminders/preferences', route => {
    if (route.request().method() === 'PUT') { preferences = route.request().postDataJSON(); writes++ }
    return route.fulfill({ json: preferences })
  })
  await page.goto('/compte')
  await expect(page.getByRole('checkbox', { name: 'Activer mes rappels dans Le Hub' })).not.toBeChecked()
  await expect(page.getByText('Désactivés par défaut. Les messages privés Discord se choisissent séparément.')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Activer mes rappels dans Le Hub' }).check()
  await page.getByLabel('Combien de jours avant le départ ?').fill('7, 7')
  await page.getByRole('button', { name: 'Enregistrer mes rappels' }).click()
  await expect(page.getByRole('alert')).toContainText('délais différents')
  expect(writes).toBe(0)
  await page.getByLabel('Combien de jours avant le départ ?').fill('10, 3')
  await page.getByLabel('Heures calmes : début').fill('23')
  await page.getByLabel('Fin', { exact: true }).fill('7')
  await page.getByLabel('Nombre maximal de rappels par jour').fill('5')
  await page.getByRole('button', { name: 'Enregistrer mes rappels' }).click()
  await expect(page.getByRole('status')).toContainText('rappels dans Le Hub sont activés')
  expect(preferences).toEqual({ enabled: true, discordDmEnabled: false, availableUnwatched: false, daysBefore: [10, 3], quietStartHour: 23, quietEndHour: 7, dailyCap: 5, allUnwatched: false })
  await page.reload()
  await expect(page.getByRole('checkbox', { name: 'Activer mes rappels dans Le Hub' })).toBeChecked()
  await expect(page.getByLabel('Combien de jours avant le départ ?')).toHaveValue('10, 3')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('reminder-preferences.png'), fullPage: true })
})

test('private reminder inbox renders safely and withdraws content after an upstream error', async ({ page }, testInfo) => {
  await signedIn(page)
  let failed = false
  await page.route('**/api/v1/reminders', route => route.fulfill(failed ? { status: 503, json: { error: { message: 'Rappels temporairement indisponibles.' } } } : { json: reminderPage() }))
  await page.goto('/avant-le-depart')
  await expect(page.locator('.reminder-row')).toHaveCount(1)
  await expect(page.getByRole('heading', { name: '<img src=x onerror=alert(1)>' })).toBeVisible()
  await expect(page.locator('.reminder-list img')).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Reprendre dans Plex' })).toHaveAttribute('href', /^https:\/\/app\.plex\.tv\//)
  await expect(page.getByText('Les messages privés Discord sont facultatifs et se règlent dans votre compte.', { exact: false })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('reminder-inbox.png'), fullPage: true })
  failed = true
  await page.getByRole('button', { name: 'Actualiser mes rappels' }).click()
  await expect(page.getByRole('alert')).toContainText('Rappels temporairement indisponibles')
  await expect(page.locator('.reminder-row')).toHaveCount(0)
  failed = false
  await page.getByRole('button', { name: 'Réessayer les rappels' }).click()
  await expect(page.locator('.reminder-row')).toHaveCount(1)
})

test('Discord reminder consent is separate and is cleared when reminders are disabled', async ({ page }) => {
  await signedIn(page, { enabled: true, linked: true })
  let preferences = { ...defaults }
  await page.route('**/api/v1/reminders/preferences', route => {
    if (route.request().method() === 'PUT') preferences = route.request().postDataJSON()
    return route.fulfill({ json: preferences })
  })
  await page.goto('/compte')
  const inbox = page.getByRole('checkbox', { name: 'Activer mes rappels dans Le Hub' })
  const discord = page.getByRole('checkbox', { name: 'Recevoir aussi mes rappels en message privé Discord' })
  await expect(discord).not.toBeChecked()
  await expect(discord).toBeDisabled()
  await inbox.check()
  await expect(discord).toBeEnabled()
  await expect(discord).not.toBeChecked()
  await page.getByRole('button', { name: 'Enregistrer mes rappels' }).click()
  await expect(page.getByRole('status')).toContainText('préférences sont enregistrées')
  expect(preferences.discordDmEnabled).toBe(false)
  await discord.check()
  await page.getByRole('button', { name: 'Enregistrer mes rappels' }).click()
  await expect(page.getByRole('status')).toContainText('Les messages privés Discord sont également activés')
  expect(preferences.discordDmEnabled).toBe(true)
  await page.reload()
  await expect(discord).toBeChecked()
  await inbox.uncheck()
  await page.getByRole('button', { name: 'Enregistrer mes rappels' }).click()
  await expect(page.getByRole('status')).toContainText('rappels sont désactivés')
  expect(preferences.discordDmEnabled).toBe(false)
  await inbox.check()
  await expect(discord).not.toBeChecked()
})

for (const state of [{ enabled: false, linked: true }, { enabled: true, linked: false }]) {
  test(`Discord consent requires both channel configuration and linked identity (${JSON.stringify(state)})`, async ({ page }) => {
    await signedIn(page, state)
    await page.goto('/compte')
    await page.getByRole('checkbox', { name: 'Activer mes rappels dans Le Hub' }).check()
    await expect(page.getByRole('checkbox', { name: 'Recevoir aussi mes rappels en message privé Discord' })).toBeDisabled()
    await expect(page.getByText(state.linked ? 'Les messages privés Discord ne sont pas disponibles sur ce serveur.' : 'Liez votre compte Discord pour choisir les messages privés.')).toBeVisible()
  })
}

test('expired reminders disappear when fresh verification fails', async ({ page }) => {
  await signedIn(page)
  let calls = 0
  await page.route('**/api/v1/reminders', route => {
    if (++calls > 1) return route.fulfill({ status: 503, json: { error: { message: 'Vérification indisponible.' } } })
    const data = reminderPage(); data.expiresAt = new Date(Date.now() + 2500).toISOString()
    return route.fulfill({ json: data })
  })
  await page.goto('/avant-le-depart')
  await expect(page.locator('.reminder-row')).toHaveCount(1)
  await expect(page.getByRole('alert')).toContainText('Vérification indisponible', { timeout: 10_000 })
  await expect(page.locator('.reminder-row')).toHaveCount(0)
})

test('pending reminder responses cannot restore the inbox after logout', async ({ page }) => {
  await signedIn(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let requested = false
  await page.route('**/api/v1/reminders', async route => { requested = true; await pending; await route.fulfill({ json: reminderPage() }) })
  await page.goto('/avant-le-depart')
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  release()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.reminder-row')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mes rappels' })).toHaveCount(0)
})
