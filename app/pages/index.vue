<script setup lang="ts">
import type { Media } from '~/types/api'
const { session, services, demo, ready, capabilities } = useHub()
const filter = ref('all')
const recent = ref<Media[]>([])
const loading = ref(false)
const message = ref('')
let revision = 0
const visible = computed(() => services.value.filter(s => filter.value === 'all' || s.category === filter.value))
async function loadRecent() {
  const request = ++revision
  recent.value = []; message.value = ''; loading.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected) return
  loading.value = true
  try {
    const items = demo.value ? demoRecent : (await $fetch<{ items: Media[] }>('/api/v1/recent')).items
    if (request === revision) recent.value = items
  } catch (e) { if (request === revision) message.value = apiMessage(e) }
  finally { if (request === revision) loading.value = false }
}
watch([ready, () => session.value.user?.discordId, () => session.value.plexConnected], loadRecent, { immediate: true })
onBeforeUnmount(() => { revision++ })
const kind = (type: string) => ({ movie: 'Film', show: 'Série', season: 'Saison', episode: 'Épisode' }[type] || 'Contenu')
</script>
<template>
  <section class="welcome"><div><p class="eyebrow">BIENVENUE À LA MAISON</p><h1>On regarde quoi<span> ?</span></h1><p class="lede">Vos films, vos séries, vos prochaines lectures.<br class="desktop-break" /> Tout votre petit univers, au même endroit.</p></div><NuxtLink to="/demandes" class="button secondary">Mes demandes <HubIcon name="arrow" /></NuxtLink></section>
  <section class="hero-card"><div class="hero-copy"><span class="pill">VOTRE SOIRÉE COMMENCE ICI</span><h2>Moins de liens.<br />Plus de bonnes histoires.</h2><p>Retrouvez vos services et gardez un œil sur ce que vous avez envie de découvrir.</p><a v-if="services.find(s => s.id === 'plex')?.url" :href="services.find(s => s.id === 'plex')?.url" target="_blank" rel="noopener noreferrer" class="button light">Ouvrir Plex <HubIcon name="play" /></a><NuxtLink v-else to="/compte" class="button light">Mon espace <HubIcon name="arrow" /></NuxtLink></div><div class="hero-art" aria-hidden="true"><div class="orbit orbit-one" /><div class="orbit orbit-two" /><div class="art-card card-back"><HubIcon name="book" /><span>UNE AUTRE<br />HISTOIRE</span></div><div class="art-card card-front"><span class="art-stars">✦ &nbsp; · &nbsp; ✧</span><div class="art-moon" /><span>CE SOIR,<br /><b>ON S’ÉVADE.</b></span></div><div class="floating-play"><HubIcon name="play" /></div><span class="art-caption">LE MEILLEUR EST À DÉCOUVRIR</span></div></section>
  <section class="section-block"><div class="section-heading"><div><span class="eyebrow">LES HABITUELS</span><h2>Vos services</h2></div><div class="filter-tabs" aria-label="Filtrer les services"><button v-for="f in [{ id: 'all', label: 'Tout' }, { id: 'watch', label: 'Regarder' }, { id: 'read', label: 'Lire' }, { id: 'tools', label: 'Outils' }]" :key="f.id" :aria-pressed="filter === f.id" :class="{ selected: filter === f.id }" @click="filter = f.id">{{ f.label }}</button></div></div><div class="services-grid"><ServiceCard v-for="service in visible" :key="service.id" :service="service" /></div></section>
  <section class="section-block"><div class="section-heading"><div><span class="eyebrow">FRAÎCHEMENT ARRIVÉS</span><h2>Les derniers ajouts</h2></div><span class="subtle-caption">{{ demo ? 'Exemples de contenus' : 'Votre bibliothèque Plex' }}</span></div>
    <p v-if="loading" class="loading" role="status">On ouvre la bibliothèque…</p>
    <div v-else-if="message" class="banner error-banner" role="alert">{{ message }}<button @click="loadRecent">Réessayer</button></div>
    <div v-else-if="recent.length" class="media-grid"><component :is="item.url ? 'a' : 'div'" v-for="(item, index) in recent.slice(0, 8)" :key="item.id" class="media-card" :href="item.url || undefined" :target="item.url ? '_blank' : undefined" :rel="item.url ? 'noopener noreferrer' : undefined"><div class="media-cover" :class="`cover-${index % 4}`"><span class="media-kind">{{ kind(item.type) }}</span><div class="cover-decoration" /><HubIcon name="play" class="cover-play" /><span class="cover-title">{{ item.title }}</span></div><h3>{{ item.title }}</h3><p>{{ item.subtitle || (item.year ? `${kind(item.type)} · ${item.year}` : kind(item.type)) }}</p></component></div>
    <EmptyState v-else-if="!session.user || !session.plexConnected" icon="play" title="Votre bibliothèque vous attend" text="Connectez-vous et liez votre compte Plex pour retrouver les ajouts auxquels vous avez accès."><NuxtLink to="/compte" class="button secondary">Ouvrir mon compte <HubIcon name="arrow" /></NuxtLink></EmptyState>
    <EmptyState v-else title="Pas de nouveauté pour le moment" :text="capabilities?.recent ? 'Les prochains ajouts apparaîtront ici.' : 'La bibliothèque Plex reste à connecter.'" />
  </section>
  <div class="bottom-grid"><NuxtLink to="/avant-le-depart" class="feature-tile departure-tile"><span class="tile-icon"><HubIcon name="bell" /></span><div><span class="tag">PROCHAINE PRIORITÉ</span><h3>À voir avant leur départ</h3><p>Être prévenu avant qu’un contenu non terminé quitte le serveur.</p></div><HubIcon name="arrow" /></NuxtLink><NuxtLink to="/aide" class="feature-tile"><span class="tile-icon"><HubIcon name="help" /></span><div><span class="eyebrow">UN PEU PERDU ?</span><h3>On vous guide</h3><p>Les services, les comptes et les bonnes habitudes.</p></div><HubIcon name="arrow" /></NuxtLink></div>
</template>
