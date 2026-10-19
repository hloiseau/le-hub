import { test, expect, type Page } from '@playwright/test'
import type { DownloadJob, DownloadInput, DownloadLibraryItem } from '../app/types/api'

const jobID = '11111111-1111-4111-8111-111111111111'
const otherJobID = '22222222-2222-4222-8222-222222222222'
const plexLink = 'https://app.plex.tv/desktop/#!/server/server-a/details?key=%2Flibrary%2Fmetadata%2F7'
const catalog: DownloadLibraryItem[] = [{ ratingKey: '7', title: 'Cobalt le film', type: 'movie', year: 2024 }, { ratingKey: '10', title: 'Cobalt la série', type: 'show', year: 2025 }]
const series: Record<string, DownloadLibraryItem[]> = { '10': [{ ratingKey: '11', title: 'Saison 1', type: 'season', index: 1, parentTitle: 'Cobalt la série' }], '11': [{ ratingKey: '12', title: 'Le départ', type: 'episode', index: 1, parentTitle: 'Cobalt la série' }] }
function job(overrides: Partial<DownloadJob> = {}): DownloadJob {
  return { id: jobID, title: 'Un film privé <script>alert(1)</script>', ratingKey: '7', quality: '720p-2', season: false, state: 'preparing', stage: 'waiting', progress: null, fileCount: 1, readyCount: 0, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 120_000).toISOString(), audioLabel: 'Sélection Plex', subtitleLabel: 'Aucun', filename: 'film.mp4', ...overrides }
}
async function setup(page: Page, linked = true, enabled = true) {
  const state = {
    linked, signed: true, starts: 0, polls: 0, reads: 0, options: 0, creates: [] as DownloadInput[], deletes: 0,
    jobs: [] as DownloadJob[], readStatus: 200, optionsStatus: 200, createStatus: 202, pollStatus: 200, pendingPolls: 0,
    grantExpiry: new Date(Date.now() + 120_000).toISOString(), flowExpiry: new Date(Date.now() + 30_000).toISOString(),
    qualities: ['720p-2', '720p-4'],
    libraryQueries: [] as Record<string, string>[], optionQueries: [] as Record<string, string>[], libraryStatus: 200,
    libraryExpiry: new Date(Date.now() + 30_000).toISOString(),
  }
  await page.addInitScript(() => {
    window.open = () => {
      document.documentElement.dataset.popupOpened = 'true'
      return { opener: null, closed: false, location: { replace: (url: string) => { document.documentElement.dataset.popupURL = url } }, close: () => { document.documentElement.dataset.popupClosed = 'true' } } as unknown as Window
    }
  })
  await page.route('**/api/v1/**', async route => {
    const req = route.request(); const url = new URL(req.url()); const path = url.pathname
    const status = () => ({ linked: state.linked, ...(state.linked ? { expiresAt: state.grantExpiry, qualityOptions: state.qualities } : {}) })
    if (path.endsWith('/auth/logout')) { state.signed = false; state.linked = false; return route.fulfill({ json: { ok: true } }) }
    if (path.endsWith('/session')) return route.fulfill({ json: { user: state.signed ? { name: 'Alice', plexId: '11111' } : null, plexConnected: state.signed } })
    if (path.endsWith('/capabilities')) return route.fulfill({ json: { plexLink: true, downloads: enabled, recent: true } })
    if (path.endsWith('/services')) return route.fulfill({ json: { items: [{ id: 'downloadarr', name: 'Downloadarr', description: 'À emporter', category: 'tools', url: 'https://downloads.example' }] } })
    if (path === '/api/v1/downloads/link') {
      if (req.method() === 'POST') { state.starts++; expect(req.postDataJSON()).toEqual({}); return route.fulfill({ json: { linked: false, expiresAt: state.flowExpiry } }) }
      if (req.method() === 'DELETE') state.linked = false
      return route.fulfill({ json: status() })
    }
    if (path === '/api/v1/downloads/link/poll') {
      state.polls++; expect(req.postDataJSON()).toEqual({})
      if (state.pollStatus !== 200) return route.fulfill({ status: state.pollStatus, json: { error: { message: 'Le compte Plex autorisé ne correspond pas à celui du Hub.' } } })
      if (state.polls <= state.pendingPolls) return route.fulfill({ json: { linked: false, expiresAt: state.flowExpiry } })
      state.linked = true; return route.fulfill({ json: status() })
    }
    if (path === '/api/v1/downloads/options') {
      state.options++
      state.optionQueries.push(Object.fromEntries(url.searchParams))
      expect([...url.searchParams.keys()].sort()).toEqual(['quality', 'ratingKey', 'season'])
      if (state.optionsStatus !== 200) return route.fulfill({ status: state.optionsStatus, json: { error: { message: 'Ce contenu ne permet pas cette préparation.' } } })
      const season = url.searchParams.get('season') === 'true'
      const key = url.searchParams.get('ratingKey')
      return route.fulfill({ json: { title: key === '12' ? 'Le départ' : key === '11' ? 'Saison 1' : 'Un film privé <script>alert(1)</script>', type: season ? 'season' : key === '12' ? 'episode' : 'movie', season, fileCount: season ? 3 : 1, audio: [{ id: 'plex', label: 'Sélection Plex' }, { id: season ? 'match:ZnI' : 'stream:1', label: 'Français' }], subtitle: [{ id: 'plex', label: 'Sélection Plex' }, { id: 'none', label: 'Aucun' }] } })
    }
    if (path === '/api/v1/downloads/library') {
      state.libraryQueries.push(Object.fromEntries(url.searchParams))
      if (state.libraryStatus !== 200) return route.fulfill({ status: state.libraryStatus, json: { error: { message: 'Votre bibliothèque est momentanément indisponible.' } } })
      return route.fulfill({ json: { items: url.searchParams.has('parent') ? series[url.searchParams.get('parent') || ''] || [] : url.searchParams.get('q')?.toLowerCase().includes('cobalt') ? catalog : [], nextOffset: null, checkedAt: new Date().toISOString(), expiresAt: state.libraryExpiry } })
    }
    if (path === '/api/v1/downloads') {
      if (req.method() === 'POST') {
        state.creates.push(req.postDataJSON())
        if (state.createStatus !== 202) return route.fulfill({ status: state.createStatus, json: { error: { message: 'Downloadarr ne répond pas. Vérifiez vos préparations avant de recommencer.' } } })
        const created = job({ quality: req.postDataJSON().quality, season: req.postDataJSON().season }); state.jobs = [created]
        return route.fulfill({ status: 202, json: created })
      }
      state.reads++
      if (state.readStatus !== 200) return route.fulfill({ status: state.readStatus, json: { error: { message: state.readStatus === 403 ? 'Vos droits de téléchargement ont changé.' : 'Downloadarr est momentanément indisponible.' } } })
      return route.fulfill({ json: { items: state.jobs, checkedAt: new Date().toISOString(), expiresAt: state.grantExpiry } })
    }
    if (path === `/api/v1/downloads/${jobID}` && req.method() === 'DELETE') { state.deletes++; state.jobs = []; return route.fulfill({ status: 204 }) }
    if (path.endsWith('/recent')) return route.fulfill({ json: { items: [], updatedAt: new Date().toISOString(), nextOffset: null } })
    return route.fulfill({ json: {} })
  })
  return state
}
async function inspect(page: Page) {
  await page.getByRole('button', { name: 'Afficher les options' }).click()
  await expect(page.locator('.download-confirmation h3')).toBeVisible()
}

