export default defineEventHandler(async (event) => {
  const base = useRuntimeConfig(event).apiBase.replace(/\/$/, '')
  const origin = new URL(base)
  if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) {
    throw createError({ statusCode: 503, statusMessage: 'API non configurée' })
  }
  // Only /api routes are proxied. Internal bot endpoints cannot be reached here.
  if (!event.path.startsWith('/api/v1/') || /%2e|%2f|%5c|\\/i.test(event.path.split('?')[0] || '')) throw createError({ statusCode: 404 })
  const target = new URL(event.path, origin)
  if (target.origin !== origin.origin || !target.pathname.startsWith('/api/v1/')) throw createError({ statusCode: 404 })
  return proxyRequest(event, target.href, { fetchOptions: { redirect: 'manual' } })
})
