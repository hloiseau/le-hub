import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

const diagnostic = () => ({ source: 'sonarr', version: '5.0.0', stage: 'manual_import', summary: 'Un import manuel doit être vérifié.', evidence: [{ stage: 'manual_import', message: 'Un import manuel doit être vérifié.' }, { stage: 'importing', message: '<img src=x onerror=alert(1)>', at: '2026-10-18T12:00:00Z' }], checkedAt: '2026-10-18T13:00:00Z', queueTruncated: true, historyTruncated: true, plexStatus: 'not_verified', guideUrl: 'https://wiki.servarr.com/radarr/faq#manual-import' })

async function signedIn(page: Page, admin = true) {
  const state = { admin, signed: true, plexId: '1', requestId: 7, sessionReads: 0 }
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/logout')) { state.signed = false; return route.fulfill({ json: { ok: true } }) }
    if (path.endsWith('/session')) { state.sessionReads++; return route.fulfill({ json: { user: state.signed ? { name: 'Alice', plexId: state.plexId, discordId: 'admin', seerrId: 42 } : null, plexConnected: state.signed, admin: state.admin } }) }
    return route.fulfill({ json: path.endsWith('/services') ? { items: [] }
      : path.endsWith('/requests') ? { items: [{ id: state.requestId, title: `Demande ${state.requestId}`, type: 'tv', status: 'processing', createdAt: '2026-10-18T12:00:00Z', mediaId: 101, seasons: [1] }], total: 1, offset: 0, limit: 10 }
        : { requests: true, plexLink: true } })
  })
  return state
}

test('admin explicitly checks a request and sees bounded, dated source evidence', async ({ page }, testInfo) => {
  await signedIn(page)
  let calls = 0
  await page.route('**/api/v1/admin/diagnostics?*', route => {
    calls++
    expect(route.request().method()).toBe('GET')
    expect([...new URL(route.request().url()).searchParams]).toEqual([['requestId', '7']])
    return route.fulfill({ json: diagnostic() })
  })
  await page.goto('/demandes')
  await page.locator('summary').click()
  const region = page.getByRole('region', { name: 'Diagnostic administrateur' })
  await expect(region.getByRole('button', { name: 'Vérifier cette demande' })).toBeVisible()
  expect(calls).toBe(0)
  await region.getByRole('button').click()
  await expect(region.getByText('Un import manuel doit être vérifié.', { exact: true })).toHaveCount(1)
  await expect(region).toContainText('Import manuel à vérifier')
  await expect(region).toContainText('Sonarr 5.0.0')
  await expect(region).toContainText('18 oct. 2026, 15:00')
  await expect(region).toContainText('Indexation Plex non vérifiée')
  await expect(region).toContainText('file limitée à 50 éléments ; historique limité à 30 événements récents')
  await expect(region.getByText('<img src=x onerror=alert(1)>', { exact: false })).toBeVisible()
  await expect(region.locator('img')).toHaveCount(0)
  await expect(region.getByRole('link')).toHaveAttribute('href', 'https://wiki.servarr.com/radarr/faq#manual-import')
  expect(calls).toBe(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('request-diagnostic.png'), fullPage: true })
})

test('ordinary members never see or fetch an admin diagnostic', async ({ page }) => {
  await signedIn(page, false)
  let calls = 0
  await page.route('**/api/v1/admin/diagnostics?*', route => { calls++; return route.fulfill({ json: diagnostic() }) })
  await page.goto('/demandes')
  await page.locator('summary').click()
  await expect(page.locator('.request-detail')).toHaveAttribute('open', '')
  await expect(page.locator('.request-diagnostic')).toHaveCount(0)
  expect(calls).toBe(0)
})

test('source failure can be retried without retaining a result or an unsafe guide link', async ({ page }) => {
  await signedIn(page)
  let calls = 0
  await page.route('**/api/v1/admin/diagnostics?*', route => ++calls === 1
    ? route.fulfill({ status: 503, json: { error: { message: 'La source est momentanément indisponible.' } } })
    : route.fulfill({ json: { ...diagnostic(), plexStatus: 'indexed', guideUrl: 'https://wiki.servarr.com.evil.example/radarr/faq' } }))
  await page.goto('/demandes')
  await page.locator('summary').click()
  const region = page.getByRole('region', { name: 'Diagnostic administrateur' })
  await region.getByRole('button').click()
  await expect(region.getByRole('alert')).toHaveText('La source est momentanément indisponible.')
  await expect(region.locator('.diagnostic-result')).toHaveCount(0)
  expect(calls).toBe(1)
  await region.getByRole('button', { name: 'Réessayer le diagnostic' }).click()
  await expect(region).toContainText('Métadonnées retrouvées dans Plex')
  await expect(region).toContainText('Cela ne confirme ni la lecture ni la présence de tous les épisodes.')
  await expect(region.getByRole('alert')).toHaveCount(0)
  await expect(region.getByRole('link')).toHaveCount(0)
  expect(calls).toBe(2)
})

