<script setup lang="ts">
import { statusLabels } from '~/types/api'
import type { MediaRequest, RequestStatus } from '~/types/api'
const props = defineProps<{ items: MediaRequest[], seerrUrl?: string }>()
const { session, demo } = useHub()
const openDetails = ref<number[]>([])
function toggleDetail(id: number, event: Event) {
  const open = (event.target as HTMLDetailsElement).open
  openDetails.value = open ? [...new Set([...openDetails.value, id])] : openDetails.value.filter(value => value !== id)
}
watch(() => props.items, () => { openDetails.value = [] }, { flush: 'sync' })
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
  if (!props.seerrUrl || !Number.isSafeInteger(request.mediaId) || request.mediaId <= 0 || !['movie', 'tv'].includes(request.type)) return undefined
  try {
    const base = new URL(props.seerrUrl)
    if (base.protocol !== 'https:' || base.username || base.password) return undefined
    base.pathname = base.pathname.replace(/\/$/, '') + `/${request.type}/${request.mediaId}`
    base.search = ''; base.hash = ''
    return base.toString()
  } catch { return undefined }
}
function date(value: string) { return Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', timeZone: 'Europe/Paris' }) : 'Date inconnue' }
</script>
<template>
<div class="request-list"><article v-for="request in items" :key="request.id" class="request-row"><span class="request-poster"><MediaArtwork :src="request.posterUrl" /></span><div class="request-info"><h3>{{ request.title }}</h3><p>{{ request.type === 'movie' ? 'Film' : 'Série' }}<span v-if="request.seasons.length"> · Saison{{ request.seasons.length > 1 ? 's' : '' }} {{ request.seasons.join(', ') }}</span> · {{ date(request.createdAt) }}</p><p v-if="request.requesterName">Demandé par {{ request.requesterName }}</p><details class="request-detail" :open="openDetails.includes(request.id)" @toggle="toggleDetail(request.id, $event)"><summary>Détail du suivi<span class="sr-only"> de {{ request.title }}</span></summary><p>{{ statusDetails[request.status] || statusDetails.unknown }}</p><p>Demande Seerr n° {{ request.id }} · Source : Seerr</p><a v-if="requestURL(request)" :href="requestURL(request)" target="_blank" rel="noopener noreferrer" class="text-button">Ouvrir la fiche dans Seerr <HubIcon name="external" /></a><RequestDiagnostic v-if="openDetails.includes(request.id) && session.admin && !demo" :request-id="request.id" /></details></div><span class="status-badge" :class="request.status">{{ statusLabels[request.status] || 'État inconnu' }}</span></article></div>
</template>
<style scoped>
.request-poster{width:54px;height:81px;flex-shrink:0;border-radius:6px;overflow:hidden}.request-info{min-width:0;flex:1}@media(max-width:700px){.request-row{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:start}.request-poster{width:44px;height:66px;grid-row:1/3}.request-row .status-badge{grid-column:2;margin-left:0;justify-self:start}}
.request-detail{margin-top:12px;font-size:12px;line-height:1.7}.request-detail summary{cursor:pointer;color:var(--purple)}.request-detail p{font-size:12px;line-height:1.7;margin:10px 0}.request-detail a{display:inline-flex;align-items:center;gap:6px}.request-info h3{overflow-wrap:anywhere}.status-badge.error{background:#452d37;color:#e8a6b7}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
</style>
