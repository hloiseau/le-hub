<script setup lang="ts">
import type { Subscriptions, SubscriptionResult, ReminderPreferences } from '~/types/api'

const { session, ready, capabilities, services, demo, refresh } = useHub()
const enabled = computed(() => !demo.value && capabilities.value?.subscriptions === true)
const seerr = computed(() => services.value.find(service => service.id === 'seerr')?.url)
const data = ref<Subscriptions>({ items: [], total: 0, offset: 0, limit: 10 })
const loading = ref(false)
const saving = ref(false)
const removing = ref<number | null>(null)
const changing = ref<number | null>(null)
const preferences = ref<ReminderPreferences | null>(null)
const preferencesFailed = ref(false)
const channel = ref<'hub' | 'discord'>('hub')
const inboxRevision = ref(0)
const discordReady = computed(() => capabilities.value?.discordDMs === true && Boolean(session.value.user?.discordId) && preferences.value?.enabled === true && preferences.value?.discordDmEnabled === true)
const busy = computed(() => saving.value || removing.value !== null || changing.value !== null)
const error = ref('')
const feedback = ref('')
const alreadyAvailableURL = ref('')
const kind = ref<'movie' | 'tv'>('movie')
const tmdbID = ref('')
const season = ref('')
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
  if (!ready.value || !session.value.user || !session.value.plexConnected || !enabled.value) return
  loading.value = true
  try {
    const [result, prefs] = await Promise.all([
      $fetch<Subscriptions>('/api/v1/subscriptions', { query: { offset }, retry: 0 }),
      capabilities.value?.subscriptionNotifications ? $fetch<ReminderPreferences>('/api/v1/reminders/preferences', { retry: 0 }).catch(() => null) : null,
    ])
    if (current === revision) {
      data.value = result; preferences.value = prefs
      preferencesFailed.value = capabilities.value?.subscriptionNotifications === true && prefs === null
      if (!discordReady.value) channel.value = 'hub'
    }
  } catch (value) { if (current === revision) await handleError(value) }
  finally { if (current === revision) loading.value = false }
}
async function follow() {
  error.value = ''; feedback.value = ''; alreadyAvailableURL.value = ''
  const id = Number(tmdbID.value)
  const number = season.value === '' ? undefined : Number(season.value)
  if (!Number.isInteger(id) || id < 1 || id > 2147483647 || (kind.value === 'tv' && number !== undefined && (!Number.isInteger(number) || number < 0 || number > 10000))) {
    error.value = 'Indiquez un identifiant TMDB entier positif et, si nécessaire, une saison entre 0 et 10 000.'
    return
  }
  if (busy.value || !enabled.value) return
  const current = ++actionRevision
  saving.value = true
  try {
    const result = await $fetch<SubscriptionResult>('/api/v1/subscriptions', { method: 'POST', retry: 0, body: { type: kind.value, tmdbId: id, ...(kind.value === 'tv' && number !== undefined ? { season: number } : {}), channel: channel.value } })
    if (current !== actionRevision) return
    if (result.status === 'already_available') {
      feedback.value = `${result.title} est déjà disponible pour vous. Aucun nouveau suivi n’a été créé.`
      alreadyAvailableURL.value = safePlexURL(result.url)
    } else { feedback.value = `Vous suivez ${result.title}. Retrouvez sa disponibilité ici.` }
    tmdbID.value = ''; season.value = ''
    await load()
  } catch (value) { if (current === actionRevision) await handleError(value) }
  finally { if (current === actionRevision) saving.value = false }
}
async function unsubscribe(id: number) {
  if (busy.value) return
  const current = ++actionRevision
  removing.value = id; feedback.value = ''; error.value = ''; alreadyAvailableURL.value = ''
  try {
    await $fetch(`/api/v1/subscriptions/${id}`, { method: 'DELETE', retry: 0 })
    if (current !== actionRevision) return
    feedback.value = 'Vous ne suivez plus ce contenu.'
    inboxRevision.value++
    await load(data.value.items.length === 1 ? Math.max(0, data.value.offset - 10) : data.value.offset)
  } catch (value) { if (current === actionRevision) await handleError(value) }
  finally { if (current === actionRevision) removing.value = null }
}
async function changeChannel(id: number, event: Event) {
  const selected = (event.target as HTMLSelectElement).value
  if (busy.value || (selected !== 'hub' && selected !== 'discord')) return
  const current = ++actionRevision
  changing.value = id; feedback.value = ''; error.value = ''; alreadyAvailableURL.value = ''
  try {
    await $fetch(`/api/v1/subscriptions/${id}`, { method: 'PATCH', retry: 0, body: { channel: selected } })
    if (current !== actionRevision) return
    feedback.value = selected === 'discord' ? 'Ce suivi pourra aussi vous prévenir en message privé Discord.' : 'Ce suivi vous préviendra uniquement dans Le Hub.'
    await load(data.value.offset)
  } catch (value) { if (current === actionRevision) await handleError(value) }
  finally { if (current === actionRevision) changing.value = null }
}
watch(kind, () => { season.value = '' })
watch([ready, enabled, () => session.value.user?.plexId, () => session.value.plexConnected], () => {
  actionRevision++; saving.value = false; removing.value = null; changing.value = null; preferences.value = null; channel.value = 'hub'; feedback.value = ''; alreadyAvailableURL.value = ''
  void load()
}, { immediate: true })
onBeforeUnmount(() => { revision++; actionRevision++ })
</script>

