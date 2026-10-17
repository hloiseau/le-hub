import { test, expect, type Page } from '@playwright/test'

const observed = (value: number | null, unit = 'percent', status = value === null ? 'unavailable' : 'available') => ({ value, unit, status })
function snapshot(expires = 60_000) {
  const now = new Date().toISOString()
  return { updatedAt: now, expiresAt: new Date(Date.now() + expires).toISOString(), hostUpdatedAt: now, activityUpdatedAt: now,
    metrics: { cpu_percent: observed(0), memory_used_bytes: observed(1073741824, 'bytes'), gpu_video_percent: observed(null), cpu_temperature: observed(null, 'celsius', 'error') },
    activity: { status: 'available', sessions: 3, directPlay: 1, directStream: 1, transcodes: 1, hardwareTranscodes: null, bandwidthKbps: 3000 } }
}
function history(range = '24h') {
  const now = Date.now(); const step = range === '1h' ? 60 : range === '7d' ? 1800 : 300
  return { range, stepSeconds: step, aggregation: 'mean', retentionDays: 7, updatedAt: new Date(now).toISOString(),
    items: [20, 40, null, 60, 80].map((v, i) => ({ at: new Date(now - (5 - i) * step * 1000).toISOString(), values: { cpu_percent: observed(v) } })) }
}
async function routes(page: Page, options: { admin?: boolean, enabled?: boolean, expires?: number } = {}) {
  let signed = true; const counts = { current: 0, admin: 0, ranges: [] as string[] }
  await page.route('**/api/v1/**', route => {
    const url = new URL(route.request().url()); const path = url.pathname
    if (path.endsWith('/auth/logout')) signed = false
    let data: unknown = { items: [] }
    if (path.endsWith('/session')) data = { user: signed ? { name: 'Alice', plexId: '11111' } : null, plexConnected: signed, admin: options.admin === true }
    else if (path.endsWith('/capabilities')) data = { monitoring: options.enabled !== false, plexLink: true }
    else if (path.endsWith('/monitoring')) { counts.current++; data = snapshot(options.expires) }
    else if (path.endsWith('/monitoring/history')) { const range = url.searchParams.get('range') || '24h'; counts.ranges.push(range); data = history(range) }
    else if (path.endsWith('/admin/plex-activity')) { counts.admin++; data = { ...snapshot(options.expires), hostVersion: '25.10 fixture', hostDetails: [{ kind: 'pool', name: 'PRIVATE POOL', status: 'available', values: {} }], sessions: [{ user: '<img src=x onerror=alert(1)>', title: 'PRIVATE TITLE', state: 'playing', decision: 'transcode', videoCodec: 'hevc', audioCodec: 'aac', bandwidthKbps: 3000, hardwareDecoding: true, hardwareEncoding: false }] } }
    return route.fulfill({ json: data })
  })
  return counts
}

test('monitoring renders real zeros, missing values, gaps and interactive history', async ({ page }, testInfo) => {
  const counts = await routes(page)
  await page.goto('/performances')
  await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('0 %')
  await expect(page.locator('[data-metric="memory_used_bytes"] dd')).toHaveText('1 Gio')
  await expect(page.locator('[data-metric="gpu_video_percent"] dd')).toHaveText('Non disponible')
  await expect(page.locator('[data-metric="cpu_temperature"] dd')).toHaveText('Mesure en erreur')
  await expect(page.locator('.activity-counts')).toContainText('Non renseigné')
  await expect(page.locator('.metric-chart .curve')).toHaveCount(2)
  await expect(page.locator('.metric-chart circle')).toHaveCount(4)
  const graph = page.getByRole('img', { name: /^Historique : Utilisation CPU/ })
  expect((await graph.boundingBox())?.height).toBeGreaterThan(180)
  await graph.focus(); await graph.press('Home')
  await expect(page.locator('.chart-tooltip')).toContainText('20 %')
  await graph.press('ArrowRight'); await expect(page.locator('.chart-tooltip')).toContainText('40 %')
  await graph.press('ArrowRight'); await expect(page.locator('.chart-tooltip')).toContainText('Non disponible')
  await page.getByLabel('Période', { exact: true }).selectOption('1h')
  await expect.poll(() => counts.ranges.includes('1h')).toBeTruthy()
  await page.getByLabel('Fin du zoom').fill('50')
  await expect(page.getByText('Aucune mesure sur cette période.')).toBeVisible()
  await page.getByRole('button', { name: 'Réinitialiser le zoom' }).click()
  await expect(page.locator('.metric-chart circle')).toHaveCount(4)
  await page.getByText('Consulter les mesures en tableau').click()
  await expect(page.locator('.chart-table tbody tr')).toHaveCount(5)
  await expect(page.getByRole('heading', { name: 'Détails administrateur' })).toHaveCount(0)
  expect(counts.admin).toBe(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('monitoring-history.png'), fullPage: true })
})

test('administrator details are opt in, escaped and expire with the aggregate view', async ({ page }) => {
  const counts = await routes(page, { admin: true, expires: 3000 })
  await page.goto('/performances')
  await expect(page.getByRole('checkbox', { name: 'Afficher les sessions et les équipements' })).not.toBeChecked()
  expect(counts.admin).toBe(0)
  await page.getByRole('checkbox', { name: 'Afficher les sessions et les équipements' }).check()
  await expect(page.locator('.session-row')).toContainText('PRIVATE TITLE')
  await expect(page.locator('.session-row img')).toHaveCount(0)
  await expect(page.locator('.host-row')).toContainText('PRIVATE POOL')
  await expect(page.locator('.session-row')).toHaveCount(0, { timeout: 8000 })
  await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('Donnée périmée')
})

test('monitoring polling pauses while hidden and failures withdraw current observations', async ({ page }) => {
  const counts = await routes(page)
  await page.clock.install()
  await page.goto('/performances')
  await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('0 %')
  const initial = counts.current
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.fastForward(65_000)
  expect(counts.current).toBe(initial)
  await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('Donnée périmée')
  await page.route('**/api/v1/monitoring', route => route.fulfill({ status: 503, json: { error: { message: 'Mesures temporairement indisponibles.' } } }))
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')) })
  await expect(page.getByRole('alert')).toContainText('Mesures temporairement indisponibles')
  await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('Non disponible')
})

test('monitoring is disabled explicitly and late replies cannot restore private details after logout', async ({ page }) => {
  await routes(page, { enabled: false })
  await page.goto('/performances')
  await expect(page.getByRole('heading', { name: 'Les mesures ne sont pas activées' })).toBeVisible()
  await page.unrouteAll()
  await routes(page, { admin: true })
  let requested = false; let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/monitoring', async route => { requested = true; await pending; await route.fulfill({ json: snapshot() }).catch(() => {}) })
  await page.reload()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  release()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.performance-grid')).toHaveCount(0)
})
