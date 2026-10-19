<script setup lang="ts">
import { statusLabels } from '~/types/api'
import type { RequestPage, RequestStatus, ReminderPreferences } from '~/types/api'
const { ready, session, demo, services, capabilities, refresh } = useHub()
const enabled = computed(() => demo.value || capabilities.value?.requests === true)
const preferences = ref<ReminderPreferences | null>(null)
const page = ref<RequestPage>({ items: [], total: 0, offset: 0, limit: 10 })
const loading = ref(false)
const error = ref('')
const status = ref<RequestStatus | 'all'>('all')
let revision = 0
async function load(offset = 0) {
  const current = ++revision; error.value = ''; page.value = { items: [], total: 0, offset, limit: 10 }; loading.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected || !enabled.value) return
  loading.value = true
  try {
    let result: RequestPage
    if (demo.value) {
      const items = demoRequests.items.filter(item => status.value === 'all' || item.status === status.value)
      result = { items: items.slice(offset, offset + 10), total: items.length, offset, limit: 10 }
    } else {
      result = await $fetch<RequestPage>('/api/v1/requests', { query: { offset, ...(status.value === 'all' ? {} : { status: status.value }) }, retry: 0 })
    }
    if (current !== revision) return
    if (offset > 0 && result.items.length === 0 && result.total <= offset) { await load(); return }
    page.value = result
  }
  catch (e) {
    if (current !== revision) return
    error.value = apiMessage(e)
    const code = (e as { statusCode?: number }).statusCode
    if (code === 401 || code === 403) await refresh()
  }
  finally { if (current === revision) loading.value = false }
}
watch([ready, enabled, status, () => session.value.user?.plexId, () => session.value.plexConnected], () => load(), { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { revision++ })
const seerr = computed(() => services.value.find(s => s.id === 'seerr')?.url)
</script>
<template>
  <div>
  <section class="page-heading"><h1>Mes demandes<span>.</span></h1><p class="lede">État des demandes de films et séries dans Seerr.</p></section>
  <p class="muted requests-intro">Vos demandes Seerr sont retrouvées automatiquement avec votre compte Plex. <NuxtLink v-if="!demo && (capabilities?.notifications || capabilities?.discordChannelReminders)" to="/demandes#rappels" class="text-button">Régler mes notifications <HubIcon name="arrow" /></NuxtLink></p>
  <div v-if="enabled" class="section-heading requests-actions"><label class="select-label">Afficher <select v-model="status"><option value="all">Tous les états</option><option v-for="(label, value) in statusLabels" :key="value" :value="value">{{ label }}</option></select></label><div class="requests-buttons"><button class="button secondary" :disabled="loading" @click="load(page.offset)">Actualiser mes demandes</button><a v-if="seerr" :href="seerr" target="_blank" rel="noopener noreferrer" class="button primary">Demander sur Seerr <HubIcon name="external" /></a></div></div>
  <EmptyState v-if="!session.user || !session.plexConnected" icon="requests" title="Vos demandes, rien qu’à vous" text="Connectez-vous avec Plex. Votre compte Seerr sera retrouvé automatiquement grâce à votre identité Plex."><NuxtLink to="/compte" class="button primary">Mon compte <HubIcon name="arrow" /></NuxtLink></EmptyState>
  <EmptyState v-else-if="!enabled" icon="requests" title="Les demandes ne sont pas encore disponibles" text="Vos demandes apparaîtront ici dès que Seerr sera configuré." />
  <p v-else-if="loading" class="loading" role="status">Récupération de vos demandes…</p>
  <div v-else-if="error" class="banner error-banner" role="alert">{{ error }}<button @click="load(page.offset)">Réessayer</button><NuxtLink to="/compte">Mon compte</NuxtLink></div>
  <RequestList v-else-if="page.items.length" :items="page.items" :seerr-url="seerr" />
  <EmptyState v-else icon="requests" title="Aucune demande à afficher" text="Aucune demande ne correspond à la sélection. Modifiez le filtre ou créez une demande dans Seerr." />
  <div v-if="page.total > 10 && !error" class="pagination"><button class="button secondary" :disabled="page.offset === 0 || loading" @click="load(Math.max(0, page.offset - page.limit))">Précédent</button><span>{{ page.offset + 1 }}–{{ Math.min(page.offset + page.limit, page.total) }} sur {{ page.total }}</span><button class="button secondary" :disabled="page.offset + page.limit >= page.total || loading" @click="load(page.offset + page.limit)">Suivant</button></div>
  <p v-if="enabled" class="footnote">Un téléchargement à 100 % peut encore attendre son import. Les états et les saisons proviennent de Seerr.</p>
  <ReminderPreferences v-if="!demo && (capabilities?.notifications || capabilities?.discordChannelReminders)" class="section-block" @change="preferences = $event" />
  <AddedSubscriptions v-if="!demo && capabilities?.subscriptions" :preferences="preferences" />
  </div>
</template>
<style scoped>
.requests-intro{font-size:13px;line-height:1.7;margin-bottom:20px}.requests-actions{gap:16px;flex-wrap:wrap}.requests-buttons{display:flex;gap:12px;flex-wrap:wrap}.select-label{max-width:100%}.select-label select{min-width:0;max-width:100%}
</style>