test('downloads reuse the existing Plex session automatically and pause pending activation while hidden', async ({ page }) => {
  await page.clock.install()
  const state = await setup(page, false); state.pendingPolls = 1
  await page.goto('/telechargements')
  await expect.poll(() => state.polls).toBe(1)
  await expect(page.locator('html')).not.toHaveAttribute('data-popup-opened', 'true')
  await expect(page.getByRole('link', { name: 'Continuer sur Plex' })).toHaveCount(0)
  expect(state.starts).toBe(1)
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.fastForward(10_000)
  expect(state.polls).toBe(1)
  await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')) })
  await page.clock.fastForward(2501)
  await expect(page.getByRole('heading', { name: 'Choisir un contenu' })).toBeVisible()
  expect(state.polls).toBe(2)
})

test('a different Plex identity cannot open the download queue', async ({ page }) => {
  await page.clock.install()
  const state = await setup(page, false); state.pollStatus = 403
  await page.goto('/telechargements')
  await expect(page.getByRole('alert')).toContainText('ne correspond pas')
  await expect(page.getByRole('heading', { name: 'Choisir un contenu' })).toHaveCount(0)
  expect(state.reads).toBe(0)
  await page.clock.fastForward(10_000)
  expect(state.starts).toBe(1); expect(state.polls).toBe(1)
})

