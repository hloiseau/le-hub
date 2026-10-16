<script setup lang="ts">
import type { ExtensionRequest } from '~/types/api'
const props = defineProps<{ mediaId: string }>()
const { session, refresh } = useHub()
const changes = useState('extension-requests-revision', () => 0)
const open = ref(false)
const days = ref(7)
const reason = ref('')
const busy = ref(false)
const error = ref('')
const saved = ref(false)
let revision = 0
watch(() => session.value.user?.plexId, () => { revision++; open.value = false; saved.value = false; reason.value = ''; error.value = '' })
onBeforeUnmount(() => { revision++ })
async function submit() {
  if (busy.value || !session.value.user || !session.value.plexConnected) return
  error.value = ''
  if (!Number.isInteger(days.value) || days.value < 1 || days.value > 30 || [...reason.value].length > 500) {
    error.value = 'Choisissez un délai de 1 à 30 jours et un motif de 500 caractères maximum.'
    return
  }
  const current = ++revision
  busy.value = true
  try {
    await $fetch<ExtensionRequest>('/api/v1/extension-requests', { method: 'POST', retry: 0, body: { mediaId: props.mediaId, days: days.value, reason: reason.value.trim() } })
    if (current !== revision) return
    saved.value = true; open.value = false; reason.value = ''; changes.value++
  } catch (e) {
    if (current !== revision) return
    error.value = apiMessage(e)
    if ([401, 403].includes((e as { statusCode?: number }).statusCode || 0)) await refresh()
  } finally { if (current === revision) busy.value = false }
}
</script>
<template>
  <div class="extension-form">
    <p v-if="saved" class="inline-notice" role="status">Demande enregistrée pour examen. Le délai et la conservation du contenu ne sont pas garantis.</p>
    <template v-else>
      <button class="button secondary compact" :aria-expanded="open" :disabled="busy" @click="open = !open">{{ open ? 'Fermer la demande' : 'Demander un délai' }}</button>
      <form v-if="open" novalidate @submit.prevent="submit">
        <p class="muted">Votre demande sera examinée par un administrateur. Elle ne modifie pas automatiquement la date de retrait.</p>
        <label :for="`extension-days-${mediaId}`">Délai souhaité en jours</label>
        <input :id="`extension-days-${mediaId}`" v-model.number="days" type="number" min="1" max="30" step="1" :disabled="busy" />
        <label :for="`extension-reason-${mediaId}`">Motif (facultatif)</label>
        <textarea :id="`extension-reason-${mediaId}`" v-model="reason" maxlength="500" rows="3" :disabled="busy" placeholder="Par exemple : terminer cette saison ce week-end." />
        <p class="muted">500 caractères maximum. Votre motif sera visible par les administrateurs.</p>
        <p v-if="error" class="inline-notice error" role="alert">{{ error }}</p>
        <button class="button secondary compact" :disabled="busy" type="submit">{{ busy ? 'Enregistrement…' : 'Envoyer ma demande' }}</button>
      </form>
    </template>
  </div>
</template>
<style scoped>
.extension-form{width:100%}.extension-form form{display:grid;gap:10px;margin-top:16px;max-width:600px}.extension-form p{font-size:12px;line-height:1.7}.extension-form label{font-size:13px}.extension-form input,.extension-form textarea{box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--bg);color:var(--text);font:inherit;max-width:100%}.extension-form textarea:focus-visible{outline:3px solid var(--mint);outline-offset:5px}.extension-form input{width:100px}.extension-form textarea{width:100%;resize:vertical}.extension-form .button{justify-self:start}.error{color:var(--danger,#ff9c9c)}
</style>
