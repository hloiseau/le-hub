import { test, expect, type Page } from '@playwright/test'

const estimatedDeparture = new Date(Date.now() + 7 * 86400_000).toISOString()
function request() {
  return { id: 1, mediaId: '1', title: 'Une série à terminer', type: 'show', url: 'https://app.plex.tv/desktop/#!/server/fixture/details?key=%2Flibrary%2Fmetadata%2F1', estimatedAt: estimatedDeparture, days: 7, reason: 'Un peu de temps', status: 'pending', adminNote: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), requester: 'Alice' }
}
function departurePage() {
  const item = request()
  return { scope: 'personal_interest', updatedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(), items: [{ id: item.mediaId, title: item.title, type: item.type, watch: 'unknown', estimatedAt: item.estimatedAt, url: item.url }] }
}
async function signedIn(page: Page, admin = false, enabled = true) {
  const state = { signed: true, admin, plexId: '11111' }
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/logout')) state.signed = false
    const data = path.endsWith('/session') ? { user: state.signed ? { name: 'Alice', plexId: state.plexId } : null, plexConnected: state.signed, admin: state.admin }
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

test('automatic fresh verification preserves an open delay draft while disabling stale actions', async ({ page }) => {
  await page.clock.install()
  await signedIn(page)
  let reads = 0; let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/departures', async route => {
    if (++reads === 2) await pending
    return route.fulfill({ json: departurePage() })
  })
  await page.goto('/avant-le-depart')
  await page.getByRole('button', { name: 'Demander un délai', exact: true }).click()
  await page.getByLabel('Délai souhaité en jours').fill('12')
  await page.getByLabel('Motif (facultatif)').fill('Terminer cette saison pendant les vacances.')
  await page.clock.fastForward(60_001)
  await expect.poll(() => reads).toBe(2)
  await expect(page.locator('.departure-row')).toBeHidden()
  await expect(page.getByLabel('Motif (facultatif)')).toBeDisabled()
  await expect(page.locator('.extension-form button[type=submit]')).toBeDisabled()
  release()
  await expect(page.locator('.departure-row')).toBeVisible()
  await expect(page.getByLabel('Motif (facultatif)')).toHaveValue('Terminer cette saison pendant les vacances.')
  await expect(page.getByLabel('Délai souhaité en jours')).toHaveValue('12')
  await expect(page.getByRole('button', { name: 'Envoyer ma demande' })).toBeEnabled()
})

for (const outcome of ['success', 'error']) test(`an in-flight delay submission keeps its ${outcome} across fresh verification`, async ({ page }) => {
  await signedIn(page)
  let reads = 0; let writes = 0; let submitted = false
  let releaseRead!: () => void; let releaseWrite!: () => void
  const pendingRead = new Promise<void>(resolve => { releaseRead = resolve })
  const pendingWrite = new Promise<void>(resolve => { releaseWrite = resolve })
  await page.route('**/api/v1/departures', async route => {
    if (++reads === 2) await pendingRead
    return route.fulfill({ json: departurePage() })
  })
  await page.route('**/api/v1/extension-requests', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { items: submitted ? [request()] : [] } })
    writes++; await pendingWrite
    submitted = outcome === 'success'
    return route.fulfill(submitted ? { json: request() } : { status: 503, json: { error: { message: 'Enregistrement temporairement indisponible.' } } })
  })
  await page.goto('/avant-le-depart')
  await page.getByRole('button', { name: 'Demander un délai', exact: true }).click()
  await page.getByLabel('Motif (facultatif)').fill('Finir le dernier épisode.')
  await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect.poll(() => writes).toBe(1)
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
  await expect(page.locator('.departure-row')).toBeHidden()
  releaseRead()
  await expect(page.locator('.departure-row')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enregistrement…', exact: true })).toBeDisabled()
  releaseWrite()
  if (outcome === 'success') {
    await expect(page.locator('.extension-form [role=status]')).toContainText('Demande enregistrée pour examen.')
    await expect(page.locator('.extension-row')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Envoyer ma demande' })).toHaveCount(0)
  } else {
    await expect(page.locator('.extension-form [role=alert]')).toContainText('Enregistrement temporairement indisponible.')
    await expect(page.getByLabel('Motif (facultatif)')).toHaveValue('Finir le dernier épisode.')
    await expect(page.getByRole('button', { name: 'Envoyer ma demande' })).toBeEnabled()
  }
  expect(writes).toBe(1)
})

