<script setup lang="ts">
import type { BookLinkStatus, RecentBookPage } from '~/types/api'
const { session, ready, capabilities, demo } = useHub()
const page = ref<RecentBookPage | null>(null)
const linked = ref(false)
const loading = ref(false)
const message = ref('')
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
const enabled = computed(() => ready.value && !!session.value.user && session.value.plexConnected && capabilities.value?.recentBooks && !demo.value)
async function load(number = 1) {
  const request = ++revision
  clearTimeout(timer); page.value = null; message.value = ''; loading.value = false; linked.value = false
  if (!enabled.value) return
  loading.value = true
  try {
    const status = await $fetch<BookLinkStatus>('/api/v1/books/link', { retry: 0 })
    if (request !== revision) return
    linked.value = status.linked
    if (!status.linked) return
    const result = await $fetch<RecentBookPage>('/api/v1/books/recent', { query: { page: number }, retry: 0 })
    if (request !== revision) return
    const expires = Date.parse(result.expiresAt) - Date.now()
    if (!Number.isFinite(expires) || expires <= 0) throw new Error('La liste des livres a expiré. Actualisez-la.')
    page.value = result
    timer = setTimeout(() => { revision++; page.value = null; loading.value = false; if (document.visibilityState === 'visible') void load(number) }, Math.min(expires, 60_000))
  } catch (error) {
    if (request !== revision) return
    page.value = null; message.value = apiMessage(error)
  } finally { if (request === revision) loading.value = false }
}
function visibleAgain() { if (document.visibilityState === 'visible') void load() }
watch([enabled, () => session.value.user?.plexId], () => load(), { immediate: true })
onMounted(() => document.addEventListener('visibilitychange', visibleAgain))
onBeforeUnmount(() => { revision++; clearTimeout(timer); document.removeEventListener('visibilitychange', visibleAgain) })
</script>
<template>
  <section v-if="enabled" class="section-block recent-books" aria-labelledby="recent-books-title">
    <div class="section-heading"><div><h2 id="recent-books-title">Les derniers livres ajoutés</h2></div><NuxtLink to="/livres" class="text-link">Tous mes livres <HubIcon name="arrow" /></NuxtLink></div>
    <p v-if="loading" role="status">On ouvre votre bibliothèque…</p>
    <div v-else-if="message" role="alert" class="banner error-banner">{{ message }} <button @click="load()">Réessayer les livres</button></div>
    <p v-else-if="!linked">Reliez votre catalogue personnel dans <NuxtLink to="/livres">Livres</NuxtLink> pour découvrir ses derniers ajouts.</p>
    <template v-else-if="page">
      <div v-if="page.items.length" class="recent-book-grid">
        <article v-for="book in page.items" :key="book.id" class="recent-book"><HubIcon name="book" /><div><h3><a v-if="book.url" :href="book.url" target="_blank" rel="noopener noreferrer">{{ book.title }}</a><span v-else>{{ book.title }}</span></h3><p>{{ book.authors.join(', ') || 'Auteur non renseigné' }}</p><p v-if="book.series">{{ book.series }}<template v-if="book.volume"> · {{ book.volume }}</template></p></div></article>
      </div>
      <p v-else>Aucun livre visible sur cette page.</p>
      <div class="book-navigation"><button v-if="page.page > 1" class="button secondary" @click="load(page.page - 1)">Livres précédents</button><span>Page {{ page.page }}</span><button v-if="page.hasMore && page.page < 1001" class="button secondary" @click="load(page.page + 1)">Livres suivants</button></div>
      <p class="muted">Sélection récente Grimmory, classée selon vos préférences OPDS. Les éditions restent distinctes.</p>
    </template>
  </section>
</template>
<style scoped>
.recent-book-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(260px,100%),1fr));gap:16px}.recent-book{display:flex;gap:14px;padding:18px;border:1px solid var(--line);border-radius:16px;min-width:0}.recent-book h3{font-size:15px;margin:0 0 7px;overflow-wrap:anywhere}.recent-book p{font-size:12px;line-height:1.6;margin:0;overflow-wrap:anywhere}.recent-book svg{color:var(--accent)}.book-navigation{display:flex;align-items:center;flex-wrap:wrap;gap:14px;margin:20px 0}.recent-books>.muted{font-size:12px}
</style>
