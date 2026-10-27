import { test, expect } from '@playwright/test'

test('Ouicheur connection uses personal credentials and clears the password', async ({ page }, testInfo) => {
  let linked = false
  const writes: string[] = []
  await page.route('**/api/v1/**', route => {
    const req = route.request(); const path = new URL(req.url()).pathname
    if (path.endsWith('/session')) return route.fulfill({ json: { user: { name: 'Alice', plexId: '11111', discordId: '22222' }, plexConnected: true } })
    if (path.endsWith('/capabilities')) return route.fulfill({ json: { plexLink: true, ouicheur: true } })
    if (path.endsWith('/services')) return route.fulfill({ json: { items: [] } })
    if (path === '/api/v1/ouicheur/link') {
      if (req.method() === 'POST') { expect(req.postDataJSON()).toEqual({ login: 'alice', password: 'personal-secret' }); linked = true; writes.push('POST') }
      if (req.method() === 'DELETE') { linked = false; writes.push('DELETE') }
      return route.fulfill({ json: { linked, ...(linked ? { expiresAt: '2026-10-28T08:00:00Z' } : {}) } })
    }
    return route.fulfill({ json: {} })
  })
  await page.goto('/compte')
  await page.getByLabel('Identifiant Ouicheur', { exact: true }).fill('alice')
  await page.getByLabel('Mot de passe Ouicheur', { exact: true }).fill('personal-secret')
  await page.getByRole('button', { name: 'Relier mon compte Ouicheur' }).click()
  await expect(page.getByRole('button', { name: 'Retirer la connexion Ouicheur' })).toBeVisible()
  expect(await page.content()).not.toContain('personal-secret')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  await page.screenshot({ path: testInfo.outputPath('ouicheur-account.png'), fullPage: true })
  await page.getByRole('button', { name: 'Retirer la connexion Ouicheur' }).click()
  await expect(page.getByLabel('Mot de passe Ouicheur', { exact: true })).toHaveValue('')
  expect(writes).toEqual(['POST', 'DELETE'])
})
