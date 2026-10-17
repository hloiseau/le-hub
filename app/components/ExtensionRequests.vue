<script setup lang="ts">
import type { ExtensionRequest, ExtensionRequests } from '~/types/api'
const props = defineProps<{ admin?: boolean }>()
const { session, ready, capabilities, demo, refresh } = useHub()
const changes = useState('extension-requests-revision', () => 0)
const items = ref<ExtensionRequest[]>([])
const notes = ref<Record<number, string>>({})
const loading = ref(false)
const busy = ref<number | null>(null)
const error = ref('')
const success = ref('')
const enabled = computed(() => !demo.value && capabilities.value?.extensionRequests === true && (!props.admin || session.value.admin === true))
const endpoint = computed(() => props.admin ? '/api/v1/admin/extension-requests' : '/api/v1/extension-requests')
const heading = computed(() => props.admin ? 'Demandes à examiner' : 'Mes demandes de délai')
const headingID = computed(() => props.admin ? 'extension-admin-heading' : 'extension-heading')
const status = (value: ExtensionRequest['status']) => ({ pending: 'En attente', reviewed: 'Examinée', declined: 'Refusée' }[value])
const date = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' }).format(new Date(value))
let revision = 0
async function load() {
  const current = ++revision
  items.value = []; notes.value = {}; error.value = ''; loading.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected || !enabled.value) return
  loading.value = true
  try {
    const result = await $fetch<ExtensionRequests>(endpoint.value, { retry: 0 })
    if (current === revision) items.value = result.items
  } catch (e) {
    if (current !== revision) return
    error.value = apiMessage(e)
    if ([401, 403].includes((e as { statusCode?: number }).statusCode || 0)) await refresh()
  } finally { if (current === revision) loading.value = false }
}
async function review(item: ExtensionRequest, decision: 'reviewed' | 'declined') {
  if (busy.value !== null || !props.admin || !session.value.admin) return
  const note = notes.value[item.id] || ''
  if ([...note].length > 500) { error.value = 'La réponse est limitée à 500 caractères.'; return }
  const current = revision
  busy.value = item.id; error.value = ''; success.value = ''
  try {
    await $fetch(endpoint.value, { method: 'PUT', retry: 0, body: { id: item.id, status: decision, note: note.trim() } })
    if (current !== revision) return
    success.value = 'Réponse enregistrée. Aucune date de retrait n’a été modifiée.'
    changes.value++
  } catch (e) {
    if (current !== revision) return
    error.value = apiMessage(e)
    if ([401, 403].includes((e as { statusCode?: number }).statusCode || 0)) { items.value = []; notes.value = {}; await refresh() }
  } finally { busy.value = null }
}
watch([ready, enabled, () => session.value.user?.plexId, () => session.value.plexConnected, changes], load, { immediate: true })
watch(() => session.value.user?.plexId, () => { success.value = '' })
onBeforeUnmount(() => { revision++ })
</script>
<template>
  <section v-if="enabled" class="section-block extension-requests" :aria-labelledby="headingID">
    <div class="section-heading"><h2 :id="headingID">{{ heading }}</h2><button class="button secondary compact" :disabled="loading || busy !== null" @click="load">{{ admin ? 'Actualiser la file' : 'Actualiser mes demandes de délai' }}</button></div>
    <p class="muted extension-intro">{{ admin ? 'Les 100 plus anciennes demandes en attente. Une réponse ne modifie pas Maintainerr : toute conservation reste une action séparée.' : 'Un examen ne garantit pas la conservation du contenu. La date de départ reste estimative.' }}</p>
    <p v-if="loading" role="status" class="loading">Chargement des demandes de délai…</p>
    <p v-if="success" role="status" class="inline-notice">{{ success }}</p>
    <div v-if="error" role="alert" class="banner error-banner">{{ error }}<button @click="load">Réessayer les demandes de délai</button></div>
    <div v-if="items.length" class="extension-list">
      <article v-for="item in items" :key="item.id" class="panel extension-row">
        <span class="status-badge" :class="item.status === 'declined' ? 'declined' : 'pending'">{{ status(item.status) }}</span>
        <h3>{{ item.title }}</h3>
        <p v-if="admin && item.requester">Demande de {{ item.requester }}</p>
        <p>{{ item.days }} jour(s) demandé(s) · Départ estimé le {{ date(item.estimatedAt) }}</p>
        <p v-if="item.reason" class="request-reason">{{ item.reason }}</p>
        <p v-if="item.adminNote" class="admin-note"><strong>Réponse :</strong> {{ item.adminNote }}</p>
        <p class="muted">Demandé le {{ date(item.createdAt) }} · Mis à jour le {{ date(item.updatedAt) }}</p>
        <a :href="item.url" target="_blank" rel="noopener noreferrer" class="button secondary compact">Voir le contenu dans Plex <HubIcon name="external" /></a>
        <form v-if="admin" class="review-form" @submit.prevent="review(item, 'reviewed')">
          <label :for="`extension-note-${item.id}`">Réponse au membre (facultative)</label>
          <textarea :id="`extension-note-${item.id}`" v-model="notes[item.id]" maxlength="500" rows="3" :disabled="busy !== null" />
          <div class="review-actions"><button class="button secondary compact" type="submit" :disabled="busy !== null">Marquer examinée</button><button class="button secondary compact" type="button" :disabled="busy !== null" @click="review(item, 'declined')">Refuser la demande</button></div>
        </form>
      </article>
    </div>
    <p v-else-if="!loading && !error" class="inline-notice">{{ admin ? 'Aucune demande en attente.' : 'Vous n’avez pas encore de demande de délai.' }}</p>
  </section>
</template>
<style scoped>
.extension-intro{font-size:12px;line-height:1.7;margin:16px 0}.extension-list{display:grid;gap:14px}.extension-row{min-width:0}.extension-row h3{margin:14px 0;font-size:18px;overflow-wrap:anywhere}.extension-row p{font-size:12px;line-height:1.7;overflow-wrap:anywhere}.request-reason,.admin-note{white-space:pre-wrap}.review-form{display:grid;gap:12px;max-width:600px;margin-top:20px}.review-form label{font-size:13px}.review-form textarea{box-sizing:border-box;max-width:100%;width:100%;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--bg);color:var(--text);font:inherit;resize:vertical}.review-form textarea:focus-visible{outline:3px solid var(--mint);outline-offset:5px}.review-actions{display:flex;flex-wrap:wrap;gap:12px}@media(max-width:700px){.section-heading{align-items:flex-start;gap:16px;flex-wrap:wrap}}
</style>
