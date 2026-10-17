<script setup lang="ts">
import { metricDate, metricLabels, metricText, type Metrics } from '~/utils/metrics'
import type { MonitoringSnapshot, MonitoringHistory, PlexActivity } from '~/types/api'
const { session, capabilities, ready, demo, refresh } = useHub()
const snapshot = ref<MonitoringSnapshot | null>(null); const history = ref<MonitoringHistory | null>(null); const admin = ref<PlexActivity | null>(null)
const range = ref<'1h' | '24h' | '7d'>('24h'); const metric = ref<keyof Metrics>('cpu_percent')
const error = ref(''); const loading = ref(false); const showDetails = ref(false); const now = ref(Date.now())
const enabled = computed(() => ready.value && !!session.value.user && session.value.plexConnected && capabilities.value?.monitoring === true && !demo.value)
const live = computed(() => !!snapshot.value && now.value < Date.parse(snapshot.value.expiresAt))
const currentActivity = computed(() => live.value && snapshot.value?.activity.status === 'available' ? snapshot.value.activity : null)
const details = computed(() => session.value.admin && live.value && admin.value && now.value < Date.parse(admin.value.expiresAt) ? admin.value : null)
const groups: { name: string, keys: (keyof Metrics)[] }[] = [
  { name: 'CPU & mémoire', keys: ['cpu_percent', 'cpu_temperature', 'load_1m', 'memory_used_bytes', 'memory_total_bytes'] },
  { name: 'GPU', keys: ['gpu_video_percent', 'gpu_render_percent', 'gpu_temperature', 'gpu_power_watts', 'gpu_frequency_mhz'] },
  { name: 'Stockage & réseau', keys: ['storage_used_bytes', 'storage_total_bytes', 'disk_read_bytes_per_second', 'disk_write_bytes_per_second', 'network_receive_bytes_per_second', 'network_send_bytes_per_second'] },
]
let revision = 0; let poll: ReturnType<typeof setInterval> | undefined; let lastFetch = 0; let controller: AbortController | undefined
async function load() {
  if (!enabled.value || (import.meta.client && document.hidden)) return
  const current = ++revision; controller?.abort(); controller = new AbortController()
  loading.value = true; error.value = ''; lastFetch = Date.now()
  try {
    const options = { retry: 0, signal: controller.signal }
    const [view, chart, privateDetails] = await Promise.all([
      $fetch<MonitoringSnapshot>('/api/v1/monitoring', options),
      $fetch<MonitoringHistory>('/api/v1/monitoring/history', { ...options, query: { range: range.value } }),
      session.value.admin && showDetails.value ? $fetch<PlexActivity>('/api/v1/admin/plex-activity', options) : Promise.resolve(null),
    ])
    if (current !== revision) return
    snapshot.value = view; history.value = chart; admin.value = privateDetails; now.value = Date.now()
  } catch (e) {
    if (current !== revision) return
    snapshot.value = null; admin.value = null; error.value = apiMessage(e)
    if ([401, 403].includes((e as { statusCode?: number }).statusCode || 0)) { history.value = null; await refresh() }
  } finally { if (current === revision) loading.value = false }
}
function clear() { revision++; controller?.abort(); snapshot.value = null; history.value = null; admin.value = null; error.value = ''; loading.value = false }
function visibility() { now.value = Date.now(); if (document.hidden) { revision++; controller?.abort(); loading.value = false } else void load() }
watch([enabled, () => session.value.user?.plexId, () => session.value.admin], () => { clear(); showDetails.value = false; void load() }, { immediate: true })
watch(range, () => { history.value = null; void load() })
watch(showDetails, () => { admin.value = null; void load() })
onMounted(() => { document.addEventListener('visibilitychange', visibility); poll = setInterval(() => { now.value = Date.now(); if (!document.hidden && !loading.value && Date.now() - lastFetch >= 30_000) void load() }, 1000) })
onBeforeUnmount(() => { clear(); clearInterval(poll); document.removeEventListener('visibilitychange', visibility) })
const hw = (value: boolean | null) => value === null ? 'Non renseigné' : value ? 'Oui' : 'Non'
</script>
<template>
  <div>
  <section class="page-heading"><p class="eyebrow">DANS LES COULISSES</p><h1>Les performances<span>.</span></h1><p class="lede">L’activité du serveur, ses mesures et leurs évolutions sur sept jours.</p></section>
  <EmptyState v-if="!enabled" icon="chart" title="Les mesures ne sont pas activées" text="Les performances apparaîtront lorsque la collecte sera disponible. Aucun chiffre simulé n’est présenté comme une mesure réelle." />
  <template v-else>
    <div class="section-heading"><p class="muted">Actualisation toutes les 30 secondes · suspendue dans un onglet masqué.</p><button class="button secondary compact" :disabled="loading" @click="load">Actualiser les performances</button></div>
    <p v-if="loading && !snapshot" role="status">Chargement des mesures…</p>
    <div v-if="error" role="alert" class="banner error-banner">{{ error }}<button @click="load">Réessayer les mesures</button></div>
    <p v-if="snapshot && !live" role="status" class="inline-notice">Les mesures sont périmées. Une nouvelle vérification est nécessaire.</p>
    <section class="panel activity-panel" aria-labelledby="activity-title"><h2 id="activity-title">Plex en ce moment</h2>
      <p v-if="!currentActivity" class="muted">{{ snapshot?.activity.status === 'error' ? 'Activité momentanément indisponible.' : 'Activité non disponible ou périmée.' }}</p>
      <dl v-else class="activity-counts"><div v-for="(value, label) in { 'Sessions': currentActivity.sessions, 'Lecture directe': currentActivity.directPlay, 'Flux directs': currentActivity.directStream, 'Transcodages': currentActivity.transcodes, 'Avec accélération matérielle': currentActivity.hardwareTranscodes }" :key="label"><dt>{{ label }}</dt><dd>{{ value ?? 'Non renseigné' }}</dd></div><div><dt>Débit Plex</dt><dd>{{ currentActivity.bandwidthKbps === null ? 'Non renseigné' : `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(currentActivity.bandwidthKbps)} kbit/s` }}</dd></div></dl>
      <p class="muted">L’accélération décrit les décodeurs et encodeurs signalés par Plex. Elle ne mesure pas l’occupation du GPU.</p>
      <p v-if="snapshot?.activityUpdatedAt" class="muted">Activité vérifiée le {{ metricDate(snapshot.activityUpdatedAt) }}.</p>
    </section>
    <div class="performance-grid"><section v-for="group in groups" :key="group.name" class="panel"><h2>{{ group.name }}</h2><dl><div v-for="key in group.keys" :key="key" class="metric-row" :data-metric="key"><dt>{{ metricLabels[key] }}</dt><dd>{{ metricText(snapshot?.metrics[key], !!snapshot && !live) }}</dd></div></dl></section></div>
    <p v-if="snapshot?.hostUpdatedAt" class="muted">Mesures de l’hôte collectées le {{ metricDate(snapshot.hostUpdatedAt) }}. Un capteur absent reste « Non disponible ».</p>
    <section class="panel history-panel" aria-labelledby="history-title"><div class="section-heading"><h2 id="history-title">Dans le temps</h2><div class="chart-selectors"><label>Mesure<select v-model="metric" aria-label="Mesure"><option v-for="(label, key) in metricLabels" :key="key" :value="key">{{ label }}</option></select></label><label>Période<select v-model="range" aria-label="Période"><option value="1h">1 heure</option><option value="24h">24 heures</option><option value="7d">7 jours</option></select></label></div></div><MetricChart v-if="history" :history="history" :metric="metric" /><p v-else class="muted">L’historique apparaîtra après les premières mesures.</p><p v-if="history" class="muted">Historique chargé le {{ metricDate(history.updatedAt) }} · rétention de {{ history.retentionDays }} jours.</p></section>
    <section v-if="session.admin" class="panel admin-monitoring"><h2>Détails administrateur</h2><label><input v-model="showDetails" type="checkbox"> Afficher les sessions et les équipements</label>
      <template v-if="details"><p v-if="details.hostVersion">Version de l’hôte : {{ details.hostVersion }}</p><div v-for="(item, index) in details.sessions" :key="index" class="session-row"><h3>{{ item.user || 'Utilisateur non renseigné' }} · {{ item.title || 'Titre non renseigné' }}</h3><p>{{ item.state }} · {{ item.decision }} · vidéo {{ item.videoCodec || 'non renseigné' }} / audio {{ item.audioCodec || 'non renseigné' }}</p><p>Décodage matériel : {{ hw(item.hardwareDecoding) }} · Encodage matériel : {{ hw(item.hardwareEncoding) }}</p></div><p v-if="!details.sessions.length">Aucune session détaillée disponible.</p><div v-for="(item, index) in details.hostDetails" :key="index" class="host-row"><h3>{{ item.name }} · {{ item.kind }}</h3><p v-if="item.status === 'error'">Équipement en erreur</p><dl><div v-for="(value, key) in item.values" :key="key" class="metric-row"><dt>{{ metricLabels[key] }}</dt><dd>{{ metricText(value) }}</dd></div></dl></div></template>
      <p v-else-if="showDetails" class="muted">Détails non disponibles ou périmés.</p>
    </section>
  </template>
  </div>
