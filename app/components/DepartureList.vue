<script setup lang="ts">
import type { Departures } from '~/types/api'
const props = defineProps<{ compact?: boolean }>()
const { session, ready, capabilities, demo, refresh } = useHub()
const data = ref<Departures | null>(null)
const loading = ref(false)
const message = ref('')
const showCompleted = ref(false)
const mediaType = ref('all')
const days = ref('30')
const query = ref('')
const now = ref(Date.now())
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
const enabled = computed(() => !demo.value && capabilities.value?.departures === true)
const normalized = (value: string) => value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('fr').trim()
const filtered = computed(() => (data.value?.items || []).filter(item =>
  (showCompleted.value || item.watch !== 'completed') &&
  (mediaType.value === 'all' || (mediaType.value === 'movie' ? item.type === 'movie' : ['show', 'season', 'episode'].includes(item.type))) &&
  (days.value === '30' || Date.parse(item.estimatedAt) <= now.value + 7 * 86400_000) &&
  normalized(item.title).includes(normalized(query.value))))
const visible = computed(() => props.compact ? filtered.value.slice(0, 3) : filtered.value)
const visibleIDs = computed(() => new Set(visible.value.map(item => item.id)))
const rows = computed(() => props.compact ? visible.value : (data.value?.items || []))
const hasFilters = computed(() => showCompleted.value || mediaType.value !== 'all' || days.value !== '30' || query.value.trim() !== '')
function resetFilters() { showCompleted.value = false; mediaType.value = 'all'; days.value = '30'; query.value = '' }
const kind = (value: string) => ({ movie: 'Film', episode: 'Épisode', season: 'Saison', show: 'Série' }[value] || 'Contenu')
const watchLabel = (value: string) => ({ unstarted: 'Marqué non vu dans Plex', in_progress: 'Lecture commencée', completed: 'Marqué comme terminé', unknown: 'Visionnage incertain' }[value] || 'Visionnage incertain')
const date = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' }).format(new Date(value))
const time = (value: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(value))
async function load() {
  const current = ++revision
  clearTimeout(timer)
  // Keep draft and pending submissions mounted while stale rows are hidden and disabled.
  message.value = ''; loading.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected || !enabled.value) { data.value = null; return }
  loading.value = true
  try {
    const page = await $fetch<Departures>('/api/v1/departures', { retry: 0 })
    if (current !== revision) return
    const remaining = Date.parse(page.expiresAt) - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('expired source')
    data.value = page; now.value = Date.now()
    timer = setTimeout(() => { loading.value = true; if (document.visibilityState === 'visible') void load() }, Math.min(remaining, 60_000))
  } catch (error) {
    if (current !== revision) return
    data.value = null; message.value = apiMessage(error)
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401 || status === 403) await refresh()
  } finally { if (current === revision) loading.value = false }
}
function visibleAgain() { if (document.visibilityState === 'visible') void load() }
watch([ready, enabled, () => session.value.user?.plexId, () => session.value.plexConnected], () => { data.value = null; resetFilters(); void load() }, { immediate: true, flush: 'sync' })
onMounted(() => document.addEventListener('visibilitychange', visibleAgain))
onBeforeUnmount(() => { revision++; clearTimeout(timer); document.removeEventListener('visibilitychange', visibleAgain) })
</script>
<template>
  <div class="departures">
    <p v-if="!enabled" class="inline-notice">Cette intégration n’est pas encore active. Les sources doivent être configurées avant d’afficher vos départs.</p>
    <template v-else>
      <div class="departure-toolbar"><p class="muted">Vos demandes, suivis et lectures · 30 prochains jours</p><button class="button secondary compact" :disabled="loading" @click="load">Actualiser</button></div>
      <div v-if="!compact" class="departure-filters" role="group" aria-label="Filtrer mes départs">
        <label>Rechercher un titre<input v-model="query" type="search" placeholder="Film, série ou épisode" /></label>
        <div class="departure-field"><label for="departure-type">Type de contenu</label><select id="departure-type" v-model="mediaType"><option value="all">Films et séries</option><option value="movie">Films</option><option value="series">Séries et épisodes</option></select></div>
        <div class="departure-field"><label for="departure-days">Échéance estimée</label><select id="departure-days" v-model="days"><option value="30">Dans les 30 jours</option><option value="7">Dans les 7 jours</option></select></div>
        <label class="departure-toggle"><input v-model="showCompleted" type="checkbox" /> Inclure les contenus terminés</label>
        <button v-if="hasFilters" class="button secondary compact" @click="resetFilters">Réinitialiser les filtres</button>
      </div>
      <p v-if="loading" class="loading" role="status">Vérification de vos accès et des départs…</p>
      <div v-else-if="message" class="banner error-banner" role="alert">{{ message }}<button @click="load">Réessayer</button></div>
      <div v-if="data" v-show="!loading" class="departure-results">
        <p v-if="!compact && data.items.length" class="departure-count muted" role="status">{{ visible.length }} contenu(s) affiché(s) sur {{ data.items.length }} départ(s) confirmé(s).</p>
        <!-- Keep filtered forms mounted so a draft or pending submission survives a filter change. -->
        <div v-show="visible.length" class="departure-list"><article v-for="item in rows" v-show="visibleIDs.has(item.id)" :key="item.id" class="panel departure-row"><div class="departure-copy"><span class="eyebrow">{{ kind(item.type) }} · {{ watchLabel(item.watch) }}</span><h3>{{ item.title }}</h3><p>Retrait prévu le <time :datetime="item.estimatedAt">{{ date(item.estimatedAt) }}</time></p><p v-if="item.type === 'season' || item.type === 'show'" class="muted">L’état de l’ensemble reste à vérifier tant que tous ses épisodes ne sont pas confirmés.</p></div><a :href="item.url" target="_blank" rel="noopener noreferrer" class="button secondary">Voir dans Plex <HubIcon name="external" /></a><ExtensionRequestForm v-if="!compact && capabilities?.extensionRequests" :key="item.estimatedAt" :media-id="item.id" :disabled="loading || !visibleIDs.has(item.id)" /></article></div>
        <EmptyState v-if="!visible.length" icon="bell" :title="data.items.length && !compact ? 'Aucun départ avec ces filtres' : 'Aucun retrait dans votre sélection'" :text="data.items.length && !compact ? 'Modifiez vos filtres ou réinitialisez-les pour retrouver les autres contenus.' : 'Aucun retrait prévu sous 30 jours pour vos demandes, suivis ou lectures commencées. Cette sélection personnelle ne représente pas tous les retraits du serveur.'" />
        <NuxtLink v-if="!visible.length && !data.items.length && !compact && capabilities?.notifications" to="/compte#rappels" class="button secondary empty-settings">Inclure mes contenus non vus <HubIcon name="arrow" /></NuxtLink>
        <p class="departure-freshness muted">Sources vérifiées le {{ date(data.updatedAt) }} à {{ time(data.updatedAt) }} · échéances estimées, susceptibles de changer.</p>
        <NuxtLink v-if="compact" to="/retraits" class="button secondary">Voir les retraits prévus <HubIcon name="arrow" /></NuxtLink>
      </div>
    </template>
  </div>
