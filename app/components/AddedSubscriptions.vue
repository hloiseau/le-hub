<script setup lang="ts">
import type { Subscriptions, ReminderPreferences } from '~/types/api'

const props = defineProps<{ preferences: ReminderPreferences | null }>()
const { session, ready, capabilities, demo, refresh } = useHub()
const data = ref<Subscriptions>({ items: [], total: 0, offset: 0, limit: 10 })
const loading = ref(false)
const removing = ref<number | null>(null)
const changing = ref<number | null>(null)
const inboxRevision = ref(0)
const discordReady = computed(() => capabilities.value?.discordDMs === true && Boolean(session.value.user?.discordId) && props.preferences?.enabled === true && props.preferences?.discordDmEnabled === true)
const busy = computed(() => removing.value !== null || changing.value !== null)
const error = ref('')
const feedback = ref('')
let revision = 0
let actionRevision = 0

function safePlexURL(value?: string) {
  if (!value) return ''
  try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'app.plex.tv' && !url.username && !url.password ? value : '' } catch { return '' }
}
async function handleError(value: unknown) {
  error.value = apiMessage(value)
  data.value = { items: [], total: 0, offset: 0, limit: 10 }
  const status = (value as { statusCode?: number }).statusCode
  if (status === 401 || status === 403) await refresh()
}
async function load(offset = 0) {
  const current = ++revision
  data.value = { items: [], total: 0, offset, limit: 10 }; error.value = ''; loading.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected || !capabilities.value?.subscriptions || demo.value) return
  loading.value = true
  try {
    const result = await $fetch<Subscriptions>('/api/v1/subscriptions', { query: { offset }, retry: 0 })
    if (current === revision) data.value = result
  } catch (value) { if (current === revision) await handleError(value) }
  finally { if (current === revision) loading.value = false }
}
async function unsubscribe(id: number) {
  if (busy.value) return
  const current = ++actionRevision
  removing.value = id; feedback.value = ''; error.value = ''
  try {
    await $fetch(`/api/v1/subscriptions/${id}`, { method: 'DELETE', retry: 0 })
    if (current !== actionRevision) return
    feedback.value = 'Ce suivi ajouté a été retiré. Vos demandes Seerr restent suivies automatiquement.'
    inboxRevision.value++
    await load(data.value.items.length === 1 ? Math.max(0, data.value.offset - 10) : data.value.offset)
  } catch (value) { if (current === actionRevision) await handleError(value) }
  finally { if (current === actionRevision) removing.value = null }
}
async function changeChannel(id: number, event: Event) {
  const selected = (event.target as HTMLSelectElement).value
  if (busy.value || (selected !== 'hub' && selected !== 'discord') || (selected === 'discord' && !discordReady.value)) return
  const current = ++actionRevision
  changing.value = id; feedback.value = ''; error.value = ''
  try {
    await $fetch(`/api/v1/subscriptions/${id}`, { method: 'PATCH', retry: 0, body: { channel: selected } })
    if (current !== actionRevision) return
    feedback.value = selected === 'discord' ? 'Ce suivi pourra aussi vous prévenir en message privé Discord.' : 'Ce suivi vous préviendra uniquement dans Le Hub.'
    await load(data.value.offset)
  } catch (value) { if (current === actionRevision) await handleError(value) }
  finally { if (current === actionRevision) changing.value = null }
}
watch([ready, () => capabilities.value?.subscriptions, () => session.value.user?.plexId, () => session.value.plexConnected], () => {
  actionRevision++; removing.value = null; changing.value = null; feedback.value = ''
  void load()
}, { immediate: true })
onBeforeUnmount(() => { revision++; actionRevision++ })
</script>

