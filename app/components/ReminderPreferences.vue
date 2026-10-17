<script setup lang="ts">
import type { ReminderPreferences } from '~/types/api'
const { session, ready, capabilities, demo, refresh } = useHub()
const preferences = ref<ReminderPreferences | null>(null)
const days = ref('7, 2')
const busy = ref(false)
const message = ref('')
const failure = ref('')
let revision = 0
const enabled = computed(() => !demo.value && capabilities.value?.notifications === true)
const discordAvailable = computed(() => capabilities.value?.discordDMs === true && Boolean(session.value.user?.discordId))
async function load() {
  const current = ++revision
  preferences.value = null; message.value = ''; failure.value = ''; busy.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected || !enabled.value) return
  busy.value = true
  try {
    const data = await $fetch<ReminderPreferences>('/api/v1/reminders/preferences', { retry: 0 })
    if (current !== revision) return
    preferences.value = { ...data, discordDmEnabled: data.discordDmEnabled === true, availableUnwatched: data.availableUnwatched === true }; days.value = data.daysBefore.join(', ')
  } catch (error) {
    if (current !== revision) return
    failure.value = apiMessage(error)
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401 || status === 403) await refresh()
  } finally { if (current === revision) busy.value = false }
}
async function save() {
  if (!preferences.value || busy.value) return
  const values = days.value.split(',').map(value => Number(value.trim()))
  const p = preferences.value
  failure.value = ''; message.value = ''
  if (!values.length || values.length > 5 || new Set(values).size !== values.length || values.some(value => !Number.isInteger(value) || value < 1 || value > 30)) {
    failure.value = 'Choisissez de 1 à 5 délais différents, entre 1 et 30 jours, séparés par des virgules.'; return
  }
  if (![p.quietStartHour, p.quietEndHour].every(value => Number.isInteger(value) && value >= 0 && value <= 23) || !Number.isInteger(p.dailyCap) || p.dailyCap < 1 || p.dailyCap > 100) {
    failure.value = 'Vérifiez les heures calmes (0 à 23 h) et le nombre maximal de rappels (1 à 100).'; return
  }
  const current = revision
  busy.value = true
  try {
    const data = await $fetch<ReminderPreferences>('/api/v1/reminders/preferences', { method: 'PUT', retry: 0, body: { ...p, daysBefore: values, discordDmEnabled: discordAvailable.value && p.enabled && p.discordDmEnabled === true } })
    if (current !== revision) return
    preferences.value = { ...data, discordDmEnabled: data.discordDmEnabled === true, availableUnwatched: data.availableUnwatched === true }; days.value = data.daysBefore.join(', ')
    message.value = data.enabled ? `Vos rappels dans Le Hub sont activés.${data.discordDmEnabled ? ' Les messages privés Discord sont également activés.' : ''} Vos préférences sont enregistrées.` : 'Vos rappels sont désactivés. Vos préférences sont enregistrées.'
  } catch (error) {
    if (current !== revision) return
    failure.value = apiMessage(error)
    const status = (error as { statusCode?: number }).statusCode
    if (status === 401 || status === 403) await refresh()
  } finally { if (current === revision) busy.value = false }
}
watch([ready, enabled, discordAvailable, () => session.value.user?.plexId, () => session.value.plexConnected], load, { immediate: true })
watch(() => preferences.value?.discordDmEnabled, value => { if (value && preferences.value) preferences.value.enabled = true })
onBeforeUnmount(() => { revision++ })
</script>
<template>
  <section v-if="enabled" id="rappels" class="panel reminder-preferences">
    <h2>À votre rythme</h2>
    <p class="muted">Des rappels avant le départ de vos films et épisodes commencés, demandés ou suivis, et les disponibilités de vos suivis.</p>
    <p v-if="capabilities?.discordChannelReminders" class="muted">Les rappels des demandes Seerr sont publiés dans le salon notifications du serveur, avec une mention des demandeurs. Vos messages privés restent un choix personnel supplémentaire.</p>
    <p v-if="message" class="banner" role="status">{{ message }}</p>
    <div v-if="failure" class="banner error-banner" role="alert">{{ failure }}<button v-if="!preferences" @click="load">Réessayer les préférences</button></div>
    <p v-if="busy && !preferences" class="loading" role="status">Chargement de vos préférences…</p>
    <form v-if="preferences" @submit.prevent="save">
      <fieldset :disabled="busy">
        <label class="toggle-row"><span><strong>Activer mes rappels dans Le Hub</strong><small>Désactivés par défaut. Les messages privés Discord se choisissent séparément.</small></span><input v-model="preferences.enabled" type="checkbox" /></label>
        <label class="toggle-row"><span><strong>Recevoir aussi mes rappels en message privé Discord</strong><small>Choix séparé, désactivé par défaut. Active aussi vos rappels dans Le Hub. Au plus un récapitulatif des départs et un des disponibilités par jour, avec un plafond commun.</small></span><input v-model="preferences.discordDmEnabled" type="checkbox" :disabled="!discordAvailable" /></label>
        <label v-if="capabilities?.departures" class="toggle-row"><span><strong>Inclure tous mes contenus non vus</strong><small>Sinon, seuls vos demandes, suivis et lectures commencées sont concernés. L’état « non vu » doit être confirmé par Plex.</small></span><input v-model="preferences.allUnwatched" type="checkbox" /></label>
        <label v-if="capabilities?.departures && capabilities?.requests" class="toggle-row"><span><strong>Me rappeler mes anciennes demandes non vues</strong><small>Choix séparé, désactivé par défaut. Une relance entre 30 et 90 jours après la plus récente des dates de demande et d’ajout dans Plex, sans départ prévu ni lecture commencée. Elle partage votre récapitulatif et votre plafond.</small></span><input v-model="preferences.availableUnwatched" type="checkbox" :disabled="!preferences.enabled" /></label>
        <p v-if="!discordAvailable" class="muted discord-help">{{ capabilities?.discordDMs ? 'Liez votre compte Discord pour choisir les messages privés.' : 'Les messages privés Discord ne sont pas disponibles sur ce serveur.' }}</p>
        <a v-if="capabilities?.discordDMs && !session.user?.discordId && capabilities?.discordLogin" href="/api/v1/auth/discord/start" class="button secondary compact">Lier Discord pour mes rappels</a>
        <div class="reminder-fields">
          <label for="reminder-days">Combien de jours avant le départ ?<input id="reminder-days" v-model="days" type="text" inputmode="numeric" aria-describedby="reminder-days-help" required /><small id="reminder-days-help">De 1 à 5 délais entre 1 et 30 jours, séparés par des virgules. Exemple : 7, 2.</small></label>
          <div class="reminder-hours"><label for="quiet-start">Heures calmes : début<input id="quiet-start" v-model.number="preferences.quietStartHour" type="number" min="0" max="23" step="1" required /></label><label for="quiet-end">Fin<input id="quiet-end" v-model.number="preferences.quietEndHour" type="number" min="0" max="23" step="1" required /></label></div>
          <p class="muted">Horaires de Paris. Deux heures identiques désactivent la plage calme.</p>
          <label for="reminder-cap">Nombre maximal de rappels par jour<input id="reminder-cap" v-model.number="preferences.dailyCap" type="number" min="1" max="100" step="1" required /><small>Départs et disponibilités partagent ce plafond : 10 contenus au maximum par défaut.</small></label>
        </div>
        <button class="button secondary" type="submit">{{ busy ? 'Enregistrement…' : 'Enregistrer mes rappels' }}</button>
      </fieldset>
    </form>
    <div class="quiet-note"><HubIcon name="bell" /><p>Vos rappels personnels nécessitent une session Plex active. Après un redémarrage du Concierge, reconnectez-vous. Un état de visionnage incertain ne déclenche aucun rappel personnel. Les annonces du salon notifications fonctionnent indépendamment de votre session.</p></div>
    <NuxtLink to="/avant-le-depart#reminders-heading" class="text-button">Consulter mes rappels</NuxtLink>
  </section>
</template>
<style scoped>
fieldset{border:0;padding:0;margin:0;min-width:0}.reminder-fields{display:grid;gap:16px;margin:0 0 24px}.reminder-fields label{display:flex;flex-direction:column;gap:8px;font-size:13px}.reminder-fields input{width:100%;padding:10px 12px;background:var(--bg);border:1px solid var(--line);border-radius:8px;color:inherit;font:inherit}.reminder-fields small,.reminder-fields p{font-size:11px;line-height:1.6;color:var(--muted)}.reminder-hours{display:grid;grid-template-columns:1fr 1fr;gap:16px}.reminder-preferences>.muted{line-height:1.7}.reminder-preferences .banner{margin-top:18px}.reminder-preferences input[type=checkbox]{accent-color:var(--purple)}
</style>