for (const invalidate of ['close', 'request changes', 'logout']) test(`a late diagnostic cannot return after ${invalidate}`, async ({ page }) => {
  const state = await signedIn(page)
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let calls = 0
  await page.route('**/api/v1/admin/diagnostics?*', async route => {
    const first = ++calls === 1
    if (first) await pending
    return route.fulfill({ json: { ...diagnostic(), summary: first ? 'Ancien résultat privé.' : 'Résultat demandé à nouveau.' } })
  })
  await page.goto('/demandes')
  await page.locator('summary').click()
  await page.getByRole('button', { name: 'Vérifier cette demande' }).click()
  await expect(page.getByRole('button', { name: 'Vérification…', exact: true })).toBeDisabled()
  await expect.poll(() => calls).toBe(1)
  if (invalidate === 'close') {
    await page.locator('summary').click()
    await expect(page.locator('.request-diagnostic')).toHaveCount(0)
    await page.locator('summary').click()
  } else if (invalidate === 'request changes') {
    state.requestId = 8
    await page.getByRole('button', { name: 'Actualiser mes demandes' }).click()
    await expect(page.locator('.request-row h3')).toHaveText('Demande 8')
    await page.locator('summary').click()
  } else {
    await page.getByRole('button', { name: 'Déconnexion' }).click()
    await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  }
  if (invalidate !== 'logout') {
    await expect(page.getByRole('button', { name: 'Vérifier cette demande' })).toBeEnabled()
    await page.getByRole('button', { name: 'Vérifier cette demande' }).click()
    await expect(page.getByText('Résultat demandé à nouveau.', { exact: true })).toBeVisible()
  }
  const response = page.waitForResponse(url => url.url().includes('/admin/diagnostics?requestId=7'))
  release()
  await (await response).finished()
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(page.getByText('Ancien résultat privé.', { exact: true })).toHaveCount(0)
  if (invalidate !== 'logout') await expect(page.getByText('Résultat demandé à nouveau.', { exact: true })).toBeVisible()
})

test('revoked admin access refreshes the session and clears the diagnostic', async ({ page }) => {
  const state = await signedIn(page)
  let calls = 0
  await page.route('**/api/v1/admin/diagnostics?*', route => {
    if (++calls === 1) return route.fulfill({ json: diagnostic() })
    state.admin = false
    return route.fulfill({ status: 403, json: { error: { message: 'Accès administrateur requis.' } } })
  })
  await page.goto('/demandes')
  await page.locator('summary').click()
  await page.getByRole('button', { name: 'Vérifier cette demande' }).click()
  await expect(page.locator('.diagnostic-result')).toBeVisible()
  await page.getByRole('button', { name: 'Actualiser le diagnostic' }).click()
  await expect(page.locator('.request-diagnostic')).toHaveCount(0)
  await expect(page.locator('.request-row')).toHaveCount(1)
  expect(state.sessionReads).toBeGreaterThan(1)
  expect(calls).toBe(2)
})

test('a different Plex session loses the previous diagnostic even when the request ID is unchanged', async ({ page }) => {
  const state = await signedIn(page)
  let calls = 0
  await page.route('**/api/v1/admin/diagnostics?*', route => { calls++; return route.fulfill({ json: diagnostic() }) })
  await page.goto('/demandes')
  await page.locator('summary').click()
  await page.getByRole('button', { name: 'Vérifier cette demande' }).click()
  await expect(page.locator('.diagnostic-result')).toBeVisible()
  state.plexId = '2'
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => state.sessionReads).toBeGreaterThan(1)
  await expect(page.locator('.diagnostic-result')).toHaveCount(0)
  await expect(page.locator('.request-row')).toHaveCount(1)
  await page.locator('summary').click()
  await expect(page.getByRole('button', { name: 'Vérifier cette demande' })).toBeVisible()
  expect(calls).toBe(1)
})
