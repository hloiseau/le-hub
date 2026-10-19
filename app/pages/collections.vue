<script setup lang="ts">
import type { Book, BookCollectionPage } from '~/types/api'
const { session, ready, capabilities, services, demo, refresh } = useHub()
const enabled = computed(() => !demo.value && capabilities.value?.bookCollections === true)
const grimmory = computed(() => services.value.find(service => service.id === 'grimmory')?.url)
const data = ref<BookCollectionPage | null>(null)
const loading = ref(false)
const error = ref('')
const series = ref('')
const activeSeries = ref('')
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
const date = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(value))
function bookURL(book: Book) {
  if (!book.url || !grimmory.value) return ''
  try { const base = new URL(grimmory.value); const url = new URL(book.url); return ['http:', 'https:'].includes(url.protocol) && url.origin === base.origin && !url.username && !url.password && !url.search && !url.hash && url.pathname === `${base.pathname.replace(/\/$/, '')}/book/${book.id}` ? url.href : '' } catch { return '' }
}
async function load(page = 1) {
  const current = ++revision
  clearTimeout(timer); data.value = null; error.value = ''; loading.value = false
  if (!ready.value || !enabled.value || !session.value.user || !session.value.plexConnected) return
  loading.value = true
  try {
    const result = await $fetch<BookCollectionPage>('/api/v1/book-collections', { query: { series: activeSeries.value, page }, retry: 0 })
    if (current !== revision) return
    const remaining = Date.parse(result.expiresAt) - Date.now()
    if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('expired collections')
    data.value = result
    timer = setTimeout(() => { data.value = null; if (document.visibilityState === 'visible') void load(page) }, Math.min(remaining, 60_000))
  } catch (value) {
    if (current !== revision) return
    error.value = apiMessage(value)
    if ((value as { statusCode?: number }).statusCode === 401) await refresh()
  } finally { if (current === revision) loading.value = false }
}
function selectSeries(value: string) { series.value = value; activeSeries.value = value; void load() }
function visibleAgain() { if (document.visibilityState === 'visible') void load(data.value?.page || 1) }
watch([ready, enabled, () => session.value.user?.plexId, () => session.value.plexConnected], () => { series.value = ''; activeSeries.value = ''; void load() }, { immediate: true })
onMounted(() => document.addEventListener('visibilitychange', visibleAgain))
onBeforeUnmount(() => { revision++; clearTimeout(timer); document.removeEventListener('visibilitychange', visibleAgain) })
</script>