test('options require fresh consent after track or quality changes and create once', async ({ page }, testInfo) => {
  const state = await setup(page)
  await page.goto('/telechargements?ratingKey=7')
  await inspect(page)
  await expect(page.locator('.download-confirmation script')).toHaveCount(0)
  await expect(page.getByLabel('Qualité').locator('option')).toHaveCount(2)
  const consent = page.getByRole('checkbox', { name: 'Je confirme la préparation', exact: false })
  await expect(page.getByRole('button', { name: 'Confirmer la préparation' })).toBeDisabled()
  await consent.check(); await page.getByLabel('Piste audio').selectOption('stream:1'); await expect(consent).not.toBeChecked()
  await consent.check(); await page.getByLabel('Qualité').selectOption('720p-4')
  await expect(page.locator('.download-confirmation')).toHaveCount(0)
  await expect(page.getByText('Contenu sélectionné : Un film privé <script>alert(1)</script>', { exact: true })).toBeVisible()
  await inspect(page); await expect(consent).not.toBeChecked(); await consent.check()
  await page.locator('.download-confirmation').evaluate((element: HTMLFormElement) => { element.requestSubmit(); element.requestSubmit() })
  await expect(page.locator('.download-job')).toHaveCount(1)
  expect(state.creates).toEqual([{ ratingKey: '7', quality: '720p-4', season: false, audio: 'plex', subtitle: 'plex', confirmed: true }])
  await expect(page.locator('.download-job')).toContainText('Pourcentage non mesuré')
  await expect(page.locator('.download-job progress')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Récupérer le fichier' })).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('downloads-preparing.png'), fullPage: true })
})

test('a failed create is not retried automatically and consumes confirmation', async ({ page }) => {
  await page.clock.install()
  const state = await setup(page); state.createStatus = 503
  await page.goto('/telechargements?ratingKey=7'); await inspect(page)
  await page.getByRole('checkbox', { name: 'Je confirme la préparation', exact: false }).check()
  await page.getByRole('button', { name: 'Confirmer la préparation' }).click()
  await expect(page.getByRole('alert')).toContainText('Vérifiez vos préparations')
  await page.clock.fastForward(10_000)
  expect(state.creates).toHaveLength(1)
  await expect(page.getByRole('button', { name: 'Confirmer la préparation' })).toBeDisabled()
})

test('Plex links are parsed locally and invalid or duplicated keys never reach options', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/telechargements?ratingKey=7&ratingKey=8')
  await expect(page.getByRole('alert')).toContainText('ne désigne pas un contenu Plex valide')
  await expect(page.getByRole('button', { name: 'Afficher les options' })).toBeDisabled()
  expect(state.options).toBe(0)
  await page.getByText('Utiliser un lien Plex à la place', { exact: true }).click()
  for (const value of ['https://example.com/?key=%2Flibrary%2Fmetadata%2F7', `${plexLink}&key=%2Flibrary%2Fmetadata%2F8`, 'https://app.plex.tv/desktop/?key=%2Flibrary%2Fmetadata%2F9223372036854775808']) {
    await page.getByLabel('Lien de la fiche Plex').fill(value)
    await page.getByRole('button', { name: 'Afficher les options' }).click()
    await expect(page.getByRole('alert')).toContainText('Copiez le lien complet')
  }
  expect(state.options).toBe(0)
  await page.getByLabel('Lien de la fiche Plex').fill(`${plexLink}&X-Plex-Token=private-local-input`)
  await page.getByRole('combobox', { name: 'Contenu', exact: true }).selectOption('true')
  await inspect(page)
  await expect(page.getByLabel('Lien de la fiche Plex')).toHaveValue('')
  await expect(page.locator('.download-confirmation')).toContainText('3 fichiers')
  await page.getByLabel('Piste audio').selectOption('match:ZnI')
  await page.getByRole('combobox', { name: 'Sous-titres', exact: true }).selectOption('none')
  await page.getByRole('checkbox', { name: 'Je confirme la préparation', exact: false }).check()
  await page.getByRole('button', { name: 'Confirmer la préparation' }).click()
  await expect.poll(() => state.creates.length).toBe(1)
  expect(state.creates[0]).toEqual({ ratingKey: '7', quality: '720p-2', season: true, audio: 'match:ZnI', subtitle: 'none', confirmed: true })
  expect(JSON.stringify(state.creates)).not.toContain('private-local-input')
})

