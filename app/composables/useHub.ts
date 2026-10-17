import type { Capabilities, Media, RequestPage, Service, Session } from '~/types/api'

const defaults: Service[] = [
  { id: 'plex', name: 'Plex', description: 'Films et séries', category: 'watch' },
  { id: 'seerr', name: 'Seerr', description: 'Vos envies à l’écran', category: 'watch' },
  { id: 'downloadarr', name: 'Downloadarr', description: 'À emporter partout', category: 'tools' },
  { id: 'torrent-watch', name: 'Torrent Watch', description: 'Les téléchargements', category: 'tools' },
  { id: 'shelfmark', name: 'Shelfmark', description: 'Votre prochaine lecture', category: 'read' },
  { id: 'grimmory', name: 'Grimmory', description: 'Livres et mangas', category: 'read' },
]
export function useHub() {
  const config = useRuntimeConfig()
  const demo = computed(() => String(config.public.demo) === 'true')
  const session = useState<Session>('session', () => ({ user: null }))
  const services = useState<Service[]>('services', () => [])
  const capabilities = useState<Capabilities | null>('capabilities', () => null)
  const error = useState<string>('hub-error', () => '')
  const ready = useState('hub-ready', () => false)
  const refreshing = useState('hub-refreshing', () => false)
  const generation = useState('hub-session-generation', () => 0)
  async function refresh() {
    if (refreshing.value) return
    refreshing.value = true
    const current = generation.value
    if (demo.value) {
      session.value = { user: { discordId: 'demo', name: 'Alex', plexId: 'demo', seerrId: 1, notifications: false }, plexConnected: true }
      capabilities.value = { version: 'démo', discordLogin: false, plexLink: false, requests: true, recent: true, subscriptions: false, notifications: false, books: false, monitoring: false, departures: false }
      services.value = defaults
      ready.value = true
      refreshing.value = false
      return
    }
    try {
      const [s, caps] = await Promise.all([
        $fetch<Session>('/api/v1/session'),
        $fetch<Capabilities>('/api/v1/capabilities'),
      ])
      if (current !== generation.value) return
      capabilities.value = caps; error.value = ''
      // Fetch private configuration only once Plex has opened the gate.
      if (!s.user || !s.plexConnected) { session.value = { user: null }; services.value = []; return }
      const links = await $fetch<{ items: Service[] }>('/api/v1/services')
      if (current !== generation.value) return
      session.value = s; services.value = links.items
    } catch {
      if (current !== generation.value) return
      error.value = 'Le Hub ne parvient pas à vérifier votre accès. Réessayez dans un instant.'
      session.value = { user: null }; services.value = []
    } finally { ready.value = true; refreshing.value = false }
  }

  async function logout() {
    if (!demo.value) await $fetch('/api/v1/auth/logout', { method: 'POST' })
    generation.value++
    session.value = { user: null }; services.value = []; error.value = ''
    await navigateTo('/')
  }
  return { demo, session, services, capabilities, error, ready, refresh, logout }
}
export function apiMessage(error: unknown): string {
  const e = error as { data?: { error?: { message?: string } }; statusCode?: number }
  return e?.data?.error?.message || 'Le service est momentanément indisponible. Vous pouvez réessayer.'
}
export const demoRecent: Media[] = [
  { id: 'demo1', title: 'Dune : Deuxième partie', type: 'movie', year: 2024, addedAt: '2026-10-15T12:00:00Z' },
  { id: 'demo2', title: 'Shōgun', type: 'show', year: 2024, addedAt: '2026-10-14T12:00:00Z' },
  { id: 'demo3', title: 'Interstellar', type: 'movie', year: 2014, addedAt: '2026-10-13T12:00:00Z' },
  { id: 'demo4', title: 'Fallout', type: 'show', year: 2024, addedAt: '2026-10-12T12:00:00Z' },
]
export const demoRequests: RequestPage = { total: 3, offset: 0, limit: 10, items: [
  { id: 1, title: 'Dune : Deuxième partie', type: 'movie', status: 'available', createdAt: '2026-10-13T12:00:00Z', mediaId: 1, seasons: [] },
  { id: 2, title: 'Fallout', type: 'tv', status: 'processing', createdAt: '2026-10-14T12:00:00Z', mediaId: 2, seasons: [1] },
  { id: 3, title: 'Le Voyage de Chihiro', type: 'movie', status: 'pending', createdAt: '2026-10-15T12:00:00Z', mediaId: 3, seasons: [] },
] }
