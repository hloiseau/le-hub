<script setup lang="ts">
import type { ExtensionRequest } from '~/types/api'
const props = defineProps<{ mediaId: string, disabled: boolean }>()
const { session, refresh } = useHub()
const changes = useState('extension-requests-revision', () => 0)
const open = ref(false)
const days = ref(7)
const reason = ref('')
const busy = ref(false)
const error = ref('')
const saved = ref<ExtensionRequest['status'] | null>(null)
const savedMessage = computed(() => saved.value && {
  pending: 'Demande enregistrée pour examen. Le délai et la conservation du contenu ne sont pas garantis.',
  reviewed: 'Cette demande a déjà été examinée. Consultez la réponse dans Mes demandes de report ; la conservation du contenu n’est pas garantie.',
  declined: 'Cette demande a été refusée. Consultez la réponse dans Mes demandes de report.',
  cancelled: 'Cette demande a été annulée. Elle n’est plus en attente d’examen.',
  expired: 'L’échéance de cette demande est passée. Cela ne confirme pas la suppression du contenu.',
}[saved.value])
let revision = 0
watch([() => session.value.user?.plexId, () => session.value.plexConnected, () => props.mediaId], () => { revision++; open.value = false; saved.value = null; reason.value = ''; error.value = ''; busy.value = false }, { flush: 'sync' })
watch(changes, () => { saved.value = null }, { flush: 'sync' })
onBeforeUnmount(() => { revision++ })
async function submit() {
  if (busy.value || props.disabled || !session.value.user || !session.value.plexConnected) return
  error.value = ''
  if (!Number.isInteger(days.value) || days.value < 1 || days.value > 30 || [...reason.value].length > 500) {
    error.value = 'Choisissez un délai de 1 à 30 jours et un motif de 500 caractères maximum.'
    return
  }
  const current = ++revision
  busy.value = true
  try {
    const result = await $fetch<ExtensionRequest>('/api/v1/extension-requests', { method: 'POST', retry: 0, body: { mediaId: props.mediaId, days: days.value, reason: reason.value.trim() } })
    if (current !== revision) return
    changes.value++; saved.value = result.status; open.value = false; reason.value = ''
  } catch (e) {
    if (current !== revision) return
    error.value = apiMessage(e)
    if ([401, 403].includes((e as { statusCode?: number }).statusCode || 0)) await refresh()
  } finally { if (current === revision) busy.value = false }
}
</script>
<template>
  <div class="extension-form">
    <p v-if="saved" class="inline-notice" role="status">{{ savedMessage }}</p>
    <template v-else>
      <button class="button secondary compact" :aria-expanded="open" :disabled="busy || disabled" @click="open = !open">{{ open ? 'Fermer la demande' : 'Demander un report' }}</button>
      <form v-if="open" novalidate @submit.prevent="submit">
        <p class="muted">Votre demande sera examinée par un administrateur. Elle ne modifie pas automatiquement la date de retrait.</p>
        <label :for="`extension-days-${mediaId}`">Délai souhaité en jours</label>
        <input :id="`extension-days-${mediaId}`" v-model.number="days" type="number" min="1" max="30" step="1" :disabled="busy || disabled" />
        <label :for="`extension-reason-${mediaId}`">Motif (facultatif)</label>
        <textarea :id="`extension-reason-${mediaId}`" v-model="reason" maxlength="500" rows="3" :disabled="busy || disabled" placeholder="Par exemple : terminer cette saison ce week-end." />
        <p class="muted">500 caractères maximum. Votre motif sera visible par les administrateurs.</p>
        <p v-if="error" class="inline-notice error" role="alert">{{ error }}</p>
        <button class="button secondary compact" :disabled="busy || disabled" type="submit">{{ busy ? 'Enregistrement…' : 'Envoyer ma demande' }}</button>
      </form>
    </template>
  </div>
</template>
<style scoped>
.extension-form{width:100%}.extension-form form{display:grid;gap:10px;margin-top:16px;max-width:600px}.extension-form p{font-size:12px;line-height:1.7}.extension-form label{font-size:13px}.extension-form input,.extension-form textarea{box-sizing:border-box;border:1px solid var(--line);border-radius:8px;padding:10px;background:var(--bg);color:var(--text);font:inherit;max-width:100%}.extension-form textarea:focus-visible{outline:3px solid var(--signal);outline-offset:5px}.extension-form input{width:100px}.extension-form textarea{width:100%;resize:vertical}.extension-form .button{justify-self:start}.error{color:var(--danger,#ff9c9c)}
</style>
