<script setup lang="ts">
import type { Diagnostic } from '~/types/api'
const props = defineProps<{ requestId: number }>()
const { session, demo, refresh } = useHub()
const allowed = computed(() => !demo.value && session.value.admin === true && !!session.value.user && session.value.plexConnected === true)
const data = ref<Diagnostic | null>(null)
const loading = ref(false)
const error = ref('')
let revision = 0
const labels: Record<Diagnostic['stage'], string> = { unknown: 'État non confirmé', approval: 'Validation en attente', declined: 'Demande refusée', not_found: 'Média absent de la source', downloading: 'Téléchargement en cours', download_failed: 'Échec du téléchargement', importing: 'Import en cours', manual_import: 'Import manuel à vérifier', space: 'Espace disque insuffisant', permissions: 'Droits d’accès à vérifier', rename_import: 'Renommage ou import à vérifier', imported: 'Import signalé', plex_indexing: 'Indexation Plex à vérifier' }
const evidence = computed(() => data.value?.evidence.filter(item => item.message !== data.value?.summary) || [])
const guide = computed(() => {
  if (!data.value?.guideUrl) return ''
  try {
    const url = new URL(data.value.guideUrl)
    return url.protocol === 'https:' && url.hostname === 'wiki.servarr.com' && !url.username && !url.password && !url.port && ['/radarr/faq', '/radarr/settings'].includes(url.pathname) && !url.search ? url.href : ''
  } catch { return '' }
})
const date = (value: string) => Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(value)) : 'Date inconnue'
function clear() { revision++; data.value = null; error.value = ''; loading.value = false }
async function load() {
  if (!allowed.value || loading.value || !Number.isSafeInteger(props.requestId) || props.requestId < 1 || props.requestId > 2147483647) return
  const current = ++revision
  data.value = null; error.value = ''; loading.value = true
  try {
    const result = await $fetch<Diagnostic>('/api/v1/admin/diagnostics', { query: { requestId: props.requestId }, retry: 0 })
    if (current === revision) data.value = result
  } catch (value) {
    if (current !== revision) return
    error.value = apiMessage(value)
    if ([401, 403].includes((value as { statusCode?: number }).statusCode || 0)) await refresh()
  } finally { if (current === revision) loading.value = false }
}
watch([allowed, () => session.value.user?.plexId, () => session.value.user?.discordId, () => props.requestId], clear, { flush: 'sync' })
onBeforeUnmount(clear)
</script>

<template>
  <section v-if="allowed" class="request-diagnostic" :aria-labelledby="`diagnostic-heading-${requestId}`">
    <h4 :id="`diagnostic-heading-${requestId}`">Diagnostic administrateur</h4>
    <p class="muted">Consultez les étapes de cette demande dans Radarr ou Sonarr, puis l’indexation Plex. Cette vérification ne modifie aucun contenu.</p>
    <button class="button secondary compact" :disabled="loading" @click="load">{{ loading ? 'Vérification…' : error ? 'Réessayer le diagnostic' : data ? 'Actualiser le diagnostic' : 'Vérifier cette demande' }}</button>
    <p v-if="loading" role="status">Vérification des sources de la demande n° {{ requestId }}…</p>
    <p v-else-if="error" class="inline-notice diagnostic-error" role="alert">{{ error }}</p>
    <div v-else-if="data" class="diagnostic-result">
      <p><strong>{{ labels[data.stage] || labels.unknown }}</strong></p>
      <p>{{ data.summary }}</p>
      <ul v-if="evidence.length"><li v-for="(item, index) in evidence" :key="index">{{ item.message }}<span v-if="item.at" class="muted"> · {{ date(item.at) }}</span></li></ul>
      <p>{{ data.plexStatus === 'indexed' ? 'Métadonnées retrouvées dans Plex avec votre accès administrateur. Cela ne confirme ni la lecture ni la présence de tous les épisodes.' : 'Indexation Plex non vérifiée. Cela ne signifie pas que le contenu est absent.' }}</p>
      <p v-if="data.queueTruncated || data.historyTruncated" class="inline-notice">Résultat partiel : {{ [data.queueTruncated ? 'file limitée à 50 éléments' : '', data.historyTruncated ? 'historique limité à 30 événements récents' : ''].filter(Boolean).join(' ; ') }}. Des éléments peuvent manquer.</p>
      <a v-if="guide" :href="guide" target="_blank" rel="noopener noreferrer" class="text-button">Consulter le guide officiel avant toute intervention <HubIcon name="external" /></a>
      <p class="diagnostic-freshness muted">{{ data.source === 'radarr' ? 'Radarr' : 'Sonarr' }} {{ data.version }} · Vérifié le {{ date(data.checkedAt) }} (heure de Paris). Observation à cet instant ; actualisez pour vérifier un changement.</p>
    </div>
  </section>
</template>

<style scoped>
.request-diagnostic{margin-top:18px;padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--bg);min-width:0}.request-diagnostic h4{font-size:14px;margin:0 0 10px}.request-diagnostic p,.request-diagnostic li{font-size:12px;line-height:1.7;overflow-wrap:anywhere}.request-diagnostic p{margin:12px 0}.request-diagnostic ul{padding-left:20px;margin:12px 0}.request-diagnostic li+li{margin-top:8px}.diagnostic-result{margin-top:16px}.diagnostic-error{color:var(--danger,#ff9c9c)}.diagnostic-freshness{font-size:11px!important}.request-diagnostic .text-button{white-space:normal;text-align:left}.request-diagnostic .button{max-width:100%;white-space:normal}
</style>