for (const invalidation of ['removed', 'source error', 'access revoked']) test(`a ${invalidation} clears the delay form and ignores a late submission response`, async ({ page }) => {
  const state = await signedIn(page)
  let reads = 0; let writes = 0; let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/departures', route => {
    if (++reads !== 2) return route.fulfill({ json: departurePage() })
    if (invalidation === 'removed') return route.fulfill({ json: { ...departurePage(), items: [] } })
    if (invalidation === 'access revoked') state.signed = false
    return route.fulfill({ status: invalidation === 'access revoked' ? 403 : 503, json: { error: { message: 'Départ non vérifiable.' } } })
  })
  await page.route('**/api/v1/extension-requests', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { items: [] } })
    writes++; await pending; return route.fulfill({ json: request() })
  })
  await page.goto('/avant-le-depart')
  await page.getByRole('button', { name: 'Demander un délai', exact: true }).click()
  await page.getByLabel('Motif (facultatif)').fill('Brouillon devenu caduc.')
  await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect.poll(() => writes).toBe(1)
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
  await expect(page.locator('.extension-form')).toHaveCount(0)
  release()
  await expect(page.getByText('Demande enregistrée pour examen.', { exact: false })).toHaveCount(0)
  if (invalidation !== 'access revoked') {
    await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
    await page.getByRole('button', { name: 'Demander un délai', exact: true }).click()
    await expect(page.getByLabel('Motif (facultatif)')).toHaveValue('')
  }
  expect(writes).toBe(1)
})

