<script setup lang="ts">
const { demo, ready, session, capabilities, error, refresh, logout } = useHub()
const config = useRuntimeConfig()
const menu = ref(false)
const mobile = ref(false)
const menuButton = ref<HTMLButtonElement>()
const route = useRoute()
const actionError = ref('')
watch(() => route.fullPath, () => { menu.value = false })
let recheck: ReturnType<typeof setInterval> | undefined
let screen: MediaQueryList | undefined
function updateScreen() { mobile.value = screen?.matches ?? false; menu.value = false }
function closeMenu() { if (menu.value) { menu.value = false; menuButton.value?.focus() } }
function checkOnFocus() { if (document.visibilityState === 'visible') void refresh() }
onMounted(() => {
  screen = window.matchMedia('(max-width: 700px)')
  updateScreen()
  screen.addEventListener('change', updateScreen)
  void refresh()
  recheck = setInterval(() => void refresh(), 60_000)
  document.addEventListener('visibilitychange', checkOnFocus)
})
onBeforeUnmount(() => { clearInterval(recheck); document.removeEventListener('visibilitychange', checkOnFocus); screen?.removeEventListener('change', updateScreen) })
async function signOut() { try { await logout() } catch { actionError.value = 'La déconnexion a échoué. Réessayez.' } }
const groups = computed(() => [
  { label: 'Médias', items: [
    { path: '/', icon: 'home', text: 'Accueil', enabled: true },
    { path: '/demandes', icon: 'requests', text: 'Mes demandes', enabled: demo.value || capabilities.value?.requests },
    { path: '/retraits', icon: 'bell', text: 'Retraits prévus', enabled: capabilities.value?.departures },
    { path: '/telechargements', icon: 'download', text: 'Téléchargements', enabled: capabilities.value?.downloads },
    { path: '/livres', icon: 'book', text: 'Livres', enabled: capabilities.value?.booksCatalog || capabilities.value?.bookRequestTracking },
  ] },
  { label: 'Serveur', items: [
    { path: '/performances', icon: 'server', text: 'Performances', enabled: capabilities.value?.monitoring },
    { path: '/communaute', icon: 'spark', text: 'Communauté', enabled: capabilities.value?.community || capabilities.value?.roadmap },
  ] },
].map(group => ({ ...group, items: group.items.filter(item => item.enabled) })).filter(group => group.items.length))
const sectionPath = computed(() => ['/collections', '/demandes-livres', '/guides/kobo'].includes(route.path) ? '/livres' : route.path)
const pageNames: Record<string, string> = { '/': 'Accueil', '/demandes': 'Mes demandes', '/retraits': 'Retraits prévus', '/telechargements': 'Téléchargements', '/livres': 'Livres', '/communaute': 'Communauté', '/performances': 'Performances', '/compte': 'Mon compte', '/aide': 'Aide', '/admin/reports': 'Demandes de report' }
const pageTitle = computed(() => pageNames[sectionPath.value] || 'Le Hub')
const canReview = computed(() => session.value.admin && capabilities.value?.extensionRequests && !demo.value)
</script>
<template>
  <a class="skip-link" href="#main">Aller au contenu</a>
  <PlexGate v-if="!ready || !session.user || !session.plexConnected" />
  <div v-else class="app-shell" @keydown.esc="closeMenu">
    <header class="mobile-bar"><NuxtLink to="/" class="brand">le hub<span>.</span></NuxtLink><button ref="menuButton" class="icon-button" :aria-expanded="menu" aria-controls="sidebar" :aria-label="menu ? 'Fermer la navigation' : 'Ouvrir la navigation'" @click="menu = !menu"><HubIcon :name="menu ? 'close' : 'menu'" /></button></header>
    <button v-if="menu" class="scrim" aria-label="Fermer la navigation" tabindex="-1" @click="closeMenu" />
    <aside id="sidebar" class="sidebar" :class="{ open: menu }" :inert="mobile && !menu">
      <NuxtLink to="/" class="brand">le hub<span>.</span></NuxtLink>
      <nav aria-label="Navigation principale">
        <div v-for="group in groups" :key="group.label" class="nav-group"><p class="nav-label">{{ group.label }}</p><NuxtLink v-for="item in group.items" :key="item.path" :to="item.path" :class="{ active: sectionPath === item.path }" :aria-current="sectionPath === item.path ? 'page' : undefined"><HubIcon :name="item.icon" /><span>{{ item.text }}</span></NuxtLink></div>
        <div v-if="canReview" class="nav-group"><p class="nav-label">Administration</p><NuxtLink to="/admin/reports" @click="menu = false"><HubIcon name="requests" /><span>Demandes de report</span></NuxtLink></div>
      </nav>
      <div class="sidebar-bottom"><a v-if="config.public.discordUrl" :href="String(config.public.discordUrl)" target="_blank" rel="noopener noreferrer"><HubIcon name="spark" />Discord<HubIcon name="external" /></a><NuxtLink to="/aide"><HubIcon name="help" />Aide</NuxtLink><NuxtLink to="/compte" class="account-link"><span class="avatar">{{ session.user?.name?.charAt(0).toUpperCase() || '?' }}</span><span>{{ session.user?.name || 'Mon compte' }}<small>{{ session.user ? 'Mon compte' : 'Se connecter' }}</small></span><HubIcon name="arrow" /></NuxtLink></div>
    </aside>
    <div class="main-shell" :inert="mobile && menu">
      <header class="topbar"><span class="breadcrumb">Le Hub <span>/</span> {{ pageTitle }}</span><div class="topbar-right"><span v-if="demo" class="environment">Démonstration</span><button v-if="session.user && !demo" class="text-button" @click="signOut">Déconnexion</button></div></header>
      <main id="main"><div v-if="demo" class="banner demo-banner" role="status">Mode démonstration · Les contenus et demandes sont fictifs. Aucune connexion à votre serveur.</div><div v-if="error || actionError" class="banner error-banner" role="alert">{{ error || actionError }}<button v-if="error" @click="refresh">Réessayer</button></div><NuxtPage /></main>
      <footer><span>Le Hub</span><a href="https://github.com/hloiseau/le-hub" target="_blank" rel="noopener noreferrer">Open source <HubIcon name="external" /></a></footer>
    </div>
  </div>
</template>
