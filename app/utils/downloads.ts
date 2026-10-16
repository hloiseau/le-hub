import type { DownloadInput } from '~/types/api'
export type DownloadQuality = DownloadInput['quality']
export const downloadQualityLabels: Record<DownloadQuality, string> = { '720p-2': '720p · 2 Mb/s', '720p-4': '720p · 4 Mb/s', '1080p-8': '1080p · 8 Mb/s' }

export function plexRatingKey(value: unknown): string | null {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9_223_372_036_854_775_807n ? value : null
}

export function ratingKeyFromPlexLink(value: string): string | null {
  try {
    const link = new URL(value.trim())
    if (!['https:', 'http:'].includes(link.protocol) || link.username || link.password || (link.hostname !== 'app.plex.tv' && !/^\/web(?:\/|$)/.test(link.pathname))) return null
    const fragment = link.hash.replace(/^#!?/, '')
    const queries = [link.search, fragment.includes('?') ? fragment.slice(fragment.indexOf('?')) : '']
    const keys = queries.flatMap(query => new URLSearchParams(query).getAll('key'))
    if (keys.length !== 1) return null
    const match = /^\/library\/metadata\/([1-9]\d{0,18})$/.exec(keys[0] || '')
    return match ? plexRatingKey(match[1]) : null
  } catch { return null }
}

export function downloadRoute(item: { id: string; type: string }) {
  if (item.type !== 'movie') return undefined
  const key = plexRatingKey(item.id.split(':').at(-1))
  return item.id.startsWith('plex:') && key ? { path: '/telechargements', query: { ratingKey: key } } : undefined
}