test('cancel a personal pending delay only after confirmation and prevent duplicate submissions', async ({ page }, testInfo) => {
  await signedIn(page)
  let item = request(); let writes = 0; let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/extension-requests', route => route.fulfill({ json: route.request().method() === 'POST' ? item : { items: [item] } }))
  await page.route('**/api/v1/extension-requests/1', async route => {
    expect(route.request().method()).toBe('DELETE')
    writes++; await pending; item = { ...item, status: 'cancelled' }
    return route.fulfill({ json: { ok: true } })
  })
  await page.goto('/avant-le-depart')
  const mine = page.getByRole('region', { name: 'Mes demandes de délai' })
  await mine.getByRole('button', { name: 'Annuler ma demande', exact: true }).click()
  expect(writes).toBe(0)
  await mine.getByRole('button', { name: 'Garder ma demande' }).click()
  await expect(mine.getByRole('button', { name: 'Annuler ma demande', exact: true })).toBeFocused()
  await mine.getByRole('button', { name: 'Annuler ma demande', exact: true }).click()
  await expect(mine.getByRole('group', { name: 'Annuler votre demande de délai pour « Une série à terminer » ?' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.evaluate(() => { if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: `.cache/extension-cancellation-captures/confirmation-${testInfo.project.name}.png`, fullPage: true })
  await mine.getByRole('button', { name: 'Confirmer l’annulation' }).click()
  await expect.poll(() => writes).toBe(1)
  await expect(mine.getByRole('button', { name: 'Annulation…' })).toBeDisabled()
  await expect(mine.getByRole('button', { name: 'Garder ma demande' })).toBeDisabled()
  await page.getByRole('button', { name: 'Demander un délai', exact: true }).click()
  await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect(page.locator('.extension-form [role=status]')).toContainText('Demande enregistrée pour examen.')
  await expect(mine.getByRole('button', { name: 'Annulation…' })).toBeDisabled()
  release()
  await expect(mine.getByText('Annulée', { exact: true })).toBeVisible()
  await expect(mine.getByText('Demande annulée. Aucune date de retrait n’a été modifiée.')).toBeVisible()
  await expect(mine.getByRole('button', { name: 'Annuler ma demande', exact: true })).toHaveCount(0)
  expect(writes).toBe(1)
})

test('completed and expired requests cannot be cancelled or reviewed and an elapsed deadline clears confirmation', async ({ page }) => {
  await page.clock.install()
  await signedIn(page, true)
  const ending = { ...request(), estimatedAt: new Date(Date.now() + 2000).toISOString() }
  const items = [ending, ...['reviewed', 'declined', 'cancelled', 'expired'].map((status, index) => ({ ...request(), id: index + 2, status }))]
  await page.route('**/api/v1/extension-requests', route => route.fulfill({ json: { items } }))
  await page.route('**/api/v1/admin/extension-requests', route => route.fulfill({ json: { items: [ending, { ...request(), id: 99, status: 'expired' }] } }))
  await page.goto('/avant-le-depart')
  const mine = page.getByRole('region', { name: 'Mes demandes de délai' })
  const admin = page.getByRole('region', { name: 'Demandes à examiner' })
  await expect(mine.getByRole('button', { name: 'Annuler ma demande', exact: true })).toHaveCount(1)
  await expect(admin.getByRole('button', { name: 'Marquer examinée' })).toHaveCount(1)
  await mine.getByRole('button', { name: 'Annuler ma demande', exact: true }).click()
  await admin.getByLabel('Réponse au membre (facultative)').fill('Brouillon avant échéance')
  await page.clock.fastForward(3000)
  await expect(mine.getByRole('button', { name: 'Confirmer l’annulation' })).toHaveCount(0)
  await expect(mine.getByRole('button', { name: 'Annuler ma demande', exact: true })).toHaveCount(0)
  await expect(mine.getByText('Échéance passée', { exact: true })).toHaveCount(2)
  await expect(admin.getByRole('button', { name: 'Marquer examinée' })).toHaveCount(0)
  await expect(admin.getByLabel('Réponse au membre (facultative)')).toHaveCount(0)
  await expect(mine.getByText('Cette échéance passée ne confirme pas la suppression du contenu.')).toHaveCount(2)
})

test('a cancellation conflict refreshes the changed request while a rate limit keeps a retryable confirmation', async ({ page }) => {
  await signedIn(page)
  let writes = 0; let item = request()
  await page.route('**/api/v1/extension-requests', route => route.fulfill({ json: { items: [item] } }))
  await page.route('**/api/v1/extension-requests/1', route => {
    if (++writes === 1) return route.fulfill({ status: 429, json: { error: { message: 'Trop de demandes. Réessayez dans un instant.' } } })
    item = { ...item, status: 'reviewed', adminNote: 'Examinée entre-temps.' }
    return route.fulfill({ status: 409, json: { error: { code: 'request_changed', message: 'Cette demande a changé. Actualisez son état.' } } })
  })
  await page.goto('/avant-le-depart')
  const mine = page.getByRole('region', { name: 'Mes demandes de délai' })
  await mine.getByRole('button', { name: 'Annuler ma demande', exact: true }).click()
  await mine.getByRole('button', { name: 'Confirmer l’annulation' }).click()
  await expect(mine.getByRole('alert')).toContainText('Trop de demandes')
  await expect(mine.getByRole('button', { name: 'Confirmer l’annulation' })).toBeEnabled()
  await mine.getByRole('button', { name: 'Confirmer l’annulation' }).click()
  await expect(mine.getByText('Examinée', { exact: true })).toBeVisible()
  await expect(mine.getByRole('alert')).toContainText('Cette demande a changé')
  await expect(mine.getByRole('button', { name: 'Confirmer l’annulation' })).toHaveCount(0)
  await expect(mine.getByText('Demande annulée.', { exact: false })).toHaveCount(0)
  expect(writes).toBe(2)
})

for (const code of [401, 403]) test(`a ${code} during cancellation revokes the private list`, async ({ page }) => {
  const state = await signedIn(page)
  await page.route('**/api/v1/extension-requests', route => route.fulfill({ json: { items: [request()] } }))
  await page.route('**/api/v1/extension-requests/1', route => { state.signed = false; return route.fulfill({ status: code, json: { error: { message: 'Accès expiré.' } } }) })
  await page.goto('/avant-le-depart')
  await page.getByRole('button', { name: 'Annuler ma demande', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmer l’annulation' }).click()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.extension-row')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Confirmer l’annulation' })).toHaveCount(0)
})

for (const change of ['logout', 'account']) test(`a late cancellation response is ignored after ${change}`, async ({ page }) => {
  const state = await signedIn(page)
  let release!: () => void; let sent = false; let resolved = false; let calls = 0
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/extension-requests', route => route.fulfill({ json: { items: state.plexId === '11111' ? [request()] : [] } }))
  await page.route('**/api/v1/extension-requests/1', async route => { sent = true; await pending; await route.fulfill({ json: { ok: true } }); resolved = true })
  await page.route('**/api/v1/departures', route => {
    if (++calls === 2) return route.fulfill({ status: 403, json: { error: { message: 'Session modifiée.' } } })
    return route.fulfill({ json: departurePage() })
  })
  await page.goto('/avant-le-depart')
  await page.getByRole('button', { name: 'Annuler ma demande', exact: true }).click()
  await page.getByRole('button', { name: 'Confirmer l’annulation' }).click()
  await expect.poll(() => sent).toBe(true)
  if (change === 'logout') {
    await page.getByRole('button', { name: 'Déconnexion' }).click()
    await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  } else {
    state.plexId = '22222'
    await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
    await expect(page.getByText('Vous n’avez pas encore de demande de délai.')).toBeVisible()
  }
  release()
  await expect.poll(() => resolved).toBe(true)
  await expect(page.locator('.extension-row')).toHaveCount(0)
  await expect(page.getByText('Demande annulée.', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Confirmer l’annulation' })).toHaveCount(0)
})

for (const [status, message] of Object.entries({ reviewed: 'Cette demande a déjà été examinée.', declined: 'Cette demande a été refusée.', cancelled: 'Cette demande a été annulée.', expired: 'L’échéance de cette demande est passée.' })) test(`an idempotent delay POST shows the existing ${status} outcome`, async ({ page }) => {
  await signedIn(page)
  await page.route('**/api/v1/extension-requests', route => route.fulfill({ json: route.request().method() === 'POST' ? { ...request(), status } : { items: [] } }))
  await page.goto('/avant-le-depart')
  await page.getByRole('button', { name: 'Demander un délai', exact: true }).click()
  await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect(page.locator('.extension-form [role=status]')).toContainText(message)
  await expect(page.getByText('Demande enregistrée pour examen.', { exact: false })).toHaveCount(0)
})

for (const submitted of [true, false]) test(`a changed deadline resets an ${submitted ? 'acknowledged' : 'in-flight'} delay request for the same media`, async ({ page }) => {
  await signedIn(page)
  const original = departurePage()
  let reads = 0; let writes = 0; let release!: () => void; let resolved = false
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/departures', route => route.fulfill({ json: ++reads === 1 ? original : { ...original, items: original.items.map(item => ({ ...item, estimatedAt: new Date(Date.parse(item.estimatedAt) + 86400_000).toISOString() })) } }))
  await page.route('**/api/v1/extension-requests', async route => {
    if (route.request().method() !== 'POST') return route.fulfill({ json: { items: [] } })
    writes++
    if (!submitted) await pending
    await route.fulfill({ json: request() }); resolved = true
  })
  await page.goto('/avant-le-depart')
  await page.getByRole('button', { name: 'Demander un délai', exact: true }).click()
  await page.getByLabel('Motif (facultatif)').fill('Motif pour la première échéance.')
  await page.getByRole('button', { name: 'Envoyer ma demande' }).click()
  await expect.poll(() => writes).toBe(1)
  if (submitted) await expect(page.locator('.extension-form [role=status]')).toContainText('Demande enregistrée pour examen.')
  await page.getByRole('button', { name: 'Actualiser', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Demander un délai', exact: true })).toBeVisible()
  release()
  await expect.poll(() => resolved).toBe(true)
  await expect(page.locator('.extension-form [role=status]')).toHaveCount(0)
  await page.getByRole('button', { name: 'Demander un délai', exact: true }).click()
  await expect(page.getByLabel('Motif (facultatif)')).toHaveValue('')
  await expect(page.getByRole('button', { name: 'Envoyer ma demande' })).toBeEnabled()
  expect(writes).toBe(1)
})
