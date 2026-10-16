<script setup lang="ts">
import type { Departures } from '~/types/api'
const props = defineProps<{ compact?: boolean }>()
const { session, ready, capabilities, demo, refresh } = useHub()
const data = ref<Departures | null>(null)
const loading = ref(false)
const message = ref('')
const showCompleted = ref(false)
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
const enabled = computed(() => !demo.value && capabilities.value?.departures === true)
const filtered = computed(() => (data.value?.items || []).filter(item => showCompleted.value || item.watch !== 'completed'))
const visible = computed(() => props.compact ? filtered.value.slice(0, 3) : filtered.value)
const kind = (value: string) => ({ movie: 'Film', episode: 'Épisode', season: 'Saison', show: 'Série' }[value] || 'Contenu')
const watchLabel = (value: string) => ({ in_progress: 'Lecture commencée', completed: 'Marqué comme terminé', unknown: 'Visionnage incertain' }[value] || 'Visionnage incertain')
const date = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' }).format(new Date(value))
const time = (value: string) => new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(value))
async function load() {
  const current = ++revision
  clearTimeout(timer)
  data.value = null; message.value = ''; loading.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected || !enabled.value) return
  loading.value = true
  try {
    const page = await $fetch<Departures>('/api/v1/departures', { retry: 0 })
    if (current !== revision) return
    const remaining = Date.parse(page.expiresAt) - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('expired source')
    data.value = page
    timer = setTimeout(() => { data.value = null; if (document.visibilityState === 'visible') void load() }, Math.min(remaining, 60_000))
  } catch (error) {
    if (current !== revision) return
    message.value = apiMessage(error)
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401 || status === 403) await refresh()
  } finally { if (current === revision) loading.value = false }
}
function visibleAgain() { if (document.visibilityState === 'visible') void load() }
watch([ready, enabled, () => session.value.user?.plexId, () => session.value.plexConnected], load, { immediate: true })
onMounted(() => document.addEventListener('visibilitychange', visibleAgain))
onBeforeUnmount(() => { revision++; clearTimeout(timer); document.removeEventListener('visibilitychange', visibleAgain) })
</script>
<template>
  <div class="departures">
    <p v-if="!enabled" class="inline-notice">Cette intégration n’est pas encore active. Les sources doivent être configurées avant d’afficher vos départs.</p>
    <template v-else>
      <div class="departure-toolbar"><p class="muted">Vos lectures enregistrées · les 30 prochains jours</p><button class="button secondary compact" :disabled="loading" @click="load">Actualiser</button></div>
      <label v-if="!compact" class="departure-toggle"><input v-model="showCompleted" type="checkbox" /> Inclure les contenus terminés</label>
      <p v-if="loading" class="loading" role="status">Vérification de vos accès et des départs…</p>
      <div v-else-if="message" class="banner error-banner" role="alert">{{ message }}<button @click="load">Réessayer</button></div>
      <template v-else-if="data">
        <div v-if="visible.length" class="departure-list"><article v-for="item in visible" :key="item.id" class="panel departure-row"><div class="departure-copy"><span class="eyebrow">{{ kind(item.type) }} · {{ watchLabel(item.watch) }}</span><h3>{{ item.title }}</h3><p>Départ estimé le <time :datetime="item.estimatedAt">{{ date(item.estimatedAt) }}</time></p><p v-if="item.type === 'season' || item.type === 'show'" class="muted">Une lecture d’épisode est connue ; l’état de l’ensemble reste à vérifier.</p></div><a :href="item.url" target="_blank" rel="noopener noreferrer" class="button secondary">Voir dans Plex <HubIcon name="external" /></a><ExtensionRequestForm v-if="!compact && capabilities?.extensionRequests" :media-id="item.id" /></article></div>
        <EmptyState v-else icon="bell" title="Aucun départ à reprendre confirmé" text="Parmi vos lectures enregistrées et accessibles, aucun autre départ n’est confirmé dans les 30 prochains jours." />
        <p class="departure-freshness muted">Sources vérifiées le {{ date(data.updatedAt) }} à {{ time(data.updatedAt) }} · échéances estimées, susceptibles de changer.</p>
        <NuxtLink v-if="compact" to="/avant-le-depart" class="button secondary">Voir mes départs <HubIcon name="arrow" /></NuxtLink>
      </template>
    </template>
  </div>
</template>
<style scoped>
.departure-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.departure-toolbar p,.departure-toggle,.departure-freshness{font-size:12px}.departure-toggle{display:flex;align-items:center;gap:10px;margin-bottom:18px;color:var(--muted)}input{accent-color:var(--purple);width:18px;height:18px}.departure-list{display:grid;gap:12px}.departure-row{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px}.departure-copy{min-width:0;flex:1}.departure-copy h3{overflow-wrap:anywhere;font-size:18px;margin-bottom:10px}.departure-copy p{font-size:12px}.departure-copy .eyebrow{line-height:1.6}.departure-row .button{flex-shrink:0}.departure-freshness{margin:18px 0;line-height:1.7}@media(max-width:700px){.departure-row{align-items:flex-start;flex-direction:column;gap:16px}.departure-toolbar p{font-size:11px}.departure-copy h3{font-size:17px}}
</style>
