<script setup lang="ts">
const linked = ref(false)
const expiresAt = ref('')
const login = ref('')
const password = ref('')
const busy = ref(false)
const loaded = ref(false)
const message = ref('')
async function update(method: 'GET' | 'POST' | 'DELETE') {
  busy.value = true; message.value = ''
  const body = method === 'POST' ? { login: login.value, password: password.value } : undefined
  password.value = ''
  try {
    const state = await $fetch<{ linked: boolean, expiresAt?: string }>('/api/v1/ouicheur/link', { method, body })
    linked.value = state.linked; expiresAt.value = state.expiresAt || ''; loaded.value = true
    if (method === 'POST') { login.value = ''; message.value = 'Ouicheur est relié. Utilisez /eris dans Discord pour consulter vos listes en privé.' }
    if (method === 'DELETE') message.value = 'La connexion personnelle est retirée du Concierge.'
  } catch (e) { message.value = apiMessage(e) }
  finally { busy.value = false }
}
onMounted(() => update('GET'))
</script>
<template>
  <section class="panel" aria-labelledby="ouicheur-title">
    <h2 id="ouicheur-title">Ouicheur et Eris</h2>
    <p>Reliez votre compte personnel pour consulter vos listes et choisir un cadeau avec Eris, en privé avec /eris dans Discord.</p>
    <p class="footnote">Votre mot de passe sert uniquement à ouvrir une session Ouicheur et n’est pas conservé. Les réservations et achats restent dans Ouicheur. La connexion doit être renouvelée après expiration, déconnexion du Hub ou redémarrage du Concierge.</p>
    <p v-if="message" role="status">{{ message }}</p>
    <p v-if="!loaded && !message" role="status">Vérification de la connexion…</p>
    <template v-if="linked">
      <p class="status-badge available">Connecté <span v-if="expiresAt">jusqu’au {{ new Date(expiresAt).toLocaleString('fr-FR') }}</span></p>
      <button class="button secondary" :disabled="busy" @click="update('DELETE')">Retirer la connexion Ouicheur</button>
    </template>
    <form v-else-if="loaded" class="stack" @submit.prevent="update('POST')">
      <label>Identifiant Ouicheur <input v-model="login" name="ouicheur-login" autocomplete="username" maxlength="40"></label>
      <p class="footnote">Laissez l’identifiant vide uniquement pour votre propre compte propriétaire Ouicheur.</p>
      <label>Mot de passe Ouicheur <input v-model="password" type="password" name="ouicheur-password" autocomplete="current-password" required maxlength="256"></label>
      <button class="button secondary" :disabled="busy || !password">Relier mon compte Ouicheur</button>
    </form>
    <button v-else-if="message" class="button secondary" :disabled="busy" @click="update('GET')">Réessayer</button>
  </section>
</template>
