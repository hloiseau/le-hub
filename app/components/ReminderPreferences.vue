<script setup lang="ts">
import type { ReminderPreferences } from '~/types/api'
const emit = defineEmits<{ change: [preferences: ReminderPreferences | null] }>()
const { session, ready, capabilities, demo, refresh } = useHub()
const preferences = ref<ReminderPreferences | null>(null)
const savedPreferences = ref<ReminderPreferences | null>(null)
const days = ref<number[]>([7, 2])
const customDay = ref(5)
const dayChoices = computed(() => [...new Set([1, 2, 3, 7, 14, 30, ...days.value])].sort((a, b) => a - b))
function toggleDay(day: number) {
  days.value = days.value.includes(day) ? days.value.filter(value => value !== day) : [...days.value, day].sort((a, b) => b - a)
}
function addDay() {
  if (Number.isInteger(customDay.value) && customDay.value >= 1 && customDay.value <= 30 && !days.value.includes(customDay.value) && days.value.length < 5) toggleDay(customDay.value)
}
const busy = ref(false)
const message = ref('')
const failure = ref('')
let revision = 0
const enabled = computed(() => !demo.value && capabilities.value?.notifications === true)
const discordAvailable = computed(() => capabilities.value?.discordDMs === true && Boolean(session.value.user?.discordId))
async function load() {
  const current = ++revision
  preferences.value = null; savedPreferences.value = null; message.value = ''; failure.value = ''; busy.value = false
  emit('change', null)
  if (!ready.value || !session.value.user || !session.value.plexConnected || !enabled.value) return
  busy.value = true
  try {
    const data = await $fetch<ReminderPreferences>('/api/v1/reminders/preferences', { retry: 0 })
    if (current !== revision) return
    preferences.value = { ...data, discordDmEnabled: data.discordDmEnabled === true, availableUnwatched: data.availableUnwatched === true }; days.value = [...data.daysBefore]
    savedPreferences.value = { ...preferences.value, daysBefore: [...data.daysBefore] }
    emit('change', { ...preferences.value })
  } catch (error) {
    if (current !== revision) return
    failure.value = apiMessage(error)
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401 || status === 403) await refresh()
  } finally { if (current === revision) busy.value = false }
}
async function save() {
  if (!preferences.value || busy.value) return
  const p = !preferences.value.enabled && savedPreferences.value ? { ...savedPreferences.value, enabled: false } : preferences.value
  const values = p.enabled ? days.value : p.daysBefore
  failure.value = ''; message.value = ''
  if (!values.length || values.length > 5 || new Set(values).size !== values.length || values.some(value => !Number.isInteger(value) || value < 1 || value > 30)) {
    failure.value = 'Choisissez au moins un délai et au maximum cinq, entre 1 et 30 jours.'; return
  }
  if (![p.quietStartHour, p.quietEndHour].every(value => Number.isInteger(value) && value >= 0 && value <= 23) || !Number.isInteger(p.dailyCap) || p.dailyCap < 1 || p.dailyCap > 100) {
    failure.value = 'Vérifiez les heures calmes (0 à 23 h) et le nombre maximal de rappels (1 à 100).'; return
  }
  const current = revision
  busy.value = true
  try {
    const data = await $fetch<ReminderPreferences>('/api/v1/reminders/preferences', { method: 'PUT', retry: 0, body: { ...p, daysBefore: values, discordDmEnabled: discordAvailable.value && p.enabled && p.discordDmEnabled === true } })
    if (current !== revision) return
    preferences.value = { ...data, discordDmEnabled: data.discordDmEnabled === true, availableUnwatched: data.availableUnwatched === true }; days.value = [...data.daysBefore]
    savedPreferences.value = { ...preferences.value, daysBefore: [...data.daysBefore] }
    emit('change', { ...preferences.value })
    message.value = data.enabled ? `Notifications enregistrées : Le Hub${data.discordDmEnabled ? ' et messages privés Discord' : ''}.` : 'Notifications personnelles désactivées.'
  } catch (error) {
    if (current !== revision) return
    failure.value = apiMessage(error)
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401 || status === 403) await refresh()
  } finally { if (current === revision) busy.value = false }
}
watch([ready, enabled, discordAvailable, () => session.value.user?.plexId, () => session.value.plexConnected], load, { immediate: true })
onBeforeUnmount(() => { revision++ })
</script>
<template>
  <section v-if="enabled || (!demo && capabilities?.discordChannelReminders)" id="rappels" class="panel reminder-preferences">
    <div class="notification-heading"><h2>Notifications</h2><NuxtLink v-if="capabilities?.departures" to="/retraits#reminders-heading" class="text-button">Voir mes rappels <HubIcon name="arrow" /></NuxtLink></div>
    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <div v-if="failure" class="banner error-banner" role="alert">{{ failure }}<button v-if="!preferences" @click="load">Réessayer les préférences</button></div>
    <p v-if="busy && !preferences" role="status">Chargement…</p>
    <form v-if="preferences" @submit.prevent="save">
      <fieldset :disabled="busy">
        <label class="notification-toggle master-toggle"><span><strong>Notifications personnelles</strong><small>Activer les rappels dans Le Hub.</small></span><input v-model="preferences.enabled" type="checkbox" /></label>
        <fieldset :disabled="!preferences.enabled" class="notification-options">
          <section class="notification-group">
            <h3>Réception</h3>
            <label class="notification-toggle"><span><strong>Messages privés Discord</strong><small>Recevoir aussi un récapitulatif sur Discord.</small></span><input v-model="preferences.discordDmEnabled" type="checkbox" :disabled="!discordAvailable" /></label>
            <p v-if="!discordAvailable" class="muted">{{ capabilities?.discordDMs ? 'Liez votre compte Discord pour recevoir les messages privés.' : 'Les messages privés Discord sont indisponibles.' }}</p>
            <a v-if="capabilities?.discordDMs && !session.user?.discordId && capabilities?.discordLogin" href="/api/v1/auth/discord/start" class="button secondary compact">Lier Discord</a>
          </section>
          <section v-if="capabilities?.departures" class="notification-group">
            <h3>Retraits prévus</h3>
            <p class="muted">Les contenus terminés sont exclus. L’état de lecture est vérifié pour votre compte.</p>
            <label class="notification-toggle"><span><strong>Tout le catalogue non vu</strong><small>Sinon : mes demandes, mes suivis et mes lectures à finir.</small></span><input v-model="preferences.allUnwatched" type="checkbox" /></label>
            <fieldset class="notification-days"><legend>Me prévenir avant le retrait</legend>
              <div class="day-choices"><button v-for="day in dayChoices" :key="day" type="button" :aria-pressed="days.includes(day)" :disabled="!days.includes(day) && days.length >= 5" @click="toggleDay(day)">{{ day }} {{ day === 1 ? 'jour' : 'jours' }}</button></div>
              <details class="custom-delay"><summary>Ajouter un autre délai</summary><div><label>Délai en jours<input v-model.number="customDay" type="number" min="1" max="30" step="1" /></label><button type="button" class="button secondary compact" :disabled="days.length >= 5 || days.includes(customDay) || customDay < 1 || customDay > 30 || !Number.isInteger(customDay)" @click="addDay">Ajouter</button></div></details>
            </fieldset>
          </section>
          <section v-if="capabilities?.departures && capabilities?.requests" class="notification-group">
            <h3>Demandes disponibles</h3>
            <label class="notification-toggle"><span><strong>Relancer mes demandes oubliées</strong><small>Une seule relance entre 30 et 90 jours après l’ajout ou la demande, si je n’ai pas commencé à regarder.</small></span><input v-model="preferences.availableUnwatched" type="checkbox" /></label>
          </section>
          <details class="notification-group notification-limits">
            <summary>Horaires et limite quotidienne</summary>
            <div class="notification-hours"><label>Ne pas déranger à partir de<select v-model.number="preferences.quietStartHour"><option v-for="hour in 24" :key="hour" :value="hour - 1">{{ String(hour - 1).padStart(2, '0') }}:00</option></select></label><label>Jusqu’à<select v-model.number="preferences.quietEndHour"><option v-for="hour in 24" :key="hour" :value="hour - 1">{{ String(hour - 1).padStart(2, '0') }}:00</option></select></label></div>
            <p class="muted">Heure de Paris. Choisissez deux heures identiques pour recevoir les notifications à toute heure.</p>
            <label class="daily-limit">Contenus maximum par jour<input v-model.number="preferences.dailyCap" type="number" min="1" max="100" step="1" required /></label>
          </details>
        </fieldset>
        <div class="notification-save"><button class="button primary" type="submit">{{ busy ? 'Enregistrement…' : 'Enregistrer' }}</button><span class="muted">Les changements s’appliquent après enregistrement.</span></div>
      </fieldset>
    </form>
    <section v-if="capabilities?.discordChannelReminders" class="channel-notice"><h3>Salon Discord <span class="status-badge">Automatique</span></h3><p>Les annonces mentionnent uniquement les demandeurs qui ont encore ce contenu à voir. Elles sont distinctes de vos notifications personnelles.</p><p>Une connexion Plex active au Hub est nécessaire pour vérifier votre visionnage.</p></section>
    <details v-if="enabled" class="notification-help"><summary>Fonctionnement des rappels</summary><p>Gardez une connexion Plex active au Hub. Si elle expire ou après un redémarrage du Concierge, reconnectez-vous. Les contenus terminés ou dont le visionnage est incertain ne déclenchent aucun rappel, y compris dans le salon Discord.</p><p>Les retraits et les disponibilités partagent la limite quotidienne. Discord regroupe chaque catégorie dans un récapitulatif.</p></details>
  </section>
