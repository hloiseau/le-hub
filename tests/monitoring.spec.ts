import { test, expect, type Page } from '@playwright/test'

const observed = (value: number | null, unit = 'percent', status = value === null ? 'unavailable' : 'available') => ({ value, unit, status })
function snapshot(expires = 60_000) {
  const now = new Date().toISOString()
  return { updatedAt: now, expiresAt: new Date(Date.now() + expires).toISOString(), hostStatus: 'available', hostUpdatedAt: now, activityUpdatedAt: now, toparrStatus: 'not_configured', toparrUpdatedAt: null,
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
  await expect(page.locator('.session-decisions')).toHaveCount(0)
  await expect(page.locator('.session-row img')).toHaveCount(0)
  await expect(page.locator('.host-row')).toContainText('PRIVATE POOL')
  await expect(page.locator('.session-row')).toHaveCount(0, { timeout: 8000 })
  await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('Donnée périmée')
})

test('admin distinguishes audio-only transcoding from video decisions without inferring GPU activity', async ({ page }, testInfo) => {
  await routes(page, { admin: true })
  await page.route('**/api/v1/monitoring', route => route.fulfill({ json: {
    ...snapshot(), toparrStatus: 'available', toparrUpdatedAt: new Date().toISOString(),
    metrics: { ...snapshot().metrics, gpu_video_percent: observed(0) },
  } }))
  await page.route('**/api/v1/admin/plex-activity', route => route.fulfill({ json: {
    ...snapshot(), hostDetails: [], sessions: [
      { user: 'Compte de test', title: 'Audio seul', state: 'playing', decision: 'transcode', videoDecision: 'copy', audioDecision: 'transcode', videoCodec: 'hevc', audioCodec: 'aac', hardwareDecoding: false, hardwareEncoding: false },
      { user: 'Compte de test', title: 'Vidéo seule', state: 'playing', decision: 'transcode', videoDecision: 'transcode', audioDecision: 'copy', hardwareDecoding: true, hardwareEncoding: true },
      { user: 'Compte de test', title: 'Audio connu seulement', state: 'playing', decision: 'direct play', audioDecision: 'direct play', hardwareDecoding: null, hardwareEncoding: null },
    ],
  } }))
  await page.goto('/performances')
  await expect(page.locator('.session-decisions')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Afficher les sessions et les équipements' }).check()
  const rows = page.locator('.session-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0).locator('.session-decisions')).toHaveText('Vidéo : Copie sans réencodage · Audio : Transcodage')
  await expect(rows.nth(0)).toContainText('Décodage matériel : Non · Encodage matériel : Non')
  await expect(rows.nth(1).locator('.session-decisions')).toHaveText('Vidéo : Transcodage · Audio : Copie sans réencodage')
  await expect(rows.nth(2).locator('.session-decisions')).toHaveText('Audio : Lecture directe')
  await expect(page.locator('[data-metric="gpu_video_percent"] dd')).toHaveText('0 %')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: testInfo.outputPath('monitoring-stream-decisions.png'), fullPage: true })
  await page.getByRole('checkbox', { name: 'Afficher les sessions et les équipements' }).uncheck()
  await expect(page.locator('.session-decisions')).toHaveCount(0)
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

test('history errors do not hide live server activity', async ({ page }) => {
  await routes(page)
  await page.route('**/api/v1/monitoring/history?**', route => route.fulfill({ status: 500, json: { error: { message: 'Historique indisponible.' } } }))
  await page.goto('/performances')
  await expect(page.locator('.activity-counts')).toContainText('Sessions')
  await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('0 %')
  await expect(page.locator('.history-panel [role="alert"]')).toContainText('Historique indisponible')
})

test('Plex activity works without a host collector and explains absent hardware measurements', async ({ page }) => {
  await routes(page)
  await page.route('**/api/v1/monitoring', route => route.fulfill({ json: {
    ...snapshot(), hostStatus: 'not_configured', hostUpdatedAt: null,
    metrics: { cpu_percent: observed(null), plex_sessions: observed(3, 'count') },
  } }))
  await page.goto('/performances')
  await expect(page.locator('.activity-counts')).toContainText('Sessions')
  await expect(page.getByText('Les mesures CPU, mémoire, stockage et réseau ne sont pas encore reliées au Hub. L’activité Plex reste disponible.')).toBeVisible()
  await expect(page.getByText('Activité GPU fournie par Toparr.')).toHaveCount(0)
  await expect(page.getByLabel('Mesure', { exact: true })).toHaveValue('plex_sessions')
})

test('Toparr GPU measurements work without host metrics and distinguish zero from a missing sensor', async ({ page }, testInfo) => {
  await routes(page)
  await page.route('**/api/v1/monitoring', route => route.fulfill({ json: {
    ...snapshot(), hostStatus: 'not_configured', hostUpdatedAt: null,
    toparrStatus: 'available', toparrUpdatedAt: new Date().toISOString(),
    metrics: { cpu_percent: observed(null), gpu_video_percent: observed(0), gpu_render_percent: observed(null), plex_sessions: observed(3, 'count') },
  } }))
  await page.goto('/performances')
  await expect(page.getByText('Activité GPU fournie par Toparr.')).toBeVisible()
  await expect(page.getByText(/^Dernière mesure Toparr le/)).toBeVisible()
  await expect(page.locator('[data-metric="gpu_video_percent"] dd')).toHaveText('0 %')
  await expect(page.locator('[data-metric="gpu_render_percent"] dd')).toHaveText('Non disponible')
  await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('Non disponible')
  await expect(page.getByText('Les mesures CPU, mémoire, stockage et réseau ne sont pas encore reliées au Hub. L’activité Plex reste disponible.')).toBeVisible()
  await expect(page.locator('.activity-counts')).toContainText('Sessions')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('monitoring-toparr.png'), fullPage: true })
})

