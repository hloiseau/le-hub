<script setup lang="ts">
import type { ReminderInbox } from '~/types/api'
const { session, ready, capabilities, demo, refresh } = useHub()
const data = ref<ReminderInbox | null>(null)
const loading = ref(false)
const message = ref('')
const enabled = computed(() => !demo.value && capabilities.value?.notifications === true)
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
const date = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' }).format(new Date(value))
async function load() {
  const current = ++revision
  clearTimeout(timer)
  data.value = null; message.value = ''; loading.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected || !enabled.value) return
  loading.value = true
  try {
    const page = await $fetch<ReminderInbox>('/api/v1/reminders', { retry: 0 })
    if (current !== revision) return
    const remaining = Date.parse(page.expiresAt) - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('expired reminders')
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
  <section v-if="enabled" class="section-block reminder-inbox" aria-labelledby="reminders-heading">
    <div class="section-heading"><div><span class="eyebrow">VOS LECTURES À REPRENDRE</span><h2 id="reminders-heading">Mes rappels</h2></div><button class="button secondary compact" :disabled="loading" @click="load">Actualiser mes rappels</button></div>
    <p class="muted reminder-intro">Vos rappels sont regroupés ici, au maximum une fois par jour. Les messages privés Discord sont facultatifs et se règlent dans votre compte.</p>
    <p v-if="loading" role="status" class="loading">Vérification de vos rappels…</p>
    <div v-else-if="message" class="banner error-banner" role="alert">{{ message }}<button @click="load">Réessayer les rappels</button></div>
    <template v-else-if="data">
      <div v-if="data.items.length" class="reminder-list"><article v-for="item in data.items" :key="item.id" class="panel reminder-row"><div><span class="eyebrow">{{ item.type === 'movie' ? 'Film' : 'Épisode' }} · Lecture commencée</span><h3>{{ item.title }}</h3><p>Départ estimé le <time :datetime="item.estimatedAt">{{ date(item.estimatedAt) }}</time></p><p class="muted">Rappel du {{ date(item.sentAt) }} · échéance estimée, susceptible de changer.</p></div><a :href="item.url" target="_blank" rel="noopener noreferrer" class="button secondary">Reprendre dans Plex <HubIcon name="external" /></a></article></div>
      <EmptyState v-else icon="bell" title="Aucun rappel disponible" text="Les rappels concernent uniquement vos films et épisodes commencés, encore accessibles et dont le départ est confirmé." />
      <p class="muted reminder-freshness">Rappels vérifiés le {{ date(data.updatedAt) }}. Un contenu terminé ou retiré de vos accès disparaît à l’actualisation.</p>
    </template>
    <NuxtLink to="/compte#rappels" class="button secondary">Régler mes rappels <HubIcon name="arrow" /></NuxtLink>
  </section>
</template>
<style scoped>
.reminder-intro,.reminder-freshness{font-size:12px;line-height:1.7;margin:16px 0}.reminder-list{display:grid;gap:12px}.reminder-row{display:flex;align-items:center;justify-content:space-between;gap:24px}.reminder-row>div{min-width:0}.reminder-row h3{overflow-wrap:anywhere;font-size:18px;margin:10px 0}.reminder-row p{font-size:12px;line-height:1.7}.reminder-row .button{flex-shrink:0}@media(max-width:700px){.reminder-row{align-items:flex-start;flex-direction:column}.section-heading{align-items:flex-start;gap:16px;flex-wrap:wrap}}
</style>
