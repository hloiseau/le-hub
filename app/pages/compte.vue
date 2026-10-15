<script setup lang="ts">
const { session, capabilities, demo, ready, refresh } = useHub()
const busy = ref(false)
const message = ref('')
const plexUrl = ref('')
const confirmDelete = ref(false)
const optedIn = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined
let stopped = false
let expiry = 0
watch(() => session.value.user?.notifications, v => { optedIn.value = Boolean(v) }, { immediate: true })
onBeforeUnmount(() => { stopped = true; clearTimeout(timer) })
async function linkPlex() {
  busy.value = true; message.value = ''; clearTimeout(timer)
  try {
    const result = await $fetch<{ url: string; expiresIn: number }>('/api/v1/auth/plex/start', { method: 'POST' })
    if (!result.url.startsWith('https://app.plex.tv/auth#')) throw new Error('Invalid Plex URL')
    plexUrl.value = result.url; expiry = Date.now() + result.expiresIn * 1000
    timer = setTimeout(poll, 3000)
  } catch (e) { message.value = apiMessage(e) }
  finally { busy.value = false }
}
async function poll() {
  if (stopped) return
  if (Date.now() > expiry) { plexUrl.value = ''; message.value = 'La liaison a expiré. Vous pouvez la relancer.'; return }
  try {
    const result = await $fetch<{ connected: boolean }>('/api/v1/auth/plex/poll', { method: 'POST' })
    if (result.connected) { plexUrl.value = ''; await refresh(); return }
  } catch (e) { message.value = apiMessage(e); plexUrl.value = ''; return }
  if (!stopped) timer = setTimeout(poll, 3000)
}
async function save() {
  if (demo.value) return
  busy.value = true; message.value = ''
  try { await $fetch('/api/v1/preferences', { method: 'PUT', body: { notifications: optedIn.value } }); await refresh(); message.value = 'Préférence enregistrée. Les notifications seront disponibles dans une prochaine version.' }
  catch (e) { message.value = apiMessage(e) }
  finally { busy.value = false }
}
async function deleteAccount() {
  if (demo.value) return
  busy.value = true
  try { await $fetch('/api/v1/account', { method: 'DELETE' }); await refresh(); await navigateTo('/') }
  catch (e) { message.value = apiMessage(e) }
  finally { busy.value = false }
}
</script>
<template>
  <section class="page-heading"><p class="eyebrow">CHEZ VOUS</p><h1>Mon compte<span>.</span></h1><p class="lede">Vos identités, vos accès, vos préférences.</p></section>
  <p v-if="!ready" role="status" class="loading">Chargement de votre espace…</p>
  <div v-else-if="!session.user" class="account-panel"><span class="large-icon"><HubIcon name="user" /></span><h2>Bienvenue dans votre espace</h2><p>Connectez-vous avec votre compte Discord du serveur. Vous pourrez ensuite lier Plex pour retrouver vos contenus et vos demandes.</p><a v-if="capabilities?.discordLogin" href="/api/v1/auth/discord/start" class="button primary">Se connecter avec Discord <HubIcon name="arrow" /></a><div v-else class="inline-notice">La connexion Discord n’est pas encore configurée par l’administrateur.</div></div>
  <template v-else>
    <div v-if="message" class="banner" role="status">{{ message }}</div>
    <div class="account-grid"><section class="panel"><h2>Vos comptes liés</h2><div class="identity-row"><span class="identity-icon discord"><HubIcon name="user" /></span><div><h3>Discord</h3><p>{{ session.user.name }}</p></div><span class="status-badge available">Connecté</span></div><div class="identity-row"><span class="identity-icon plex"><HubIcon name="play" /></span><div><h3>Plex</h3><p>{{ session.plexConnected ? 'Accès au serveur vérifié' : session.user.plexId ? 'Une reconnexion est nécessaire' : 'À associer à votre compte' }}</p></div><span v-if="session.plexConnected" class="status-badge available">Connecté</span><button v-else class="button secondary compact" :disabled="busy || demo || !capabilities?.plexLink" @click="linkPlex">Lier Plex</button></div><div v-if="plexUrl" class="linking-box"><p>Ouvrez Plex, autorisez Le Concierge, puis revenez ici. La vérification est automatique.</p><a :href="plexUrl" target="_blank" rel="noopener noreferrer" class="button primary">Ouvrir Plex <HubIcon name="external" /></a></div><div class="identity-row"><span class="identity-icon seerr"><HubIcon name="spark" /></span><div><h3>Seerr</h3><p>{{ session.user.seerrId ? 'Votre compte de demandes est associé' : 'Association par l’administrateur après liaison Plex' }}</p></div><span class="status-badge" :class="session.user.seerrId ? 'available' : 'pending'">{{ session.user.seerrId ? 'Associé' : 'En attente' }}</span></div><p class="footnote">Les sessions expirent après 12 heures. Vos mots de passe Discord et Plex ne transitent jamais par Le Hub.</p></section>
    <section class="panel"><h2>À votre rythme</h2><p class="muted">Les rappels avant retrait font partie des prochaines priorités.</p><label class="toggle-row"><span><strong>Recevoir les futures notifications</strong><small>Préférence enregistrée, envois encore indisponibles.</small></span><input v-model="optedIn" type="checkbox" :disabled="demo" /></label><button class="button secondary" :disabled="busy || demo" @click="save">Enregistrer ma préférence</button><div class="quiet-note"><HubIcon name="bell" /><p>Prévu : rappels ciblés, regroupement et heures calmes. Aucun envoi automatique n’est actif dans cette version.</p></div></section></div>
    <section class="panel privacy-panel"><div><h2>Vos données vous appartiennent</h2><p>Supprimer votre compte local efface vos associations et préférences du Concierge. Vos comptes Discord, Plex et Seerr restent en place.</p></div><button v-if="!confirmDelete" class="text-button danger" :disabled="demo" @click="confirmDelete = true">Supprimer mon compte local</button><div v-else class="confirm-delete"><p>Confirmer la suppression de ces données locales ?</p><button class="button danger-button" :disabled="busy" @click="deleteAccount">Oui, supprimer</button><button class="button secondary" @click="confirmDelete = false">Annuler</button></div></section>
  </template>
</template>