<template>
  <div>
  <section class="page-heading"><h1>Vos collections<span>.</span></h1><p class="lede">Les séries et tomes présents dans votre catalogue personnel Grimmory.</p></section>
  <div class="collection-links"><NuxtLink to="/livres" class="button secondary">Gérer mon accès et mes livres <HubIcon name="arrow" /></NuxtLink><NuxtLink to="/guides/kobo" class="button secondary">Lire sur Kobo <HubIcon name="arrow" /></NuxtLink></div>
  <EmptyState v-if="!enabled" icon="book" title="Collections à connecter" text="Les séries de votre catalogue apparaîtront après configuration de Grimmory et association de vos identifiants OPDS personnels." />
  <template v-else>
    <section class="panel collection-help"><h2>Ce que votre catalogue permet de savoir</h2><p>Chaque notice conserve son édition, sa langue et son libellé de tome lorsqu’ils sont renseignés. Deux notices de même titre restent distinctes : leur appartenance à la même œuvre n’est pas confirmée.</p><p class="muted">La liste des tomes publiés et des prochaines sorties n’est pas fournie par une référence complète. Les manques et dates de sortie restent donc inconnus ; aucun téléchargement n’est déclenché.</p><form class="collection-search" @submit.prevent="selectSeries(series.trim())"><label>Nom exact de la série<input v-model="series" maxlength="200" :disabled="loading" placeholder="Depuis une fiche Grimmory" /></label><button class="button secondary" type="submit" :disabled="loading">Consulter cette série</button><button v-if="activeSeries" class="button secondary" type="button" :disabled="loading" @click="selectSeries('')">Toutes les séries observées</button></form></section>
    <div class="section-heading collection-heading"><h2>{{ activeSeries || 'Séries observées sur cette page' }}</h2><button class="button secondary" :disabled="loading" @click="load(data?.page || 1)">Actualiser les collections</button></div>
    <p v-if="loading" role="status" class="loading">Consultation des notices autorisées…</p>
    <div v-else-if="error" role="alert" class="banner error-banner">{{ error }}<button @click="load()">Réessayer les collections</button></div>
    <template v-else-if="data">
      <section v-for="collection in data.items" :key="collection.name" class="panel collection-group"><div class="section-heading"><h2>{{ collection.name }}</h2><button v-if="!activeSeries" class="button secondary" @click="selectSeries(collection.name)">Voir cette série</button></div><div class="collection-books"><article v-for="book in collection.books" :key="book.id" class="collection-book"><h3>{{ book.title }}</h3><p v-if="book.authors.length">{{ book.authors.join(', ') }}</p><dl><div><dt>Tome · libellé source</dt><dd>{{ book.volume || 'Non renseigné' }}</dd></div><div><dt>Langue</dt><dd>{{ book.language || 'Non renseignée' }}</dd></div><div><dt>Éditeur</dt><dd>{{ book.publisher || 'Non renseigné' }}</dd></div><div><dt>Édition · ISBN</dt><dd>{{ book.isbn || 'ISBN non renseigné' }}</dd></div></dl><p class="muted">{{ book.formats.length ? book.formats.join(' · ') : 'Aucun format proposé' }} · Notice Grimmory {{ book.id }}</p><a v-if="bookURL(book)" :href="bookURL(book)" target="_blank" rel="noopener noreferrer" class="button secondary">Lire ou corriger dans Grimmory <HubIcon name="external" /></a></article></div></section>
      <EmptyState v-if="!data.items.length" icon="book" title="Aucune série sur cette page" text="Certaines notices n’ont pas de série ou ne sont pas accessibles. Parcourez la page suivante si elle est proposée, ou indiquez le nom exact d’une série." />
      <div v-if="data.page > 1 || data.hasMore" class="pagination"><button class="button secondary" :disabled="data.page <= 1" @click="load(data.page - 1)">Page précédente</button><span>Page {{ data.page }}</span><button class="button secondary" :disabled="!data.hasMore || data.page >= 1001" @click="load(data.page + 1)">Page suivante</button></div>
      <p class="footnote">Source : Grimmory OPDS, consultée le {{ date(data.fetchedAt) }}. Les séries sont regroupées d’après les notices de cette page ; il ne s’agit pas d’une bibliographie complète. Les numéros fractionnaires et libellés hors-série sont conservés tels que fournis.</p><p class="footnote">Pour corriger une série, une langue ou un numéro, ouvrez la fiche Grimmory et modifiez ses métadonnées si votre compte y est autorisé, puis actualisez cette page.</p>
    </template>
  </template>
  </div>
</template>

<style scoped>
.collection-links,.collection-search{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px}.collection-help p{font-size:13px;line-height:1.8}.collection-search{margin:20px 0 0;align-items:flex-end}.collection-search label{display:grid;gap:8px;font-size:12px;flex:1;min-width:200px}.collection-search input{width:100%;padding:12px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;font:inherit}.collection-heading{margin-top:30px;gap:20px}.collection-group{margin:20px 0}.collection-group h2{overflow-wrap:anywhere}.collection-books{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}.collection-book{padding:18px;background:var(--panel2);border-radius:10px;min-width:0}.collection-book h3{font-size:17px;line-height:1.5;overflow-wrap:anywhere}.collection-book p{font-size:12px;line-height:1.7;overflow-wrap:anywhere}.collection-book dl{font-size:12px;margin:16px 0;display:grid;gap:10px}.collection-book dl>div{display:grid;grid-template-columns:1fr 1fr;gap:10px}.collection-book dt{color:var(--muted)}.collection-book dd{margin:0;overflow-wrap:anywhere}.collection-book .button{font-size:11px;white-space:normal}.footnote{line-height:1.8}.pagination{flex-wrap:wrap}@media(max-width:750px){.collection-books{grid-template-columns:1fr}.collection-search{align-items:stretch;flex-direction:column}.collection-search label{min-width:0}.section-heading{align-items:flex-start;flex-wrap:wrap}.collection-heading h2{overflow-wrap:anywhere;max-width:100%}.collection-group{padding:18px}}
</style>