<template>
  <div>
  <section class="page-heading"><p class="eyebrow">UNE ENVIE EN COMMUN</p><h1>Mes suivis<span>.</span></h1><p class="lede">Retrouvez la disponibilité d’un film ou d’une série déjà demandé par un autre membre.</p></section>
  <EmptyState v-if="!enabled" icon="bell" title="Les suivis arrivent bientôt" text="Les suivis seront disponibles dès que les connexions Plex et Seerr seront configurées." />
  <template v-else>
    <section class="panel follow-panel" aria-labelledby="follow-heading">
      <div class="section-heading"><h2 id="follow-heading">Suivre un contenu</h2><a v-if="seerr" :href="seerr" target="_blank" rel="noopener noreferrer" class="button secondary">Ouvrir Seerr <HubIcon name="external" /></a></div>
      <p id="follow-help" class="muted">Depuis Seerr, recopiez le numéro à la fin de l’adresse du film ou de la série. Le contenu doit avoir une demande en attente ou approuvée.</p>
      <form class="follow-form" @submit.prevent="follow">
        <label>Type de contenu<select v-model="kind" :disabled="saving"><option value="movie">Film</option><option value="tv">Série</option></select></label>
        <label>Identifiant TMDB<input v-model="tmdbID" type="number" min="1" max="2147483647" step="1" required inputmode="numeric" aria-describedby="follow-help" :disabled="saving" /></label>
        <label v-if="kind === 'tv'">Saison (facultatif)<input v-model="season" type="number" min="0" max="10000" step="1" inputmode="numeric" placeholder="Toute la série" :disabled="saving" /></label>
        <label v-if="capabilities?.subscriptionNotifications">Me prévenir<select v-model="channel" :disabled="busy"><option value="hub">Dans Le Hub</option><option value="discord" :disabled="!discordReady">Hub et message privé Discord</option></select></label>
        <button class="button primary" type="submit" :disabled="busy">{{ saving ? 'Vérification…' : 'Suivre ce contenu' }}</button>
      </form>
      <p v-if="capabilities?.subscriptionNotifications" class="footnote">{{ preferencesFailed ? 'Vos préférences sont temporairement indisponibles. Actualisez vos suivis pour réessayer.' : !preferences?.enabled ? 'Activez les notifications dans votre compte pour être prévenu de la disponibilité.' : !discordReady ? 'Pour choisir Discord, liez votre compte et activez les messages privés dans vos préférences.' : 'Vos heures calmes et votre plafond quotidien s’appliquent à tous les canaux.' }} <NuxtLink to="/compte#rappels">Régler mes notifications</NuxtLink></p>
      <p class="footnote">Pour une série ou une saison, « disponible » signifie qu’au moins un épisode vous est accessible. Les demandes que vous avez faites vous-même restent prises en charge par Seerr.</p>
    </section>
    <div v-if="feedback" class="banner follow-feedback" role="status">{{ feedback }}<a v-if="alreadyAvailableURL" :href="alreadyAvailableURL" target="_blank" rel="noopener noreferrer" class="button secondary">Ouvrir dans Plex <HubIcon name="external" /></a></div>
    <div v-if="error" class="banner error-banner" role="alert">{{ error }}<button @click="load(data.offset)">Réessayer les suivis</button></div>
    <section class="section-block" aria-labelledby="subscriptions-heading">
      <div class="section-heading"><h2 id="subscriptions-heading">Les contenus que je suis</h2><button class="button secondary" :disabled="loading || busy" @click="load(data.offset)">Actualiser mes suivis</button></div>
      <p v-if="loading" class="loading" role="status">Vérification de vos suivis…</p>
      <div v-else-if="!error && data.items.length" class="subscription-list">
        <article v-for="item in data.items" :key="item.id" class="panel subscription-row">
          <div class="subscription-info"><p class="eyebrow">{{ item.type === 'movie' ? 'Film' : 'Série' }}<span v-if="item.season !== undefined"> · Saison {{ item.season }}</span></p><h3>{{ item.title }}</h3><span class="status-badge" :class="item.status === 'available' ? 'available' : item.status === 'unavailable' ? 'declined' : 'pending'">{{ item.status === 'available' ? 'Disponible pour vous' : item.status === 'unavailable' ? 'Accès indisponible' : 'En attente de disponibilité' }}</span></div>
          <div class="subscription-actions"><label v-if="capabilities?.subscriptionNotifications" class="channel-choice"><span>Notifications</span><select :value="item.channel" :disabled="busy" :aria-label="`Canal pour ${item.title}`" @change="changeChannel(item.id, $event)"><option value="hub">Dans Le Hub</option><option value="discord" :disabled="!discordReady">Hub et Discord{{ !discordReady && item.channel === 'discord' ? ' (en pause)' : '' }}</option></select></label><a v-if="item.status === 'available' && safePlexURL(item.url)" :href="safePlexURL(item.url)" target="_blank" rel="noopener noreferrer" class="button secondary">Ouvrir dans Plex <HubIcon name="external" /></a><button class="button secondary" :disabled="busy" :aria-label="`Ne plus suivre ${item.title}`" @click="unsubscribe(item.id)">{{ removing === item.id ? 'Désabonnement…' : 'Ne plus suivre' }}</button></div>
        </article>
      </div>
      <EmptyState v-else-if="!error" icon="bell" title="Aucun suivi à afficher" text="Ajoutez un film, une série ou une saison ci-dessus pour retrouver sa disponibilité." />
      <div v-if="data.total > 10 && !error && !loading" class="pagination"><button class="button secondary" :disabled="data.offset === 0" @click="load(Math.max(0, data.offset - data.limit))">Précédent</button><span>Page {{ Math.floor(data.offset / data.limit) + 1 }} sur {{ Math.ceil(data.total / data.limit) }}</span><button class="button secondary" :disabled="data.offset + data.limit >= data.total" @click="load(data.offset + data.limit)">Suivant</button></div>
      <p class="footnote">La disponibilité est vérifiée automatiquement tant que votre session Plex est active, ainsi qu’à l’actualisation. Vous pouvez conserver jusqu’à 100 suivis et vous désabonner à tout moment.</p>
    </section>
    <AvailabilityInbox :revision="inboxRevision" />
  </template>
  </div>