</template>
<style scoped>
.performance-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1rem;margin:1.5rem 0}.panel{min-width:0}.metric-row{padding:.8rem 0;border-bottom:1px solid #ffffff12}.metric-row dt{font-size:.85rem;color:var(--muted,#a9abae)}.metric-row dd{margin:.3rem 0 0;font-weight:600;overflow-wrap:anywhere}.activity-counts{display:flex;gap:1.5rem;flex-wrap:wrap}.activity-counts dt{font-size:.8rem;color:var(--muted,#a9abae)}.activity-counts dd{margin:.5rem 0;font-size:1.6rem}.activity-panel .muted{font-size:.85rem}.history-panel,.admin-monitoring{margin-top:1.5rem}.chart-selectors{display:flex;gap:1rem;flex-wrap:wrap}.chart-selectors label{font-size:.8rem}.chart-selectors select{display:block;width:100%;max-width:300px;padding:.5rem;background:var(--surface,#202521);color:inherit;border:1px solid #ffffff30;border-radius:6px;margin-top:.3rem}.session-row,.host-row{padding-top:1rem;margin-top:1rem;border-top:1px solid #ffffff20;overflow-wrap:anywhere}.admin-monitoring input{margin-right:.5rem}@media(max-width:1050px){.performance-grid{grid-template-columns:1fr 1fr}}@media(max-width:650px){.performance-grid{grid-template-columns:1fr}.chart-selectors,.chart-selectors label{width:100%}.chart-selectors select{max-width:100%}.section-heading{flex-wrap:wrap;gap:1rem}.activity-counts>div{flex:1 0 120px}}
</style>
