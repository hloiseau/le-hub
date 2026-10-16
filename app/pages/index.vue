<script setup lang="ts">
import type { Media, RecentPage } from '~/types/api'
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
  <section class="welcome"><div><p class="eyebrow">BIENVENUE À LA MAISON</p><h1>On regarde quoi<span> ?</span></h1><p class="lede">Vos films, vos séries, vos prochaines lectures.<br class="desktop-break" /> Tout votre petit univers, au même endroit.</p></div><NuxtLink to="/demandes" class="button secondary">Mes demandes <HubIcon name="arrow" /></NuxtLink></section>
  <section class="hero-card"><div class="hero-copy"><span class="pill">VOTRE SOIRÉE COMMENCE ICI</span><h2>Moins de liens.<br />Plus de bonnes histoires.</h2><p>Retrouvez vos services et gardez un œil sur ce que vous avez envie de découvrir.</p><a v-if="services.find(s => s.id === 'plex')?.url" :href="services.find(s => s.id === 'plex')?.url" target="_blank" rel="noopener noreferrer" class="button light">Ouvrir Plex <HubIcon name="play" /></a><NuxtLink v-else to="/compte" class="button light">Mon espace <HubIcon name="arrow" /></NuxtLink></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one" /><div class="orbit orbit-two" /><div class="art-card card-back"><HubIcon name="book" /><span>UNE AUTRE<br />HISTOIRE</span></div><div class="art-card card-front"><span class="art-stars">✦ &nbsp; · &nbsp; ✧</span><div class="art-moon" /><span>CE SOIR,<br /><b>ON S’ÉVADE.</b></span></div><div class="floating-play"><HubIcon name="play" /></div><span class="art-caption">LE MEILLEUR EST À DÉCOUVRIR</span></div></section>
  <section class="section-block"><div class="section-heading"><div><span class="eyebrow">LES HABITUELS</span><h2>Vos services</h2></div><div class="filter-tabs" aria-label="Filtrer les services"><button v-for="f in [{ id: 'all', label: 'Tout' }, { id: 'watch', label: 'Regarder' }, { id: 'read', label: 'Lire' }, { id: 'tools', label: 'Outils' }]" :key="f.id" :aria-pressed="filter === f.id" :class="{ selected: filter === f.id }" @click="filter = f.id">{{ f.label }}</button></div></div><div class="services-grid"><ServiceCard v-for="service in visible" :key="service.id" :service="service" /></div></section>
  <section class="section-block"><div class="section-heading"><div><span class="eyebrow">FRAÎCHEMENT ARRIVÉS</span><h2>Les derniers ajouts</h2></div><span class="subtle-caption">{{ demo ? 'Exemples de contenus' : 'Votre bibliothèque Plex' }}</span></div>
    <p v-if="loading && !recent.length" class="loading" role="status">On ouvre la bibliothèque…</p>
    <div v-else-if="message" class="banner error-banner" role="alert">{{ message }}<button @click="loadRecent()">Réessayer</button></div>
    <div v-else-if="recent.length" class="media-grid"><component :is="item.url ? 'a' : 'div'" v-for="(item, index) in recent" :key="item.id" class="media-card" :href="item.url || undefined" :target="item.url ? '_blank' : undefined" :rel="item.url ? 'noopener noreferrer' : undefined"><div class="media-cover" :class="`cover-${index % 4}`"><span class="media-kind">{{ kind(item.type) }}</span><div class="cover-decoration" /><HubIcon name="play" class="cover-play" /><span class="cover-title">{{ item.title }}</span></div><h3>{{ item.title }}</h3><p>{{ item.subtitle || (item.year ? `${kind(item.type)} · ${item.year}` : kind(item.type)) }}</p><p>Ajouté le <time :datetime="item.addedAt">{{ date(item.addedAt) }}</time></p></component></div>
    <EmptyState v-else-if="!session.user || !session.plexConnected" icon="play" title="Votre bibliothèque vous attend" text="Connectez-vous avec Plex pour retrouver les ajouts auxquels vous avez accès."><NuxtLink to="/compte" class="button secondary">Ouvrir mon compte <HubIcon name="arrow" /></NuxtLink></EmptyState>
    <EmptyState v-else title="Pas de nouveauté pour le moment" :text="capabilities?.recent ? 'Les prochains ajouts apparaîtront ici.' : 'La bibliothèque Plex reste à connecter.'" />
    <div v-if="nextOffset !== null && !message" class="recent-pagination"><button class="button secondary" :disabled="loading" @click="nextOffset !== null && loadRecent(nextOffset)">{{ loading ? 'Chargement…' : 'Voir les ajouts suivants' }}</button></div>
    <p v-if="updatedAt && !message" class="recent-freshness muted">Liste vérifiée le {{ freshness(updatedAt) }} · les épisodes d’une même série sont regroupés.</p>
  </section>
  <section v-if="capabilities?.departures && !demo" class="section-block"><div class="section-heading"><div><span class="eyebrow">VOS LECTURES EN COURS</span><h2>À voir avant leur départ</h2></div></div><DepartureList compact /></section>
  <div class="bottom-grid"><NuxtLink to="/avant-le-depart" class="feature-tile departure-tile"><span class="tile-icon"><HubIcon name="bell" /></span><div><span class="tag">{{ capabilities?.departures ? 'VOS LECTURES' : 'PROCHAINE PRIORITÉ' }}</span><h3>À voir avant leur départ</h3><p>Les départs estimés des contenus que vous avez commencé à regarder.</p></div><HubIcon name="arrow" /></NuxtLink><NuxtLink to="/aide" class="feature-tile"><span class="tile-icon"><HubIcon name="help" /></span><div><span class="eyebrow">UN PEU PERDU ?</span><h3>On vous guide</h3><p>Les services, les comptes et les bonnes habitudes.</p></div><HubIcon name="arrow" /></NuxtLink></div>
</template>
<style scoped>
.recent-pagination{margin-top:24px}.recent-freshness{font-size:12px;line-height:1.7;margin-top:18px}
</style>
