<script setup lang="ts">
import type { Media, RecentPage } from '~/types/api'
import { downloadRoute } from '~/utils/downloads'
const { session, services, demo, ready, capabilities, refresh } = useHub()
const filter = ref('all')
const recent = ref<Media[]>([])
const loading = ref(false)
const message = ref('')
const nextOffset = ref<number | null>(null)
const updatedAt = ref('')
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
const visible = computed(() => services.value.filter(s => filter.value === 'all' || s.category === filter.value))
async function loadRecent(offset = 0) {
  const request = ++revision
  if (offset === 0) { clearTimeout(timer); recent.value = []; nextOffset.value = null; updatedAt.value = '' }
  message.value = ''; loading.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected) return
  loading.value = true
  try {
    const page = demo.value ? { items: demoRecent, nextOffset: null, updatedAt: '' } : await $fetch<RecentPage>('/api/v1/recent', { query: { offset }, retry: 0 })
    if (request !== revision) return
    const next = page.nextOffset ?? null
    if (next !== null && (!Number.isInteger(next) || next <= offset)) throw new Error('invalid pagination')
    const known = new Set(recent.value.map(item => item.id))
    recent.value = [...recent.value, ...page.items.filter(item => { if (known.has(item.id)) return false; known.add(item.id); return true })]
    nextOffset.value = next
    if (offset === 0) {
      updatedAt.value = page.updatedAt || ''
      if (!demo.value) timer = setTimeout(() => { revision++; loading.value = false; recent.value = []; nextOffset.value = null; updatedAt.value = ''; if (document.visibilityState === 'visible') void loadRecent() }, 60_000)
    }
  } catch (e) {
    if (request !== revision) return
    recent.value = []; nextOffset.value = null; updatedAt.value = ''; clearTimeout(timer)
    message.value = apiMessage(e)
    const status = (e as { statusCode?: number }).statusCode
    if (status === 401 || status === 403) await refresh()
  }
  finally { if (request === revision) loading.value = false }
}
function visibleAgain() { if (document.visibilityState === 'visible') void loadRecent() }
watch([ready, () => session.value.user?.plexId, () => session.value.plexConnected], () => loadRecent(), { immediate: true })
onMounted(() => document.addEventListener('visibilitychange', visibleAgain))
onBeforeUnmount(() => { revision++; clearTimeout(timer); document.removeEventListener('visibilitychange', visibleAgain) })
const kind = (type: string) => ({ movie: 'Film', show: 'Série', season: 'Saison', episode: 'Épisode' }[type] || 'Contenu')
const date = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' }).format(new Date(value))
const freshness = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(value))
</script>
<template>
  <div>
  <section class="page-heading"><h1>Accueil</h1></section>
  <section v-if="session.admin && capabilities?.extensionRequests && !demo" class="admin-shortcut" aria-label="Administration"><HubIcon name="requests" /><div><h2>Demandes de délai</h2><p>Examiner les demandes avant les retraits prévus.</p></div><NuxtLink to="/avant-le-depart#extension-admin-heading" class="button primary">Examiner les demandes <HubIcon name="arrow" /></NuxtLink></section>
  <section class="section-block"><div class="section-heading"><div><h2>Vos services</h2></div><div class="filter-tabs" aria-label="Filtrer les services"><button v-for="f in [{ id: 'all', label: 'Tout' }, { id: 'watch', label: 'Regarder' }, { id: 'read', label: 'Lire' }, { id: 'tools', label: 'Outils' }]" :key="f.id" :aria-pressed="filter === f.id" :class="{ selected: filter === f.id }" @click="filter = f.id">{{ f.label }}</button></div></div><div class="services-grid"><ServiceCard v-for="service in visible" :key="service.id" :service="service" /></div></section>
  <section class="section-block"><div class="section-heading"><div><h2>Les derniers ajouts</h2></div><span class="subtle-caption">{{ demo ? 'Exemples de contenus' : 'Votre bibliothèque Plex' }}</span></div>
    <p v-if="loading && !recent.length" class="loading" role="status">Chargement des derniers ajouts…</p>
    <div v-else-if="message" class="banner error-banner" role="alert">{{ message }}<button @click="loadRecent()">Réessayer</button></div>
    <div v-else-if="recent.length" class="media-grid"><article v-for="item in recent" :key="item.id" class="media-card"><component :is="item.url ? 'a' : 'div'" class="media-open" :href="item.url || undefined" :target="item.url ? '_blank' : undefined" :rel="item.url ? 'noopener noreferrer' : undefined"><div class="media-cover"><MediaArtwork :src="item.posterUrl" /><span class="media-kind">{{ kind(item.type) }}</span></div><h3>{{ item.title }}</h3><p>{{ item.subtitle || (item.year ? `${kind(item.type)} · ${item.year}` : kind(item.type)) }}</p><p>Ajouté le <time :datetime="item.addedAt">{{ date(item.addedAt) }}</time></p></component><NuxtLink v-if="capabilities?.downloads && !demo && downloadRoute(item)" :to="downloadRoute(item)!" class="text-button media-download" :aria-label="`Préparer ${item.title} pour un téléchargement`">Préparer un téléchargement <HubIcon name="download" /></NuxtLink></article></div>
    <EmptyState v-else-if="!session.user || !session.plexConnected" icon="play" title="Connexion Plex requise" text="Connectez-vous avec Plex pour retrouver les ajouts auxquels vous avez accès."><NuxtLink to="/compte" class="button secondary">Ouvrir mon compte <HubIcon name="arrow" /></NuxtLink></EmptyState>
    <EmptyState v-else title="Pas de nouveauté pour le moment" :text="capabilities?.recent ? 'Les prochains ajouts apparaîtront ici.' : 'La bibliothèque Plex reste à connecter.'" />
    <div v-if="nextOffset !== null && !message" class="recent-pagination"><button class="button secondary" :disabled="loading" @click="nextOffset !== null && loadRecent(nextOffset)">{{ loading ? 'Chargement…' : 'Voir les ajouts suivants' }}</button></div>
    <p v-if="updatedAt && !message" class="recent-freshness muted">Liste vérifiée le {{ freshness(updatedAt) }} · les épisodes d’une même série sont regroupés.</p>
  </section>
  <RecentBooks />
  <section v-if="capabilities?.departures && !demo" class="section-block"><div class="section-heading"><div><h2>À voir avant leur départ</h2></div></div><DepartureList compact /></section>
    </div>
</template>
<style scoped>
.media-cover{padding:0;position:relative;overflow:hidden}.media-cover>.media-kind{position:absolute;top:12px;left:12px;z-index:1}
.recent-pagination{margin-top:24px}.recent-freshness{font-size:13px;line-height:1.7;margin-top:18px}.media-open{display:block}.media-open>p{font-size:13px;color:var(--muted);margin-top:3px}.media-open[href]:hover .media-cover{filter:brightness(1.12)}.media-download{font-size:13px;margin-top:10px;line-height:1.6}
</style>