</template>
<style scoped>
.empty-settings{margin-top:16px}.departure-field{display:grid;gap:8px;min-width:0}.departure-field select{font-size:12px}
.departure-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.departure-toolbar p,.departure-toggle,.departure-freshness,.departure-count{font-size:12px}.departure-filters{display:flex;flex-wrap:wrap;align-items:end;gap:16px;margin-bottom:20px}.departure-filters label{display:grid;gap:8px;font-size:12px;min-width:0}.departure-filters input[type=search],.departure-filters select{box-sizing:border-box;width:100%;max-width:100%;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);font:inherit}.departure-filters :focus-visible{outline:3px solid var(--signal);outline-offset:4px}.departure-filters .departure-toggle{display:flex;align-items:center;gap:10px;color:var(--muted);min-height:38px}.departure-toggle input{accent-color:var(--accent);width:18px;height:18px}.departure-list{display:grid;gap:12px}.departure-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px}.departure-copy{min-width:0;flex:1}.departure-copy h3{overflow-wrap:anywhere;font-size:18px;margin-bottom:10px}.departure-copy p{font-size:12px}.departure-copy .eyebrow{line-height:1.6}.departure-row .button{flex-shrink:0}.departure-freshness{margin:18px 0;line-height:1.7}@media(max-width:700px){.departure-row{align-items:flex-start;flex-direction:column;gap:16px}.departure-toolbar p{font-size:11px}.departure-copy h3{font-size:17px}.departure-filters{display:grid;grid-template-columns:1fr}.departure-filters .button{justify-self:start}}
</style>
