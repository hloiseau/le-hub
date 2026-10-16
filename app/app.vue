<script setup lang="ts">
const { demo, ready, session, error, refresh, logout } = useHub()
const config = useRuntimeConfig()
const menu = ref(false)
const route = useRoute()
const actionError = ref('')
watch(() => route.path, () => { menu.value = false })
let recheck: ReturnType<typeof setInterval> | undefined
function checkOnFocus() { if (document.visibilityState === 'visible') void refresh() }
onMounted(() => {
  void refresh()
  recheck = setInterval(() => void refresh(), 60_000)
  document.addEventListener('visibilitychange', checkOnFocus)
})
onBeforeUnmount(() => { clearInterval(recheck); document.removeEventListener('visibilitychange', checkOnFocus) })
async function signOut() { try { await logout() } catch { actionError.value = 'La déconnexion a échoué. Réessayez.' } }
const nav = [{ path: '/', icon: 'home', text: 'Accueil' }, { path: '/demandes', icon: 'requests', text: 'Mes demandes' }, { path: '/suivis', icon: 'bell', text: 'Mes suivis' }, { path: '/bibliotheque', icon: 'book', text: 'Bibliothèque' }, { path: '/serveur', icon: 'server', text: 'Le serveur' }]
</script>
<template>
  <a class="skip-link" href="#main">Aller au contenu</a>
  <PlexGate v-if="!ready || !session.user || !session.plexConnected" />
  <div v-else class="app-shell">
    <header class="mobile-bar"><NuxtLink to="/" class="brand">le hub<span>.</span></NuxtLink><button class="icon-button" :aria-expanded="menu" aria-controls="sidebar" :aria-label="menu ? 'Fermer la navigation' : 'Ouvrir la navigation'" @click="menu = !menu"><HubIcon :name="menu ? 'close' : 'menu'" /></button></header>
    <button v-if="menu" class="scrim" aria-label="Fermer la navigation" @click="menu = false" />
    <aside id="sidebar" class="sidebar" :class="{ open: menu }">
      <NuxtLink to="/" class="brand">le hub<span>.</span></NuxtLink><p class="brand-subtitle">VOTRE COIN MULTIMÉDIA</p>
      <nav aria-label="Navigation principale"><NuxtLink v-for="item in nav" :key="item.path" :to="item.path" :class="{ active: route.path === item.path }"><HubIcon :name="item.icon" /><span>{{ item.text }}</span><span v-if="item.path === '/bibliotheque' || item.path === '/serveur'" class="nav-dot" /></NuxtLink></nav>
      <div class="sidebar-note"><span class="note-mark">✦</span><p>Un film ce soir.<br />Une histoire demain.</p><span>Tout commence ici.</span></div>
      <div class="sidebar-bottom"><a v-if="config.public.discordUrl" :href="String(config.public.discordUrl)" target="_blank" rel="noopener noreferrer"><HubIcon name="spark" />Notre Discord<HubIcon name="external" /></a><NuxtLink to="/aide"><HubIcon name="help" />Besoin d’un coup de main ?</NuxtLink><NuxtLink to="/compte" class="account-link"><span class="avatar">{{ session.user?.name?.charAt(0).toUpperCase() || '?' }}</span><span>{{ session.user?.name || 'Mon compte' }}<small>{{ session.user ? 'Votre espace personnel' : 'Se connecter' }}</small></span><HubIcon name="arrow" /></NuxtLink></div>
    </aside>
    <div class="main-shell">
      <header class="topbar"><span class="breadcrumb">Votre espace <span>/</span> {{ nav.find(n => n.path === route.path)?.text || (route.path === '/compte' ? 'Mon compte' : 'Aide & guides') }}</span><div class="topbar-right"><span class="environment"><i />{{ demo ? 'Démonstration' : 'Espace multimédia' }}</span><button v-if="session.user && !demo" class="text-button" @click="signOut">Déconnexion</button><NuxtLink v-else-if="!session.user" to="/compte" class="text-button">Connexion <HubIcon name="arrow" /></NuxtLink></div></header>
      <main id="main"><div v-if="demo" class="banner demo-banner" role="status">Mode démonstration · Les contenus et demandes sont fictifs. Aucune connexion à votre serveur.</div><div v-if="error || actionError" class="banner error-banner" role="alert">{{ error || actionError }}<button v-if="error" @click="refresh">Réessayer</button></div><NuxtPage /></main>
      <footer><span>Le Hub <span class="footer-dot">·</span> Un petit écosystème, de grandes histoires.</span><a href="https://github.com/hloiseau/le-hub" target="_blank" rel="noopener noreferrer">Open source <HubIcon name="external" /></a></footer>
    </div>
  </div>
</template>
