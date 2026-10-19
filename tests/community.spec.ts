import { test, expect, type Page } from '@playwright/test'

const thread = { id: '22222', forumId: '11111', title: 'Une proposition publique', kind: 'proposal', status: 'open', archived: false, updatedAt: '2026-10-16T12:00:00Z', url: 'https://discord.com/channels/33333/22222' }
const milestone = { id: 'first-step', title: 'Une évolution sélectionnée', summary: 'Résumé approuvé pour les membres du Hub.', status: 'planned', dependencies: [] }
const feed = (items: object[]) => ({ items, publishedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() })
async function signedIn(page: Page, enabled = true) {
  let signed = true
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname
    if (path.endsWith('/auth/logout')) signed = false
    return route.fulfill({ json: path.endsWith('/session') ? { user: signed ? { name: 'Alice', plexId: '11111' } : null, plexConnected: signed }
      : path.endsWith('/capabilities') ? { community: enabled, roadmap: enabled, plexLink: true }
        : path.endsWith('/services') ? { items: [] }
          : feed([]) })
  })
}

test('community uses Discord as its only voting destination and reflects archived updates', async ({ page }, testInfo) => {
  await signedIn(page)
  let archived = false
  const methods: string[] = []
  await page.route('**/api/v1/community', route => {
    methods.push(route.request().method())
    return route.fulfill({ json: feed([{ ...thread, archived, ...(archived ? { title: 'Titre mis à jour', status: 'resolved' } : {}) }]) })
  })
  await page.goto('/communaute')
  await expect(page.getByRole('heading', { name: 'Communauté', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Discuter et voter dans Discord' })).toHaveAttribute('href', thread.url)
  await expect(page.getByRole('button', { name: /voter/i })).toHaveCount(0)
  await expect(page.getByText('Discussions et votes dans Discord.', { exact: true })).toBeVisible()
  archived = true
  await page.getByRole('button', { name: 'Actualiser la communauté' }).click()
  await expect(page.locator('.community-thread')).toContainText('Titre mis à jour')
  await expect(page.locator('.community-thread')).toContainText('Archivé')
  await expect(page.locator('.community-thread')).toContainText('Résolu')
  await expect(page.getByRole('link', { name: 'Consulter dans Discord' })).toBeVisible()
  expect(methods.every(method => method === 'GET')).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('community.png'), fullPage: true })
})

test('roadmap presents only confirmed dates and explicit public dependencies', async ({ page }, testInfo) => {
  await signedIn(page)
  await page.route('**/api/v1/roadmap', route => route.fulfill({ json: feed([
    { ...milestone, status: 'in_progress', dependencies: ['foundation'], discussionUrl: thread.url },
    { ...milestone, id: 'foundation', title: 'Fondation livrée', status: 'delivered', confirmedDate: '2026-10-16', issueUrl: 'https://github.com/example/project/issues/1' },
    { ...milestone, id: 'later', title: 'Sans date promise' },
  ]) }))
  await page.goto('/roadmap')
  await expect(page.getByRole('heading', { name: 'Communauté', exact: true })).toBeVisible()
  await expect(page.locator('#step-first-step')).toContainText('En cours')
  await expect(page.locator('#step-first-step .confirmed-date')).toHaveCount(0)
  await expect(page.locator('#step-later .confirmed-date')).toHaveCount(0)
  await expect(page.locator('#step-foundation')).toContainText('Date confirmée : 16 oct. 2026')
  await expect(page.locator('.dependencies a')).toHaveAttribute('href', '#step-foundation')
  await expect(page.getByRole('link', { name: 'La proposition dans Discord' })).toHaveAttribute('href', thread.url)
  await expect(page.getByRole('link', { name: 'Consulter sur GitHub' })).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('roadmap.png'), fullPage: true })
})

test('removed or unavailable publications withdraw old community and roadmap content', async ({ page }) => {
  await signedIn(page)
  let state = 'available'
  await page.route('**/api/v1/community', route => route.fulfill(state === 'failed' ? { status: 503, json: { error: { message: 'Publication à actualiser.' } } } : { json: feed(state === 'available' ? [thread] : []) }))
  await page.route('**/api/v1/roadmap', route => route.fulfill({ json: { ...feed([milestone]), expiresAt: '2020-01-01T00:00:00Z' } }))
  await page.goto('/communaute')
  await expect(page.locator('.community-thread')).toHaveCount(1)
  state = 'removed'
  await page.getByRole('button', { name: 'Actualiser la communauté' }).click()
  await expect(page.locator('.community-thread')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Aucun sujet publié' })).toBeVisible()
  state = 'failed'
  await page.getByRole('button', { name: 'Actualiser la communauté' }).click()
  await expect(page.getByRole('alert')).toContainText('Publication à actualiser')
  await expect(page.locator('.community-thread')).toHaveCount(0)
  await page.goto('/roadmap')
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('.roadmap-item')).toHaveCount(0)
})

test('community capabilities off do not fetch publications', async ({ page }) => {
  await signedIn(page, false)
  let reads = 0
  await page.route(/\/api\/v1\/(community|roadmap)$/, route => { reads++; return route.fulfill({ json: feed([thread]) }) })
  await page.goto('/communaute')
  await expect(page.getByRole('heading', { name: 'Communauté non configurée' })).toBeVisible()
  await page.goto('/roadmap')
  await expect(page.getByRole('heading', { name: 'Roadmap non configurée' })).toBeVisible()
  expect(reads).toBe(0)
})

test('late publication responses cannot restore content after logout', async ({ page }) => {
  await signedIn(page)
  let release!: () => void
  let requested = false
  const pending = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/community', async route => { requested = true; await pending; await route.fulfill({ json: feed([thread]) }) })
  await page.goto('/communaute')
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('button', { name: 'Déconnexion' }).click()
  release()
  await expect(page.getByRole('button', { name: 'Se connecter avec Plex' })).toBeVisible()
  await expect(page.locator('.community-thread')).toHaveCount(0)
})
