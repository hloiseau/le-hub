<script setup lang="ts">
import type { AvailabilityInbox } from '~/types/api'
const props = defineProps<{ revision: number }>()
const { session, ready, capabilities, demo, refresh } = useHub()
const data = ref<AvailabilityInbox | null>(null)
const loading = ref(false)
const message = ref('')
const enabled = computed(() => !demo.value && capabilities.value?.subscriptionNotifications === true)
let generation = 0
let timer: ReturnType<typeof setTimeout> | undefined
const date = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' }).format(new Date(value))
function safePlexURL(value: string) {
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'app.plex.tv' && !url.username && !url.password ? value : '' } catch { return '' }
}
async function load() {
  const current = ++generation
  clearTimeout(timer)
  data.value = null; message.value = ''; loading.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected || !enabled.value) return
  loading.value = true
  try {
    const result = await $fetch<AvailabilityInbox>('/api/v1/subscriptions/notifications', { retry: 0 })
    if (current !== generation) return
    const remaining = Date.parse(result.expiresAt) - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('expired availability')
    data.value = result
    timer = setTimeout(() => { data.value = null; if (document.visibilityState === 'visible') void load() }, Math.min(remaining, 60_000))
  } catch (error) {
    if (current !== generation) return
    message.value = apiMessage(error)
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401 || status === 403) await refresh()
  } finally { if (current === generation) loading.value = false }
}
function visibleAgain() { if (document.visibilityState === 'visible') void load() }
watch([ready, enabled, () => session.value.user?.plexId, () => session.value.plexConnected, () => props.revision], load, { immediate: true })
onMounted(() => document.addEventListener('visibilitychange', visibleAgain))
onBeforeUnmount(() => { generation++; clearTimeout(timer); document.removeEventListener('visibilitychange', visibleAgain) })
</script>

<template>
  <section v-if="enabled" class="section-block availability-inbox" aria-labelledby="availability-heading">
    <div class="section-heading"><div><span class="eyebrow">VOS ENVIES SONT ARRIVÉES</span><h2 id="availability-heading">Mes disponibilités</h2></div><button class="button secondary" :disabled="loading" @click="load">Actualiser les disponibilités</button></div>
    <p class="muted availability-note">Un récapitulatif par jour, selon vos heures calmes et le plafond partagé avec vos rappels avant départ. Discord reste facultatif, au choix pour chaque suivi.</p>
    <p v-if="loading" role="status" class="loading">Vérification de vos disponibilités…</p>
    <div v-else-if="message" class="banner error-banner" role="alert">{{ message }}<button @click="load">Réessayer les disponibilités</button></div>
    <template v-else-if="data">
      <div v-if="data.items.length" class="availability-list"><article v-for="item in data.items" :key="item.subscriptionId" class="panel availability-row"><div><span class="eyebrow">{{ item.type === 'movie' ? 'Film' : 'Série' }}<span v-if="item.season !== undefined"> · Saison {{ item.season }}</span></span><h3>{{ item.title }}</h3><p>Disponible pour vous · notification du <time :datetime="item.deliveredAt">{{ date(item.deliveredAt) }}</time></p></div><a v-if="safePlexURL(item.url)" :href="safePlexURL(item.url)" target="_blank" rel="noopener noreferrer" class="button secondary">Ouvrir dans Plex <HubIcon name="external" /></a></article></div>
      <EmptyState v-else icon="bell" title="Aucune nouvelle disponibilité" text="Les notifications activées apparaîtront ici quand un contenu suivi sera accessible dans votre Plex. Vos propres demandes sont prises en charge par Seerr." />
      <p class="muted availability-note">Les 20 notifications les plus récentes sont conservées jusqu’à 90 jours. Chaque affichage vérifie vos accès actuels.</p>
    </template>
    <NuxtLink to="/compte#rappels" class="button secondary">Régler mes notifications <HubIcon name="arrow" /></NuxtLink>
  </section>
</template>

<style scoped>
.availability-note{font-size:12px;line-height:1.7;margin:16px 0}.availability-list{display:grid;gap:12px}.availability-row{display:flex;align-items:center;justify-content:space-between;gap:24px}.availability-row>div{min-width:0}.availability-row h3{overflow-wrap:anywhere;font-size:18px;margin:10px 0}.availability-row p{font-size:12px;line-height:1.7}.availability-row .button{flex-shrink:0}@media(max-width:700px){.availability-row{align-items:flex-start;flex-direction:column}.section-heading{align-items:flex-start;gap:16px;flex-wrap:wrap}}
</style>
