<script setup lang="ts">
const { session, services, capabilities, demo, ready, refresh } = useHub()
const busy = ref(false)
const message = ref('')
const confirmDelete = ref(false)
const seerrUrl = computed(() => services.value.find(s => s.id === 'seerr')?.url)
async function retrySeerr() {
  busy.value = true; message.value = ''
  try {
    await refresh()
    message.value = session.value.user?.seerrId ? 'Votre compte Seerr est associé automatiquement.' : 'Association non confirmée. Connectez-vous à Seerr avec le même compte Plex, puis réessayez. Si cela persiste, Seerr peut être indisponible.'
  } finally { busy.value = false }
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
  <div>
  <section class="page-heading"><h1>Mon compte<span>.</span></h1></section><nav class="section-nav" aria-label="Mon compte"><a href="#comptes">Comptes liés</a><a v-if="capabilities?.notifications || capabilities?.discordChannelReminders" href="#rappels">Notifications</a><a href="#donnees">Données locales</a></nav>
  <p v-if="!ready" role="status" class="loading">Chargement de votre espace…</p>
  <template v-else-if="session.user">
    <div v-if="message" class="banner" role="status">{{ message }}</div>
    <div class="account-settings"><section id="comptes" class="panel"><h2>Vos comptes liés</h2><div class="identity-row"><span class="identity-icon plex"><HubIcon name="play" /></span><div><h3>Plex</h3><p>{{ session.user.name }} · Accès au serveur vérifié</p></div><span class="status-badge available">Connecté</span></div><div class="identity-row"><span class="identity-icon discord"><HubIcon name="user" /></span><div><h3>Discord</h3><p>{{ session.user.discordId ? 'Votre compte est lié au Concierge' : 'Facultatif · Pour utiliser les commandes du bot' }}</p></div><span v-if="session.user.discordId" class="status-badge available">Associé</span><a v-else-if="capabilities?.discordLogin && !demo" href="/api/v1/auth/discord/start" class="button secondary compact">Lier Discord</a><span v-else class="status-badge pending">À configurer</span></div><div class="identity-row"><span class="identity-icon seerr"><HubIcon name="spark" /></span><div><h3>Seerr</h3><p>{{ session.user.seerrId ? 'Associé automatiquement avec votre compte Plex' : session.plexConnected ? 'Association automatique à vérifier' : 'Association automatique après connexion Plex' }}</p></div><span class="status-badge" :class="session.user.seerrId ? 'available' : 'pending'">{{ session.user.seerrId ? 'Associé' : 'En attente' }}</span></div><div v-if="session.plexConnected && !session.user.seerrId" class="linking-box"><p>Connectez-vous à Seerr avec le même compte Plex, puis actualisez l’association.</p><a v-if="seerrUrl" :href="seerrUrl" target="_blank" rel="noopener noreferrer" class="button secondary compact">Ouvrir Seerr <HubIcon name="external" /></a><button class="button secondary compact" :disabled="busy || demo" @click="retrySeerr">Actualiser l’association</button></div><p class="footnote">La connexion au site expire après 12 heures. Vos mots de passe Discord et Plex ne transitent jamais par Le Hub.</p><p v-if="capabilities?.persistentPlexAuthorization" class="footnote">L’autorisation Plex chiffrée permet aux rappels de continuer en arrière-plan. « Déconnexion » l’efface et arrête les rappels jusqu’à votre prochaine connexion.</p></section>
</div>
    <OuicheurAccount v-if="!demo && capabilities?.ouicheur" class="section-block" />
    <ReminderPreferences v-if="!demo && (capabilities?.notifications || capabilities?.discordChannelReminders)" class="section-block" />
    <p v-else class="muted section-block">Les notifications ne sont pas activées sur ce serveur.</p>
    <section id="donnees" class="panel privacy-panel"><div><h2>Compte local</h2><p>Supprimer votre compte local efface vos associations et préférences du Concierge. Vos comptes Discord, Plex et Seerr restent en place.</p></div><button v-if="!confirmDelete" class="text-button danger" :disabled="demo" @click="confirmDelete = true">Supprimer mon compte local</button><div v-else class="confirm-delete"><p>Confirmer la suppression de ces données locales ?</p><button class="button danger-button" :disabled="busy" @click="deleteAccount">Oui, supprimer</button><button class="button secondary" @click="confirmDelete = false">Annuler</button></div></section>
  </template>
  </div>
</template>
