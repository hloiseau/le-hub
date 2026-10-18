import { test, expect } from '@playwright/test'

test('request details distinguish source states and link only to configured Seerr fiches', async ({ page }, testInfo) => {
  const states = ['available', 'partial', 'processing', 'error', 'unknown']
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    const filter = new URL(route.request().url()).searchParams.get('status')
    const items = states.map((status, i) => ({ id: i + 1, title: i === 0 ? '<img src=x onerror=alert(1)>' : `Demande ${status}`, type: i === 1 ? 'tv' : 'movie', status, createdAt: '2026-10-16T12:00:00Z', mediaId: 100 + i, seasons: i === 1 ? [1, 2] : [] })).filter(item => !filter || item.status === filter)
    const json = path.endsWith('/session') ? { user: { name: 'Alice', plexId: '1', seerrId: 42 }, plexConnected: true }
      : path.endsWith('/services') ? { items: [{ id: 'seerr', name: 'Seerr', description: '', category: 'watch', url: 'https://requests.example/base/' }] }
        : path.endsWith('/requests') ? { items, total: items.length, offset: 0, limit: 10 }
          : { requests: true }
    return route.fulfill({ json })
  })
  await page.goto('/demandes')
  const rows = page.locator('.request-row')
  await expect(rows).toHaveCount(5)
  for (const row of await rows.all()) {
    await row.locator('summary').focus()
    await page.keyboard.press('Enter')
    await expect(row.locator('details')).toHaveAttribute('open', '')
  }
  await expect(rows.nth(0)).toContainText('La lecture et votre accès dans Plex ne sont pas vérifiés')
  await expect(rows.nth(1)).toContainText('Cela ne confirme pas que tous les épisodes')
  await expect(rows.nth(2)).toContainText('attendre son import et son indexation')
  await expect(rows.nth(3)).toContainText('Seerr signale un échec')
  await expect(rows.nth(4)).toContainText('La disponibilité reste inconnue')
  await expect(rows.nth(0).getByRole('link')).toHaveAttribute('href', 'https://requests.example/base/movie/100')
  await expect(rows.nth(1).getByRole('link')).toHaveAttribute('href', 'https://requests.example/base/tv/101')
  await expect(page.locator('.request-list img')).toHaveCount(0)
  await page.getByRole('combobox').selectOption('error')
  await expect(rows).toHaveCount(1)
  await expect(rows).toContainText('Demande Seerr n° 4')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('request-error-detail.png'), fullPage: true })
})

test('request detail does not build a link for invalid media IDs or absent service links', async ({ page }) => {
  let hasService = true
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    const json = path.endsWith('/session') ? { user: { name: 'Alice', plexId: '1' }, plexConnected: true }
      : path.endsWith('/services') ? { items: hasService ? [{ id: 'seerr', url: 'https://requests.example' }] : [] }
        : path.endsWith('/requests') ? { items: [{ id: 1, title: 'Demande', type: 'movie', status: 'unknown', createdAt: '', mediaId: hasService ? -1 : 12, seasons: [] }], total: 1, offset: 0, limit: 10 }
          : { requests: true }
    return route.fulfill({ json })
  })
  await page.goto('/demandes')
  await expect(page.locator('.request-row')).toBeVisible()
  await expect(page.locator('.request-detail a')).toHaveCount(0)
  hasService = false
  await page.reload()
  await expect(page.locator('.request-row')).toBeVisible()
  await expect(page.locator('.request-detail a')).toHaveCount(0)
})

test('standard and 4K requests keep their own source status and diagnostic selection', async ({ page }, testInfo) => {
  const inspected: string[] = []
  await page.route('**/api/v1/**', route => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/admin/diagnostics')) {
      inspected.push(url.searchParams.get('requestId') || '')
      return route.fulfill({ json: { source: 'sonarr', version: '5.0.0', stage: 'unknown', summary: 'Observation de la demande sélectionnée.', evidence: [], checkedAt: '2026-10-18T12:00:00Z', queueTruncated: false, historyTruncated: false, plexStatus: 'not_verified' } })
    }
    const request = { title: 'Une même série', type: 'tv', mediaId: 101, createdAt: '2026-10-18T12:00:00Z', seasons: [1, 2] }
    const json = url.pathname.endsWith('/session') ? { user: { name: 'Alice', plexId: '1' }, plexConnected: true, admin: true }
      : url.pathname.endsWith('/services') ? { items: [] }
        : url.pathname.endsWith('/requests') ? { items: [{ ...request, id: 7, is4k: false, status: 'available' }, { ...request, id: 8, is4k: true, status: 'processing' }, { ...request, id: 9, status: 'unknown' }], total: 3, offset: 0, limit: 10 }
          : { requests: true }
    return route.fulfill({ json })
  })
  await page.goto('/demandes')
  const rows = page.locator('.request-row')
  await expect(rows).toHaveCount(3)
  await expect(rows.nth(0).locator('.request-quality')).toHaveText('· Demande standard')
  await expect(rows.nth(1).locator('.request-quality')).toHaveText('· Demande 4K')
  await expect(rows.nth(2).locator('.request-quality')).toHaveCount(0)
  await expect(rows.nth(0).locator('.status-badge')).toHaveText('Disponible')
  await expect(rows.nth(1).locator('.status-badge')).toHaveText('En cours')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('request-quality.png'), fullPage: true })
  for (const row of [rows.nth(1), rows.nth(0)]) {
    await row.locator('summary').click()
    await row.getByRole('button', { name: 'Vérifier cette demande' }).click()
    await expect(row.locator('.diagnostic-result')).toBeVisible()
  }
  expect(inspected).toEqual(['8', '7'])
})
