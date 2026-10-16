import { createServer, request, type Server, type RequestListener } from 'node:http'
import { once } from 'node:events'
import { createApp, defineEventHandler, toNodeListener } from 'h3'
import { test, expect } from '@playwright/test'
import { proxyDownload } from '../server/utils/downloadProxy'

const servers = new Set<Server>()

async function listen(handler: RequestListener) {
  const server = createServer(handler)
  servers.add(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing fixture address')
  return `http://127.0.0.1:${address.port}`
}

async function fixture(handler: RequestListener) {
  const upstream = await listen(handler)
  const app = createApp().use(defineEventHandler(event => proxyDownload(event, `${upstream}${event.path}`)))
  return listen(toNodeListener(app))
}

test.afterEach(async () => {
  await Promise.all([...servers].map(server => new Promise<void>((resolve) => {
    server.closeAllConnections()
    server.close(() => resolve())
  })))
  servers.clear()
})

test('native download streams before completion and only forwards necessary headers', async () => {
  const finish = Promise.withResolvers<undefined>()
  const received = Promise.withResolvers<{ body: string, cookie?: string, origin?: string, authorization?: string, plex?: string }>()
  const base = await fixture(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    received.resolve({ body, cookie: req.headers.cookie, origin: req.headers.origin, authorization: req.headers.authorization, plex: req.headers['x-plex-token'] as string | undefined })
    res.writeHead(200, {
      'Content-Type': 'video/mp4', 'Content-Disposition': 'attachment; filename="film.mp4"', 'Content-Length': '11',
      'Set-Cookie': 'foreign=secret', 'X-Upstream-Credential': 'private', 'Cache-Control': 'public',
    })
    res.write('first')
    await finish.promise
    res.end('second')
  })
  const response = await fetch(`${base}/api/v1/downloads/job/file`, {
    method: 'POST', body: '', headers: { cookie: 'concierge_session=owner', origin: 'https://hub.example', authorization: 'Bearer browser-value', 'x-plex-token': 'browser-plex' },
  })
  expect(await received.promise).toEqual({ body: '', cookie: 'concierge_session=owner', origin: 'https://hub.example', authorization: undefined, plex: undefined })
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('video/mp4')
  expect(response.headers.get('content-disposition')).toBe('attachment; filename="film.mp4"')
  expect(response.headers.get('content-length')).toBe('11')
  expect(response.headers.get('cache-control')).toBe('no-store')
  expect(response.headers.get('set-cookie')).toBeNull()
  expect(response.headers.get('x-upstream-credential')).toBeNull()
  const reader = response.body!.getReader()
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('first')
  finish.resolve(undefined)
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('second')
  expect((await reader.read()).done).toBe(true)
})

test('native download preserves request validation and French JSON errors', async () => {
  const base = await fixture(async (req, res) => {
    let body = ''
    for await (const chunk of req) body += chunk
    expect(req.url).toBe('/api/v1/downloads/job/file?unexpected=1')
    expect(req.headers.range).toBe('bytes=0-10')
    expect(req.headers['content-type']).toBe('application/x-www-form-urlencoded')
    expect(body).toBe('unexpected=1')
    res.writeHead(400, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'invalid_request', message: 'Requête invalide.' } }))
  })
  const response = await fetch(`${base}/api/v1/downloads/job/file?unexpected=1`, {
    method: 'POST', body: 'unexpected=1', headers: { range: 'bytes=0-10', 'content-type': 'application/x-www-form-urlencoded' },
  })
  expect(response.status).toBe(400)
  expect(response.headers.get('content-disposition')).toBeNull()
  expect(await response.json()).toEqual({ error: { code: 'invalid_request', message: 'Requête invalide.' } })
})

for (const started of [false, true]) {
  test(`browser cancellation closes the backend transfer ${started ? 'after' : 'before'} headers`, async () => {
    const arrived = Promise.withResolvers<undefined>()
    const closed = Promise.withResolvers<undefined>()
    const base = await fixture((req, res) => {
      req.resume()
      res.once('close', () => closed.resolve(undefined))
      if (started) { res.writeHead(200, { 'Content-Type': 'application/zip' }); res.write('first') }
      arrived.resolve(undefined)
    })
    const controller = new AbortController()
    const pending = fetch(`${base}/api/v1/downloads/job/file`, { method: 'POST', signal: controller.signal }).catch(() => undefined)
    await arrived.promise
    if (started) expect((await pending)?.status).toBe(200)
    controller.abort()
    await closed.promise
    await pending
  })
}

test('a slow browser applies backpressure instead of buffering the complete file', async () => {
  const start = Promise.withResolvers<undefined>()
  const stopped = Promise.withResolvers<undefined>()
  let bytes = 0
  const total = 64 * 1024 * 1024
  const base = await fixture(async (req, res) => {
    req.resume()
    res.once('close', () => stopped.resolve(undefined))
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': String(total) })
    res.write(Buffer.alloc(64 * 1024))
    bytes = 64 * 1024
    await start.promise
    const chunk = Buffer.alloc(64 * 1024)
    while (bytes < total && !res.destroyed) {
      bytes += chunk.length
      if (!res.write(chunk)) await Promise.race([once(res, 'drain'), stopped.promise])
    }
    if (!res.destroyed) res.end()
  })
  const client = request(`${base}/api/v1/downloads/job/file`, { method: 'POST' })
  const responseReady = once(client, 'response')
  client.end()
  const [response] = await responseReady
  response.pause()
  start.resolve(undefined)
  await expect.poll(() => bytes).toBeGreaterThan(0)
  await new Promise(resolve => setTimeout(resolve, 100))
  expect(bytes).toBeLessThan(total)
  response.destroy()
  await stopped.promise
})

test('file redirects are rejected without forwarding credentials to the destination', async () => {
  let followed = false
  const destination = await listen((_req, res) => { followed = true; res.end('secret') })
  const base = await fixture((req, res) => {
    req.resume()
    res.writeHead(307, { Location: destination })
    res.end()
  })
  const response = await fetch(`${base}/api/v1/downloads/job/file`, { method: 'POST' })
  expect(response.status).toBe(502)
  expect(response.headers.get('location')).toBeNull()
  expect(followed).toBe(false)
})

test('an interrupted upstream file fails the response instead of appending an error document', async () => {
  const interrupt = Promise.withResolvers<undefined>()
  const base = await fixture(async (req, res) => {
    req.resume()
    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Content-Length': '100' })
    res.write('first')
    await interrupt.promise
    res.destroy()
  })
  const response = await fetch(`${base}/api/v1/downloads/job/file`, { method: 'POST' })
  const reader = response.body!.getReader()
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('first')
  interrupt.resolve(undefined)
  await expect(reader.read()).rejects.toThrow()
})
