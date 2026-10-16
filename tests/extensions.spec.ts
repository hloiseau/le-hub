import { test, expect, type Page } from '@playwright/test'

function request() {
  return { id: 1, mediaId: '1', title: 'Une série à terminer', type: 'show', url: 'https://app.plex.tv/desktop/#!/server/fixture/details?key=%2Flibrary%2Fmetadata%2F1', estimatedAt: new Date(Date.now() + 7 * 86400_000).toISOString(), days: 7, reason: 'Un peu de temps', status: 'pending', adminNote: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), requester: 'Alice' }
}
async function signedIn(page: Page, admin = false, enabled = true) {
  const state = { signed: true, admin }
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/logout')) state.signed = false
    const data = path.endsWith('/session') ? { user: state.signed ? { name: 'Alice', plexId: '11111' } : null, plexConnected: state.signed, admin: state.admin }
      : path.endsWith('/capabilities') ? { departures: true, plexLink: true, extensionRequests: enabled }
        : path.endsWith('/departures') ? { scope: 'recorded_history', updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(), items: [{ id: '1', title: 'Une série à terminer', type: 'show', watch: 'unknown', estimatedAt: request().estimatedAt, url: request().url }] }
          : { items: [] }
    return route.fulfill({ json: data })
  })
  return state
}

test('request a delay, validate bounds and safely refresh its status', async ({ page }, testInfo) => {
  await signedIn(page)
  const items: ReturnType<typeof request>[] = []
  let writes = 0
  let adminCalls = 0
  await page.route('**/api/v1/admin/extension-requests', route => { adminCalls++; return route.fulfill({ status: 403, json: {} }) })
  await page.route('**/api/v1/extension-requests', route => {
    if (route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      expect(body).toEqual({ mediaId: '1', days: 7, reason: '<img src=x onerror=alert(1)>' })
      writes++
      items.push({ ...request(), reason: body.reason })
      return route.fulfill({ json: items[0] })
    }
    return route.fulfill({ json: { items } })
  })
  await page.goto('/avant-le-depart')
  await expect(page.getByText('Vous n’avez pas encore de demande de délai.')).toBeVisible()
  await page.getByRole('button', { name: 'Demander un délai', exact: true }).click()
  await page.getByLabel('Délai souhaité en jours').fill('31')
  await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect(page.getByRole('alert')).toContainText('1 à 30 jours')
  expect(writes).toBe(0)
  await page.getByLabel('Délai souhaité en jours').fill('7')
  await page.getByLabel('Motif (facultatif)').fill('<img src=x onerror=alert(1)>')
  await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect(page.locator('.extension-form [role=status]')).toContainText('Le délai et la conservation du contenu ne sont pas garantis')
  await expect(page.locator('.extension-row')).toHaveCount(1)
  await expect(page.locator('.request-reason')).toHaveText('<img src=x onerror=alert(1)>')
  await expect(page.locator('.extension-row img')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Demandes à examiner' })).toHaveCount(0)
  expect(adminCalls).toBe(0)
  expect(writes).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('extension-request.png'), fullPage: true })
})

test('changed departure errors allow retry and failed reads remove stale requests', async ({ page }) => {
  await signedIn(page)
  let failRead = false
  let writes = 0
  await page.route('**/api/v1/extension-requests', route => {
    if (route.request().method() === 'POST') { writes++; return route.fulfill({ status: 409, json: { error: { message: 'Ce départ a changé. Actualisez la liste avant de réessayer.' } } }) }
    return route.fulfill(failRead ? { status: 503, json: { error: { message: 'Demandes indisponibles.' } } } : { json: { items: [request()] } })
  })
  await page.goto('/avant-le-depart')
  await expect(page.locator('.extension-row')).toHaveCount(1)
  await page.getByRole('button', { name: 'Demander un délai', exact: true }).click()
  await page.getByLabel('Motif (facultatif)').fill('Finir demain')
  await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect(page.locator('.extension-form [role=alert]')).toContainText('Ce départ a changé')
  await expect(page.getByLabel('Motif (facultatif)')).toHaveValue('Finir demain')
  expect(writes).toBe(1)
  failRead = true
  await page.getByRole('button', { name: 'Actualiser mes demandes de délai' }).click()
  await expect(page.locator('.extension-requests [role=alert]')).toContainText('Demandes indisponibles')
  await expect(page.locator('.extension-row')).toHaveCount(0)
  failRead = false
  await page.getByRole('button', { name: 'Réessayer les demandes de délai' }).click()
  await expect(page.locator('.extension-row')).toHaveCount(1)
})