for (const entry of ['direct', 'navigation']) test(`ready files use a native same-origin POST after ${entry} entry and expiry removes their action`, async ({ page, context, isMobile }, testInfo) => {
  await page.clock.install()
  const state = await setup(page)
  state.jobs = [job({ state: 'ready', stage: 'ready', readyCount: 1, progress: 100, expiresAt: new Date(Date.now() + 10_000).toISOString() }), job({ id: otherJobID, state: 'error', stage: 'processing', error: 'La préparation a échoué.', progress: null })]
  let fileRequests = 0
  await context.route(`**/api/v1/downloads/${jobID}/file`, route => {
    const request = route.request(); fileRequests++
    expect(request.method()).toBe('POST'); expect(request.isNavigationRequest()).toBe(true)
    expect(request.headers()['origin']).toBe(new URL(page.url()).origin)
    expect(new URL(request.url()).search).toBe(''); expect(request.postData() || '').toBe('')
    return route.fulfill({ status: 204 })
  })
  if (entry === 'navigation') {
    await page.goto('/bibliotheque')
    if (isMobile) await page.getByRole('button', { name: 'Ouvrir la navigation' }).click()
    await page.getByRole('link', { name: 'Téléchargements', exact: true }).click()
  } else await page.goto('/telechargements')
  await expect(page.locator('.download-job')).toHaveCount(2)
  const form = page.locator('.download-actions form')
  await expect(form).toHaveAttribute('action', `/api/v1/downloads/${jobID}/file`)
  await expect(form).toHaveAttribute('method', 'post')
  await expect(form.locator('input')).toHaveCount(0)
  await page.getByRole('button', { name: 'Récupérer le fichier' }).click()
  await expect.poll(() => fileRequests).toBe(1)
  await expect(page.getByRole('status')).toContainText('Vérifiez ses téléchargements')
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: testInfo.outputPath('downloads-ready.png'), fullPage: true })
  await page.clock.fastForward(10_001)
  await expect(page.getByRole('button', { name: 'Récupérer le fichier' })).toHaveCount(0)
  await expect(page.locator('.download-job').first()).toContainText('a expiré')
})

