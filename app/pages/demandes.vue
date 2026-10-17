<script setup lang="ts">
import { statusLabels } from '~/types/api'
import type { MediaRequest, RequestPage, RequestStatus } from '~/types/api'
const { ready, session, demo, services } = useHub()
const page = ref<RequestPage>({ items: [], total: 0, offset: 0, limit: 10 })
const loading = ref(false)
const error = ref('')
const status = ref('all')
let revision = 0
async function load(offset = 0) {
  const current = ++revision; error.value = ''; page.value = { items: [], total: 0, offset, limit: 10 }; loading.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected) return
  loading.value = true
  try { const result = demo.value ? demoRequests : await $fetch<RequestPage>('/api/v1/requests', { query: { offset } }); if (current === revision) page.value = result }
  catch (e) { if (current === revision) error.value = apiMessage(e) }
  finally { if (current === revision) loading.value = false }
}
watch([ready, () => session.value.user?.plexId, () => session.value.plexConnected], () => load(), { immediate: true })
onBeforeUnmount(() => { revision++ })
const visible = computed(() => page.value.items.filter(r => status.value === 'all' || r.status === status.value))
const seerr = computed(() => services.value.find(s => s.id === 'seerr')?.url)
const statusDetails: Record<RequestStatus, string> = {
  pending: 'Seerr attend une décision sur cette demande.',
  approved: 'Seerr a approuvé cette demande. Aucune disponibilité n’est encore confirmée.',
  declined: 'Cette demande a été refusée dans Seerr.',
  error: 'Seerr signale un échec de cette demande. Consultez sa fiche ou contactez l’administrateur ; la cause précise n’est pas fournie ici.',
  processing: 'Seerr indique un traitement en cours. Un téléchargement terminé peut encore attendre son import et son indexation dans Plex.',
  partial: 'Seerr signale une disponibilité partielle. Cela ne confirme pas que tous les épisodes ou toutes les saisons demandés sont disponibles.',
  available: 'Seerr indique ce média disponible. La lecture et votre accès dans Plex ne sont pas vérifiés par ce suivi.',
  unknown: 'Seerr ne fournit pas d’état reconnu. La disponibilité reste inconnue.',
}
function requestURL(request: MediaRequest) {
  if (!seerr.value || !Number.isSafeInteger(request.mediaId) || request.mediaId <= 0 || !['movie', 'tv'].includes(request.type)) return undefined
  try {
    const base = new URL(seerr.value)
    if (base.protocol !== 'https:' || base.username || base.password) return undefined
    base.pathname = base.pathname.replace(/\/$/, '') + `/${request.type}/${request.mediaId}`
    base.search = ''; base.hash = ''
    return base.toString()
  } catch { return undefined }
}
function date(value: string) { return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) : 'Date inconnue' }
</script>
<template>
  <div>
  <section class="page-heading"><p class="eyebrow">DE L’ENVIE À L’ÉCRAN</p><h1>Mes demandes<span>.</span></h1><p class="lede">Un seul endroit pour savoir où en sont vos films et séries.</p></section>
  <p class="muted" style="margin-bottom: 20px; font-size: 12px">Un autre membre a déjà demandé votre prochaine envie ? <NuxtLink to="/suivis" class="text-button">Retrouver mes suivis <HubIcon name="arrow" /></NuxtLink></p>
  <div class="section-heading"><label class="select-label">Afficher <select v-model="status"><option value="all">Tous les états de cette page</option><option v-for="(label, value) in statusLabels" :key="value" :value="value">{{ label }}</option></select></label><a v-if="seerr" :href="seerr" target="_blank" rel="noopener noreferrer" class="button primary">Demander sur Seerr <HubIcon name="external" /></a></div>
  <EmptyState v-if="!session.user || !session.plexConnected" icon="requests" title="Vos demandes, rien qu’à vous" text="Connectez-vous avec Plex. Votre compte Seerr sera retrouvé automatiquement grâce à votre identité Plex."><NuxtLink to="/compte" class="button primary">Mon compte <HubIcon name="arrow" /></NuxtLink></EmptyState>
  <p v-else-if="loading" class="loading" role="status">Récupération de vos demandes…</p>
  <div v-else-if="error" class="banner error-banner" role="alert">{{ error }}<button @click="load(page.offset)">Réessayer</button><NuxtLink to="/compte">Mon compte</NuxtLink></div>
  <div v-else-if="visible.length" class="request-list"><article v-for="request in visible" :key="request.id" class="request-row"><span class="request-icon"><HubIcon :name="request.type === 'movie' ? 'play' : 'server'" /></span><div class="request-info"><h3>{{ request.title }}</h3><p>{{ request.type === 'movie' ? 'Film' : 'Série' }}<span v-if="request.seasons.length"> · Saison{{ request.seasons.length > 1 ? 's' : '' }} {{ request.seasons.join(', ') }}</span> · {{ date(request.createdAt) }}</p><details class="request-detail"><summary>Détail du suivi<span class="sr-only"> de {{ request.title }}</span></summary><p>{{ statusDetails[request.status] || statusDetails.unknown }}</p><p>Demande Seerr n° {{ request.id }} · Source : Seerr</p><a v-if="requestURL(request)" :href="requestURL(request)" target="_blank" rel="noopener noreferrer" class="text-button">Ouvrir la fiche dans Seerr <HubIcon name="external" /></a></details></div><span class="status-badge" :class="request.status">{{ statusLabels[request.status] || 'État inconnu' }}</span></article></div>
  <EmptyState v-else icon="requests" title="Aucune demande à afficher" text="Votre prochaine envie trouvera sa place ici. Si un filtre est actif, essayez de le modifier." />
  <div v-if="page.total > 10 && !error" class="pagination"><button class="button secondary" :disabled="page.offset === 0 || loading" @click="load(Math.max(0, page.offset - page.limit))">Précédent</button><span>{{ page.offset + 1 }}–{{ Math.min(page.offset + page.limit, page.total) }} sur {{ page.total }}</span><button class="button secondary" :disabled="page.offset + page.limit >= page.total || loading" @click="load(page.offset + page.limit)">Suivant</button></div>
  <p class="footnote">Un téléchargement à 100 % peut encore attendre son import. Les états présentés ici proviennent de Seerr.</p>
  </div>
</template>
<style scoped>
.request-detail{margin-top:12px;font-size:12px;line-height:1.7}.request-detail summary{cursor:pointer;color:var(--purple)}.request-detail p{font-size:12px;line-height:1.7;margin:10px 0}.request-detail a{display:inline-flex;align-items:center;gap:6px}.request-info h3{overflow-wrap:anywhere}.status-badge.error{background:#452d37;color:#e8a6b7}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
