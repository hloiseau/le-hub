import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'
import type { ReadableStream } from 'node:stream/web'
import { createError, getRequestWebStream, type H3Event } from 'h3'

export async function proxyDownload(event: H3Event, target: string) {
  const { req, res } = event.node
  const controller = new AbortController()
  const abort = () => controller.abort()
  req.once('aborted', abort)
  res.once('close', abort)
  try {
    if (req.aborted || res.destroyed) return
    const headers = new Headers({ 'accept-encoding': 'identity' })
    for (const name of ['cookie', 'origin', 'content-type', 'range']) {
      const value = req.headers[name]
      if (typeof value === 'string') headers.set(name, value)
    }
    const options = {
      method: 'POST', headers, body: getRequestWebStream(event), duplex: 'half',
      redirect: 'manual' as const, signal: controller.signal,
    }
    // No whole-transfer deadline: Go checks the grant and bounds idle writes.
    const response = await fetch(target, options)
    if (response.status !== 200 && (response.status < 400 || response.status > 599)) {
      await response.body?.cancel()
      throw createError({ statusCode: 502 })
    }
    res.statusCode = response.status
    for (const name of ['content-type', 'content-disposition', 'content-length', 'retry-after']) {
      const value = response.headers.get(name)
      if (value && (name !== 'content-length' || !response.headers.has('content-encoding'))) res.setHeader(name, value)
    }
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    // pipeline applies backpressure and closes the upstream on a broken client.
    if (response.body) await pipeline(Readable.fromWeb(response.body as ReadableStream<Uint8Array>), res, { signal: controller.signal })
    else res.end()
  } catch {
    if (res.destroyed || controller.signal.aborted) return
    if (res.headersSent) res.destroy()
    else {
      res.removeHeader('Content-Disposition')
      res.removeHeader('Content-Length')
      throw createError({ statusCode: 502, statusMessage: 'Transfert indisponible' })
    }
  } finally {
    controller.abort()
    req.off('aborted', abort)
    res.off('close', abort)
  }
}