for (const phase of ['link', 'options', 'jobs']) test(`late download ${phase} data cannot return after logout`, async ({ page }) => {
  await setup(page, phase !== 'link')
  let release!: () => void
  const pending = new Promise<void>(resolve => { release = resolve })
  let requested = false
  const pattern = phase === 'link' ? '**/api/v1/downloads/link' : phase === 'options' ? '**/api/v1/downloads/options?**' : '**/api/v1/downloads'
  await page.route(pattern, async route => {
    if (phase === 'link' && route.request().method() !== 'POST') return route.fallback()
    requested = true; await pending
    const json = phase === 'link' ? { linked: false, expiresAt: new Date(Date.now() + 30_000).toISOString() }
      : phase === 'options' ? { title: 'Titre privé tardif', type: 'movie', season: false, fileCount: 1, audio: [{ id: 'plex', label: 'Plex' }], subtitle: [{ id: 'plex', label: 'Plex' }] }
        : { items: [job({ title: 'Titre privé tardif' })], checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString() }
    await route.fulfill({ json })
  })
  await page.goto('/telechargements?ratingKey=7')
  if (phase === 'options') await page.getByRole('button', { name: 'Afficher les options' }).click()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click()
  release()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.download-job, .download-confirmation')).toHaveCount(0)
  await expect(page.getByText('Titre privé tardif', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Continuer sur Plex' })).toHaveCount(0)
})

test('outage clears private jobs, rights revocation clears the association, and cancellation is explicit', async ({ page }) => {
  const state = await setup(page); state.jobs = [job()]
  await page.goto('/telechargements')
  await expect(page.locator('.download-job')).toHaveCount(1)
  await page.getByRole('button', { name: 'Annuler la préparation' }).click()
  await expect(page.getByRole('heading', { name: 'Aucune préparation en cours' })).toBeVisible()
  expect(state.deletes).toBe(1)
  state.jobs = [job({ state: 'ready', stage: 'ready' })]
  await page.getByRole('button', { name: 'Actualiser les préparations' }).click()
  await expect(page.locator('.download-job')).toHaveCount(1)
  state.readStatus = 503
  await page.getByRole('button', { name: 'Actualiser les préparations' }).click()
  await expect(page.getByRole('alert')).toContainText('indisponible')
  await expect(page.locator('.download-job')).toHaveCount(0)
  state.readStatus = 403
  await page.getByRole('button', { name: 'Actualiser les préparations' }).click()
  await expect(page.getByRole('alert')).toContainText('droits de téléchargement')
  await expect(page.getByRole('button', { name: 'Actualiser mon accès' })).toBeVisible()
})

test('expiring download association cancels polling and removes its private queue', async ({ page }) => {
  await page.clock.install()
  const state = await setup(page); state.grantExpiry = new Date(Date.now() + 3000).toISOString(); state.jobs = [job()]
  await page.goto('/telechargements')
  await expect(page.locator('.download-job')).toHaveCount(1)
  await page.clock.fastForward(3001)
  await expect(page.locator('.download-job')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('accès Downloadarr a expiré')
  const reads = state.reads
  await page.clock.fastForward(15_000)
  expect(state.reads).toBe(reads)
})

test('download entry points select films only and disabled integration makes no private reads', async ({ page }) => {
  await setup(page)
  await page.route('**/api/v1/recent*', route => route.fulfill({ json: { items: ['movie', 'show'].map((type, i) => ({ id: `plex:server-a:${i + 7}`, title: type === 'movie' ? 'Mon film' : 'Une série regroupée', type, addedAt: new Date().toISOString(), url: 'https://app.plex.tv' })), nextOffset: null, updatedAt: new Date().toISOString() } }))
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Préparer Mon film pour un téléchargement' })).toHaveAttribute('href', '/telechargements?ratingKey=7')
  await expect(page.getByRole('link', { name: 'Préparer Une série regroupée pour un téléchargement' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Préparer Mon film pour un téléchargement' }).click()
  await expect(page.getByRole('heading', { name: 'Choisir un contenu' })).toBeVisible()
  await page.goto('/bibliotheque')
  await expect(page.locator('main').getByRole('link', { name: 'Mes téléchargements', exact: true })).toHaveCount(0)
  await page.route('**/api/v1/capabilities', route => route.fulfill({ json: { plexLink: true, downloads: false } }))
  let privateReads = 0
  await page.route('**/api/v1/downloads**', route => { privateReads++; return route.fulfill({ json: {} }) })
  await page.goto('/telechargements')
  await expect(page.getByRole('heading', { name: 'Téléchargements à connecter' })).toBeVisible()
  expect(privateReads).toBe(0)
})

test('the expanded navigation keeps account and help reachable in a short viewport', async ({ page }, testInfo) => {
  await setup(page)
  await page.setViewportSize({ width: testInfo.project.name === 'mobile' ? 390 : 1280, height: 720 })
  await page.goto('/telechargements')
  if (testInfo.project.name === 'mobile') await page.getByRole('button', { name: 'Ouvrir la navigation' }).click()
  const sidebar = page.locator('.sidebar')
  await expect(sidebar).toHaveCSS('overflow-y', 'auto')
  const account = sidebar.locator('.account-link')
  await account.scrollIntoViewIfNeeded()
  await expect(account).toBeInViewport()
  await expect(sidebar.getByRole('link', { name: 'Aide', exact: true })).toBeInViewport()
  await account.click()
  await expect(page).toHaveURL(/\/compte$/)
})

test('personal Plex search selects a movie without a copied URL and preserves explicit consent', async ({ page }, testInfo) => {
  const state = await setup(page)
  await page.goto('/telechargements')
  await expect(page.getByLabel('Lien de la fiche Plex')).not.toBeVisible()
  expect(state.libraryQueries).toEqual([])
  await page.getByLabel('Rechercher dans ma bibliothèque Plex').fill('Cobalt')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.locator('.library-result')).toHaveCount(2)
  expect(state.libraryQueries).toEqual([{ q: 'Cobalt', offset: '0' }])
  await page.getByRole('button', { name: 'Choisir Cobalt le film', exact: true }).click()
  await expect(page.locator('.download-confirmation')).toBeVisible()
  await expect(page.locator('.download-confirmation h3')).toBeFocused()
  expect(state.optionQueries).toEqual([{ ratingKey: '7', quality: '720p-2', season: 'false' }])
  expect(state.creates).toHaveLength(0)
  await expect(page.getByRole('button', { name: 'Confirmer la préparation' })).toBeDisabled()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.evaluate(() => { (document.activeElement as HTMLElement)?.blur(); window.scrollTo(0, 0) })
  await page.screenshot({ path: testInfo.outputPath('download-library-picker.png'), fullPage: true })
})

test('series navigation chooses a complete season or an individual episode with the correct mode', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/telechargements')
  await page.getByLabel('Rechercher dans ma bibliothèque Plex').fill('Cobalt')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await page.getByRole('button', { name: 'Voir les saisons de Cobalt la série' }).click()
  await page.getByRole('button', { name: 'Choisir Saison 1 en entier' }).click()
  await expect(page.locator('.download-confirmation')).toContainText('3 fichiers')
  expect(state.optionQueries.at(-1)).toEqual({ ratingKey: '11', quality: '720p-2', season: 'true' })
  await page.getByRole('checkbox', { name: 'Je confirme la préparation', exact: false }).check()
  await page.getByRole('button', { name: 'Voir les épisodes de Saison 1' }).click()
  await page.getByRole('button', { name: 'Choisir Le départ', exact: true }).click()
  await expect(page.locator('.download-confirmation')).toContainText('Le départ')
  await expect(page.locator('.download-confirmation')).toContainText('Épisode · 1 fichier')
  expect(state.optionQueries.at(-1)).toEqual({ ratingKey: '12', quality: '720p-2', season: 'false' })
  await expect(page.getByRole('checkbox', { name: 'Je confirme la préparation', exact: false })).not.toBeChecked()
  await page.getByRole('button', { name: 'Résultats de recherche', exact: true }).click()
  await expect(page.locator('.library-result')).toHaveCount(2)
  expect(state.libraryQueries).toEqual([{ q: 'Cobalt', offset: '0' }, { parent: '10', offset: '0' }, { parent: '11', offset: '0' }, { q: 'Cobalt', offset: '0' }])
})

test('library pages retain their search context and expired results lose their actions', async ({ page }) => {
  await page.clock.install()
  await setup(page)
  const queries: Record<string, string>[] = []
  await page.route('**/api/v1/downloads/library?**', route => {
    const query = Object.fromEntries(new URL(route.request().url()).searchParams); queries.push(query)
    return route.fulfill({ json: { items: [catalog[query.offset === '20' ? 1 : 0]], nextOffset: query.offset === '0' ? 20 : null, checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 5000).toISOString() } })
  })
  await page.goto('/telechargements')
  await page.getByLabel('Rechercher dans ma bibliothèque Plex').fill('Cobalt')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await page.getByRole('button', { name: 'Page suivante' }).click()
  await expect(page.locator('.library-result')).toContainText('Cobalt la série')
  await page.getByRole('button', { name: 'Page précédente' }).click()
  await expect(page.locator('.library-result')).toContainText('Cobalt le film')
  expect(queries).toEqual([{ q: 'Cobalt', offset: '0' }, { q: 'Cobalt', offset: '20' }, { q: 'Cobalt', offset: '0' }])
  await page.clock.fastForward(5001)
  await expect(page.locator('.library-result')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('La liste a expiré')
})

test('refreshing expired episode browsing returns to a usable search', async ({ page }) => {
  await page.clock.install()
  const state = await setup(page); state.libraryExpiry = new Date(Date.now() + 5000).toISOString()
  await page.goto('/telechargements')
  await page.getByLabel('Rechercher dans ma bibliothèque Plex').fill('Cobalt')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await page.getByRole('button', { name: 'Voir les saisons de Cobalt la série' }).click()
  await page.getByRole('button', { name: 'Voir les épisodes de Saison 1' }).click()
  await expect(page.getByRole('button', { name: 'Choisir Le départ', exact: true })).toBeVisible()
  await page.clock.fastForward(5001)
  await expect(page.getByRole('navigation', { name: 'Navigation dans la série' })).toHaveCount(0)
  state.libraryExpiry = new Date(Date.now() + 30_000).toISOString()
  await page.getByRole('button', { name: 'Actualiser les contenus' }).click()
  await expect(page.getByRole('button', { name: 'Voir les saisons de Cobalt la série' })).toBeVisible()
  expect(state.libraryQueries.at(-1)).toEqual({ q: 'Cobalt', offset: '0' })
})

test('a late library search cannot overwrite a newer search or return after logout', async ({ page }) => {
  await setup(page)
  const releases: (() => void)[] = []
  let completed = 0
  await page.route('**/api/v1/downloads/library?**', async route => {
    const query = new URL(route.request().url()).searchParams.get('q')
    if (query !== 'Retard') return route.fallback()
    await new Promise<void>(resolve => { releases.push(resolve) })
    await route.fulfill({ json: { items: [{ ratingKey: '99', title: 'Titre privé tardif', type: 'movie' }], nextOffset: null, checkedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 30_000).toISOString() } })
    completed++
  })
  await page.goto('/telechargements')
  await page.getByLabel('Rechercher dans ma bibliothèque Plex').fill('Retard')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect.poll(() => releases.length).toBe(1)
  await page.getByLabel('Rechercher dans ma bibliothèque Plex').fill('Cobalt')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.locator('.library-result')).toHaveCount(2)
  releases[0]!()
  await expect.poll(() => completed).toBe(1)
  await expect(page.getByText('Titre privé tardif', { exact: true })).toHaveCount(0)
  await page.getByLabel('Rechercher dans ma bibliothèque Plex').fill('Retard')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect.poll(() => releases.length).toBe(2)
  await page.getByRole('button', { name: 'Déconnexion', exact: true }).click()
  releases[1]!()
  await expect.poll(() => completed).toBe(2)
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.library-result')).toHaveCount(0)
  await expect(page.getByText('Titre privé tardif', { exact: true })).toHaveCount(0)
})

test('library errors clear private results and empty searches remain usable', async ({ page }) => {
  const state = await setup(page)
  await page.goto('/telechargements')
  await page.getByLabel('Rechercher dans ma bibliothèque Plex').fill('Absent')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.getByText('Aucun contenu accessible ne correspond à cette recherche.')).toBeVisible()
  await page.getByLabel('Rechercher dans ma bibliothèque Plex').fill('Cobalt')
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.locator('.library-result')).toHaveCount(2)
  state.libraryStatus = 503
  await page.getByRole('button', { name: 'Rechercher', exact: true }).click()
  await expect(page.locator('.library-result')).toHaveCount(0)
  await expect(page.getByRole('alert')).toContainText('bibliothèque est momentanément indisponible')
  state.libraryStatus = 200
  await page.getByRole('button', { name: 'Actualiser les contenus' }).click()
  await expect(page.locator('.library-result')).toHaveCount(2)
})