for (const failure of [
  { status: 'unavailable', notice: 'Les mesures de Toparr ne sont pas disponibles.', value: 'Non disponible' },
  { status: 'stale', notice: 'Toparr n’a pas transmis de mesures récentes.', value: 'Donnée périmée' },
  { status: 'error', notice: 'Les mesures de Toparr sont momentanément indisponibles.', value: 'Mesure en erreur' },
]) {
  test(`Toparr ${failure.status} leaves current CPU and Plex observations visible`, async ({ page }) => {
    await routes(page)
    await page.route('**/api/v1/monitoring', route => route.fulfill({ json: {
      ...snapshot(), toparrStatus: failure.status,
      toparrUpdatedAt: failure.status === 'stale' ? new Date(Date.now() - 300_000).toISOString() : null,
      metrics: { ...snapshot().metrics, gpu_video_percent: observed(null, 'percent', failure.status), gpu_temperature: observed(37, 'celsius') },
    } }))
    await page.goto('/performances')
    await expect(page.getByText(failure.notice)).toBeVisible()
    await expect(page.locator('[data-metric="gpu_video_percent"] dd')).toHaveText(failure.value)
    await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('0 %')
    await expect(page.locator('[data-metric="gpu_temperature"] dd')).toHaveText('37 °C')
    await expect(page.locator('.activity-counts')).toContainText('Sessions')
    await expect(page.locator('.activity-counts')).toContainText('3')
    await expect(page.locator('.metric-chart .curve')).toHaveCount(2)
    await expect(page.getByText(/^Dernière mesure Toparr le/)).toHaveCount(failure.status === 'stale' ? 1 : 0)
  })
}

test('Toparr expires independently while CPU, Plex and the host GPU temperature remain current', async ({ page }) => {
  await routes(page)
  await page.clock.install()
  const data = {
    ...snapshot(), toparrStatus: 'available', toparrUpdatedAt: new Date(Date.now() - 20_000).toISOString(),
    metrics: { ...snapshot().metrics, gpu_video_percent: observed(0), gpu_render_percent: observed(25), gpu_frequency_mhz: observed(300, 'mhz'), gpu_power_watts: observed(10, 'watts'), gpu_temperature: observed(37, 'celsius') },
  }
  await page.route('**/api/v1/monitoring', route => route.fulfill({ json: data }))
  await page.goto('/performances')
  await expect(page.locator('[data-metric="gpu_video_percent"] dd')).toHaveText('0 %')
  await expect(page.locator('[data-metric="gpu_render_percent"] dd')).toHaveText('25 %')
  await page.clock.fastForward(11_000)
  await expect(page.getByText('Toparr n’a pas transmis de mesures récentes.')).toBeVisible()
  for (const key of ['gpu_video_percent', 'gpu_render_percent', 'gpu_frequency_mhz', 'gpu_power_watts']) {
    await expect(page.locator(`[data-metric="${key}"] dd`)).toHaveText('Donnée périmée')
  }
  await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('0 %')
  await expect(page.locator('[data-metric="gpu_temperature"] dd')).toHaveText('37 °C')
  await expect(page.locator('.activity-counts')).toContainText('Sessions')
  await expect(page.locator('.activity-counts')).toContainText('3')
  await expect(page.getByText('Les mesures sont périmées. Une nouvelle vérification est nécessaire.')).toHaveCount(0)
})

test('an administrator detail failure keeps aggregate observations visible', async ({ page }) => {
  await routes(page, { admin: true })
  await page.route('**/api/v1/admin/plex-activity', route => route.fulfill({ status: 503, json: { error: { message: 'Détails indisponibles.' } } }))
  await page.goto('/performances')
  await page.getByRole('checkbox', { name: 'Afficher les sessions et les équipements' }).check()
  await expect(page.locator('.admin-monitoring [role="alert"]')).toContainText('Détails indisponibles')
  await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('0 %')
  await expect(page.locator('.activity-counts')).toContainText('Sessions')
})

test('an authorization failure withdraws all observations even when another request succeeds', async ({ page }) => {
  await routes(page, { admin: true })
  await page.route('**/api/v1/monitoring/history?**', route => route.fulfill({ status: 403, json: { error: { message: 'Accès Plex révoqué.' } } }))
  await page.goto('/performances')
  await expect(page.getByRole('alert')).toContainText('Accès Plex révoqué')
  await expect(page.locator('.activity-counts')).toHaveCount(0)
  await expect(page.locator('[data-metric="cpu_percent"] dd')).toHaveText('Non disponible')
  await expect(page.locator('.metric-chart')).toHaveCount(0)
})
