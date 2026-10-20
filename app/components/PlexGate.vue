<script setup lang="ts">
const { ready, capabilities, error, refresh } = useHub()
const busy = ref(false)
const message = ref('')
const plexUrl = ref('')
let timer: ReturnType<typeof setTimeout> | undefined
let stopped = false
let expires = 0
onBeforeUnmount(() => { stopped = true; clearTimeout(timer) })
async function start() {
  if (busy.value) return
  busy.value = true; message.value = ''; plexUrl.value = ''; clearTimeout(timer)
  try {
    const result = await $fetch<{ url: string; expiresIn: number }>('/api/v1/auth/plex/start', { method: 'POST' })
    if (!result.url.startsWith('https://app.plex.tv/auth#')) throw new Error('Invalid Plex URL')
    plexUrl.value = result.url; expires = Date.now() + result.expiresIn * 1000
    timer = setTimeout(poll, 2500)
  } catch (e) { message.value = apiMessage(e) }
  finally { busy.value = false }
}
async function poll() {
  if (stopped) return
  if (Date.now() >= expires) { plexUrl.value = ''; message.value = 'La connexion a expiré. Vous pouvez la relancer.'; return }
  try {
    const result = await $fetch<{ connected: boolean }>('/api/v1/auth/plex/poll', { method: 'POST' })
    if (result.connected) { plexUrl.value = ''; await refresh(); return }
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode
    if (status !== 429) { plexUrl.value = ''; message.value = apiMessage(e); return }
  }
  if (!stopped) timer = setTimeout(poll, 2500)
}
</script>
<template>
  <main id="main" class="login-screen">
    <section class="login-card" aria-labelledby="login-title">
      <span class="brand">le hub<span>.</span></span>
      <h1 id="login-title">Connexion</h1>
      <p class="lede">Connectez-vous avec Plex pour retrouver votre espace. Votre compte doit avoir accès au serveur.</p>
      <p v-if="!ready" role="status" class="loading">Vérification de votre connexion…</p>
      <template v-else>
        <div v-if="error || message" class="banner error-banner" role="alert">{{ message || error }}</div>
        <template v-if="plexUrl">
          <a :href="plexUrl" class="button primary plex-login" target="_blank" rel="noopener noreferrer">Continuer sur Plex <HubIcon name="external" /></a>
          <p class="footnote" role="status">Autorisez Le Hub dans l’onglet Plex, puis revenez ici. La connexion sera vérifiée automatiquement.</p>
          <button class="text-button" :disabled="busy" @click="start">Recommencer la connexion</button>
        </template>
        <button v-else-if="capabilities?.plexLink" class="button primary plex-login" :disabled="busy" @click="start">{{ busy ? 'Ouverture de Plex…' : 'Se connecter avec Plex' }}<HubIcon name="arrow" /></button>
        <div v-else-if="!error" class="inline-notice">La connexion Plex n’est pas encore configurée. Contactez l’administrateur.</div>
        <button v-if="error" class="button secondary" @click="refresh">Réessayer</button>
      </template>
      <p class="login-note">Votre mot de passe reste chez Plex.</p>
      <p v-if="capabilities?.persistentPlexAuthorization" class="footnote">L’autorisation Plex est conservée chiffrée pour les rappels, même quand le Hub est fermé. « Déconnexion » l’efface et arrête les rappels.</p>
    </section>
  </main>
</template>