<template>
  <div>
    <div v-if="feedback" class="banner follow-feedback" role="status">{{ feedback }}</div>
    <div v-if="error" class="banner error-banner" role="alert">{{ error }}<button @click="load(data.offset)">Réessayer les suivis ajoutés</button></div>
    <section v-if="data.total > 0" class="section-block" aria-labelledby="subscriptions-heading">
      <div class="section-heading"><h2 id="subscriptions-heading">Mes suivis ajoutés</h2><button class="button secondary" :disabled="loading || busy" @click="load(data.offset)">Actualiser les suivis ajoutés</button></div>
      <p class="muted follow-intro">Ces contenus ont été suivis séparément. Les retirer ne modifie pas vos demandes Seerr.</p>
      <div class="subscription-list">
        <article v-for="item in data.items" :key="item.id" class="panel subscription-row">
          <div class="subscription-info"><p class="eyebrow">{{ item.type === 'movie' ? 'Film' : 'Série' }}<span v-if="item.season !== undefined"> · Saison {{ item.season }}</span></p><h3>{{ item.title }}</h3><span class="status-badge" :class="item.status === 'available' ? 'available' : item.status === 'unavailable' ? 'declined' : 'pending'">{{ item.status === 'available' ? 'Disponible pour vous' : item.status === 'unavailable' ? 'Accès indisponible' : 'En attente de disponibilité' }}</span></div>
          <div class="subscription-actions"><label v-if="capabilities?.subscriptionNotifications" class="channel-choice"><span>Notifications</span><select :value="item.channel" :disabled="busy" :aria-label="`Canal pour ${item.title}`" @change="changeChannel(item.id, $event)"><option value="hub">Dans Le Hub</option><option value="discord" :disabled="!discordReady">Hub et Discord{{ !discordReady && item.channel === 'discord' ? ' (en pause)' : '' }}</option></select></label><a v-if="item.status === 'available' && safePlexURL(item.url)" :href="safePlexURL(item.url)" target="_blank" rel="noopener noreferrer" class="button secondary">Ouvrir dans Plex <HubIcon name="external" /></a><button class="button secondary" :disabled="busy" :aria-label="`Ne plus suivre ${item.title}`" @click="unsubscribe(item.id)">{{ removing === item.id ? 'Désabonnement…' : 'Ne plus suivre' }}</button></div>
        </article>
      </div>
      <p v-if="capabilities?.subscriptionNotifications" class="footnote">{{ !preferences ? 'Vérifiez vos préférences ci-dessus pour choisir les messages privés.' : !preferences.enabled ? 'Activez vos notifications ci-dessus pour être prévenu de la disponibilité.' : !discordReady ? 'Pour choisir Discord, liez votre compte et activez les messages privés dans vos préférences.' : 'Vos heures calmes et votre plafond quotidien s’appliquent aux messages privés.' }} <NuxtLink to="/demandes#rappels">Régler mes notifications</NuxtLink></p>
      <div v-if="data.total > data.limit && !error && !loading" class="pagination"><button class="button secondary" :disabled="data.offset === 0" @click="load(Math.max(0, data.offset - data.limit))">Suivis ajoutés précédents</button><span>Page {{ Math.floor(data.offset / data.limit) + 1 }} sur {{ Math.ceil(data.total / data.limit) }}</span><button class="button secondary" :disabled="data.offset + data.limit >= data.total" @click="load(data.offset + data.limit)">Suivis ajoutés suivants</button></div>
    </section>
    <AvailabilityInbox :revision="inboxRevision" />
  </div>
</template>

<style scoped>
.follow-intro{font-size:13px;line-height:1.7;margin-bottom:20px}.follow-feedback{background:#1e3933;color:#bbefdd;margin-top:20px;overflow-wrap:anywhere}.subscription-list{display:grid;gap:12px}.subscription-row{display:flex;align-items:center;justify-content:space-between;gap:20px}.subscription-info{min-width:0}.subscription-info h3{overflow-wrap:anywhere;margin-bottom:14px;line-height:1.5}.subscription-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;align-items:flex-end}.subscription-row .status-badge{display:inline-block}.subscription-info .eyebrow{margin-bottom:9px}.channel-choice{display:grid;gap:7px;font-size:11px;max-width:100%}.channel-choice select{min-height:42px;max-width:100%;padding:9px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;font:inherit}.footnote a{text-decoration:underline}@media(max-width:700px){.subscription-row{align-items:flex-start;flex-direction:column}.subscription-actions{justify-content:flex-start}.section-heading{align-items:flex-start}.subscription-actions .button{white-space:normal}}
</style>