</template>
<style scoped>
fieldset{border:0;padding:0;margin:0;min-width:0}.notification-heading,.notification-save{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap}.notification-heading{margin-bottom:20px}.notification-heading h2{margin:0}.notification-toggle{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:14px 0;cursor:pointer}.notification-toggle span{display:grid;gap:6px}.notification-toggle strong{font-size:14px}.notification-toggle small,.muted,.channel-notice p,.notification-help p{font-size:13px;line-height:1.6;color:var(--muted)}.notification-toggle input{appearance:none;width:44px;height:26px;flex:0 0 44px;border-radius:20px;border:1px solid var(--line);background:var(--surface);position:relative;cursor:pointer}.notification-toggle input:before{content:'';position:absolute;width:18px;height:18px;border-radius:50%;background:var(--muted);left:3px;top:3px;transition:transform .15s}.notification-toggle input:checked{background:var(--accent);border-color:var(--accent)}.notification-toggle input:checked:before{transform:translateX(18px);background:white}.notification-toggle input:disabled{opacity:.5;cursor:not-allowed}.master-toggle{border:1px solid var(--line);border-radius:10px;padding:16px;margin-bottom:8px}.notification-group{padding:20px 0;border-bottom:1px solid var(--line)}.notification-group h3,.channel-notice h3{font-size:15px;margin-bottom:8px}.notification-options:disabled{opacity:.55}.notification-days{margin-top:14px}.notification-days legend,.daily-limit,.notification-hours label,.custom-delay label{font-size:13px;font-weight:500}.day-choices{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}.day-choices button{min-height:44px;min-width:64px;padding:10px 14px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);font:inherit;font-size:13px;cursor:pointer}.day-choices button[aria-pressed=true]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 18%,var(--bg));color:var(--text)}.day-choices button:disabled{opacity:.5;cursor:not-allowed}.reminder-preferences :focus-visible,input:focus-visible,button:focus-visible,select:focus-visible,summary:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.custom-delay summary,.notification-help summary{font-size:13px;color:var(--muted);cursor:pointer}.custom-delay>div{display:flex;align-items:end;gap:12px;margin-top:12px}.custom-delay label,.daily-limit,.notification-hours label{display:grid;gap:8px}.custom-delay input,.daily-limit input{max-width:140px}.notification-hours{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:20px 0 12px}input[type=number],select{min-height:44px;width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:8px;color:var(--text);font:inherit;box-sizing:border-box}.notification-limits>summary{font-size:14px;cursor:pointer}.daily-limit{margin-top:16px}.notification-save{margin-top:24px;justify-content:flex-start}.notification-save span{font-size:12px}.channel-notice{margin-top:24px;padding:16px;border-radius:10px;background:var(--bg);border:1px solid var(--line)}.channel-notice h3{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.channel-notice .status-badge{font-size:11px}.notification-help{margin-top:20px}.notification-help p{margin-top:12px}.reminder-preferences .banner{margin:16px 0}@media(max-width:600px){.notification-hours{grid-template-columns:1fr}.notification-save .button{width:100%}.notification-toggle{gap:16px}.notification-heading .text-button{font-size:12px}}
</style>