test('admin records a response without claiming to retain media', async ({ page }, testInfo) => {
  await signedIn(page, true)
  let pending = true
  let update: unknown
  await page.route('**/api/v1/admin/extension-requests', route => {
    if (route.request().method() === 'PUT') { update = route.request().postDataJSON(); pending = false; return route.fulfill({ json: { ok: true } }) }
    return route.fulfill({ json: { items: pending ? [{ ...request(), reason: '<script>alert(1)</script>' }] : [] } })
  })
  await page.goto('/avant-le-depart')
  const queue = page.getByRole('region', { name: 'Demandes à examiner' })
  await expect(queue.locator('.extension-row')).toHaveCount(1)
  await expect(queue.locator('.request-reason')).toHaveText('<script>alert(1)</script>')
  await expect(queue.locator('script')).toHaveCount(0)
  await queue.getByLabel('Réponse au membre (facultative)').fill('Je vérifie la place disponible.')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('extension-admin.png'), fullPage: true })
  await queue.getByRole('button', { name: 'Marquer examinée' }).click()
  expect(update).toEqual({ id: 1, status: 'reviewed', note: 'Je vérifie la place disponible.' })
  await expect(queue.getByText('Réponse enregistrée. Aucune date de retrait n’a été modifiée.')).toBeVisible()
  await expect(queue.locator('.extension-row')).toHaveCount(0)
  await expect(queue.getByText('Aucune demande en attente.')).toBeVisible()
})

test('admin refusal and authorization revocation clear the queue', async ({ page }) => {
  const state = await signedIn(page, true)
  let refused = false
  await page.route('**/api/v1/admin/extension-requests', route => {
    if (route.request().method() === 'PUT') {
      expect(route.request().postDataJSON()).toEqual({ id: 1, status: 'declined', note: '' })
      refused = true; state.admin = false
      return route.fulfill({ status: 403, json: { error: { message: 'Accès administrateur requis.' } } })
    }
    return route.fulfill({ json: { items: [request()] } })
  })
  await page.goto('/avant-le-depart')
  const queue = page.getByRole('region', { name: 'Demandes à examiner' })
  await queue.getByRole('button', { name: 'Refuser la demande' }).click()
  await expect(queue).toHaveCount(0)
  await expect(page.locator('.extension-row')).toHaveCount(0)
  expect(refused).toBe(true)
})

test('late mutation response cannot restore private request information after logout', async ({ page }) => {
  await signedIn(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let requested = false
  await page.route('**/api/v1/extension-requests', async route => {
    if (route.request().method() === 'POST') { requested = true; await pending; return route.fulfill({ json: request() }) }
    return route.fulfill({ json: { items: [] } })
  })
  await page.goto('/avant-le-depart')
  await page.getByRole('button', { name: 'Demander un délai', exact: true }).click()
  await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  release()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.extension-row')).toHaveCount(0)
  await expect(page.getByText('Demande enregistrée pour examen.', { exact: false })).toHaveCount(0)
})

test('disabled extension capability keeps requests hidden', async ({ page }) => {
  await signedIn(page, false, false)
  let calls = 0
  await page.route('**/api/v1/extension-requests', route => { calls++; return route.fulfill({ json: { items: [request()] } }) })
  await page.goto('/avant-le-depart')
  await expect(page.locator('.departure-row')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Demander un délai', exact: true })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Mes demandes de délai' })).toHaveCount(0)
  expect(calls).toBe(0)
})