</template>

<style scoped>
.follow-panel>p{font-size:12px;line-height:1.7}.follow-form{display:flex;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-top:22px}.follow-form label{display:grid;gap:9px;font-size:12px;flex:1;min-width:150px}.follow-form input,.follow-form select{width:100%;max-width:none;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:12px;font-size:13px;min-height:44px}.follow-form .button{min-height:44px}.follow-feedback{background:#1e3933;color:#bbefdd;margin-top:20px;overflow-wrap:anywhere}.subscription-list{display:grid;gap:12px}.subscription-row{display:flex;align-items:center;justify-content:space-between;gap:20px}.subscription-info{min-width:0}.subscription-info h3{overflow-wrap:anywhere;margin-bottom:14px;line-height:1.5}.subscription-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.subscription-row .status-badge{display:inline-block}.subscription-info .eyebrow{margin-bottom:9px}@media(max-width:700px){.follow-form{align-items:stretch;flex-direction:column}.subscription-row{align-items:flex-start;flex-direction:column}.subscription-actions{justify-content:flex-start}.section-heading{align-items:flex-start}.follow-form label{min-width:0}.follow-panel{padding:20px}.subscription-actions .button{white-space:normal}}
</style>

<style scoped>
.channel-choice{display:grid;gap:7px;font-size:11px;max-width:100%}.channel-choice select{min-height:42px;max-width:100%;padding:9px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;font:inherit}.subscription-actions{align-items:flex-end}.footnote a{text-decoration:underline}
</style>
