<script setup lang="ts">
import type { Book, BookPage, BookLinkStatus, BookRequestLink } from '~/types/api'

const { session, services, capabilities, ready, demo, refresh } = useHub()
const catalogEnabled = computed(() => !demo.value && capabilities.value?.booksCatalog === true)
const requestsEnabled = computed(() => !demo.value && capabilities.value?.bookRequests === true)
const grimmory = computed(() => services.value.find(service => service.id === 'grimmory')?.url)
const shelfmark = computed(() => services.value.find(service => service.id === 'shelfmark')?.url)
const linked = ref(false)
const loading = ref(false)
const saving = ref(false)
const preparing = ref(false)
const error = ref('')
const requestError = ref('')
const feedback = ref('')
const username = ref('')
const password = ref('')
const search = ref('')
const activeSearch = ref('')
const requestSearch = ref('')
const data = ref<BookPage | null>(null)
const requestLink = ref<BookRequestLink | null>(null)
const failedCovers = ref<string[]>([])
let revision = 0
let requestRevision = 0
let expiryTimer: ReturnType<typeof setTimeout> | undefined

function safeBookURL(book: Book) {
  if (!book.url || !grimmory.value) return ''
  try {
    const base = new URL(grimmory.value); const url = new URL(book.url)
    return ['http:', 'https:'].includes(url.protocol) && url.origin === base.origin && !url.username && !url.password && url.pathname === `${base.pathname.replace(/\/$/, '')}/book/${book.id}` ? url.href : ''
  } catch { return '' }
}
function safeCover(book: Book) { return book.coverUrl === `/api/v1/books/${book.id}/cover` && /^[1-9]\d*$/.test(book.id) && !failedCovers.value.includes(book.id) ? book.coverUrl : '' }
function safeRequestURL(value: string) {
  if (!shelfmark.value) return ''
  try {
    const base = new URL(shelfmark.value); const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && url.origin === base.origin && url.pathname === base.pathname && !url.search && !url.username && !url.password ? url.href : ''
  } catch { return '' }
}
function setLink(status: BookLinkStatus) {
  clearTimeout(expiryTimer); linked.value = status.linked
  if (status.linked && status.expiresAt) {
    const delay = Date.parse(status.expiresAt) - Date.now()
    if (!Number.isFinite(delay) || delay <= 0) { linked.value = false; data.value = null; return }
    expiryTimer = setTimeout(() => { revision++; linked.value = false; data.value = null; loading.value = false; error.value = 'Votre association a expiré. Reliez vos identifiants OPDS pour continuer.' }, Math.min(delay, 2_147_483_647))
  }
}
async function failure(value: unknown) {
  error.value = apiMessage(value); data.value = null
  const status = (value as { statusCode?: number }).statusCode
  if (status === 401 || status === 403) { setLink({ linked: false }); await refresh() }
}
async function load(page = 1) {
  const current = ++revision
  data.value = null; error.value = ''; loading.value = false; failedCovers.value = []
  if (!catalogEnabled.value || !linked.value || !session.value.user) return
  loading.value = true
  try {
    const result = await $fetch<BookPage>('/api/v1/books', { query: { q: activeSearch.value, page }, retry: 0 })
    if (current === revision) data.value = result
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) loading.value = false }
}
async function initialize() {
  const current = ++revision
  requestRevision++; clearTimeout(expiryTimer)
  linked.value = false; data.value = null; requestLink.value = null; password.value = ''; username.value = ''; search.value = ''; activeSearch.value = ''; requestSearch.value = ''; error.value = ''; requestError.value = ''; feedback.value = ''; saving.value = false; loading.value = false; preparing.value = false
  if (!ready.value || !session.value.user || !session.value.plexConnected || !catalogEnabled.value) return
  loading.value = true
  try {
    const result = await $fetch<BookLinkStatus>('/api/v1/books/link', { retry: 0 })
    if (current !== revision) return
    setLink(result)
    if (linked.value) await load()
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) loading.value = false }
}
async function link() {
  if (saving.value || !catalogEnabled.value) return
  const current = ++revision
  saving.value = true; data.value = null; error.value = ''; feedback.value = ''
  try {
    const result = await $fetch<BookLinkStatus>('/api/v1/books/link', { method: 'POST', retry: 0, body: { username: username.value, password: password.value } })
    if (current !== revision) return
    password.value = ''; username.value = ''; setLink(result); feedback.value = 'Votre catalogue personnel est relié pour cette session.'; saving.value = false
    await load()
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) { password.value = ''; saving.value = false } }
}
async function unlink() {
  if (saving.value) return
  const current = ++revision
  saving.value = true; data.value = null; error.value = ''; feedback.value = ''
  try {
    await $fetch<BookLinkStatus>('/api/v1/books/link', { method: 'DELETE', retry: 0 })
    if (current !== revision) return
    setLink({ linked: false }); feedback.value = 'Votre association Grimmory a été retirée.'
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) saving.value = false }
}
function searchBooks() { activeSearch.value = search.value.trim(); void load() }
async function prepareRequest() {
  if (preparing.value || !requestsEnabled.value || !requestSearch.value.trim()) return
  const current = ++requestRevision
  requestError.value = ''; requestLink.value = null; preparing.value = true
  try {
    const result = await $fetch<BookRequestLink>('/api/v1/book-requests/link', { query: { q: requestSearch.value.trim() }, retry: 0 })
    if (current !== requestRevision) return
    if (!safeRequestURL(result.url)) throw new Error('invalid destination')
    requestLink.value = result
  } catch (value) {
    if (current !== requestRevision) return
    requestError.value = apiMessage(value)
    const status = (value as { statusCode?: number }).statusCode
    if (status === 401 || status === 403) await refresh()
  } finally { if (current === requestRevision) preparing.value = false }
}
watch(requestSearch, () => { requestRevision++; requestLink.value = null; preparing.value = false; requestError.value = '' })
watch([ready, catalogEnabled, requestsEnabled, () => session.value.user?.plexId, () => session.value.plexConnected], initialize, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { revision++; requestRevision++; clearTimeout(expiryTimer); password.value = '' })
</script>

<template>
  <div>
  <section class="page-heading"><h1>Vos livres<span>.</span></h1><p class="lede">Votre catalogue Grimmory et vos prochaines envies de lecture.</p></section>
  <p v-if="capabilities?.bookCollections"><NuxtLink to="/collections" class="button secondary">Parcourir mes collections <HubIcon name="arrow" /></NuxtLink></p>
  <p v-if="capabilities?.bookRequestTracking"><NuxtLink to="/demandes-livres" class="button secondary">Suivre mes demandes de livres <HubIcon name="arrow" /></NuxtLink></p>
  <div v-if="feedback" class="banner" role="status">{{ feedback }}</div>
  <div v-if="error" class="banner error-banner" role="alert">{{ error }}<button v-if="!saving" @click="linked ? load() : initialize()">Réessayer le catalogue</button></div>
  <section v-if="catalogEnabled" class="panel book-connection" aria-labelledby="book-connection-heading">
    <div class="section-heading"><h2 id="book-connection-heading">Votre accès Grimmory</h2><a v-if="grimmory" :href="grimmory" target="_blank" rel="noopener noreferrer" class="button secondary">Ouvrir Grimmory <HubIcon name="external" /></a></div>
    <template v-if="linked"><p>Votre catalogue est relié. Seules les bibliothèques autorisées pour votre compte OPDS sont consultées.</p><button class="button secondary" :disabled="saving" @click="unlink">Retirer mon association Grimmory</button></template>
    <template v-else>
      <p id="opds-help">Dans Grimmory, créez vos identifiants personnels dans Réglages → OPDS. Ils héritent des bibliothèques de votre compte. La permission « Access OPDS » est nécessaire.</p>
      <form class="book-form" @submit.prevent="link">
        <label>Nom d’utilisateur OPDS<input v-model="username" name="opds-username" autocomplete="off" maxlength="200" required :disabled="saving" aria-describedby="opds-help" /></label>
        <label>Mot de passe OPDS<input v-model="password" name="opds-password" type="password" autocomplete="off" maxlength="1024" required :disabled="saving" /></label>
        <button class="button primary" type="submit" :disabled="saving || loading">{{ saving ? 'Vérification…' : 'Relier mon catalogue' }}</button>
      </form>
      <p class="footnote">Utilisez vos identifiants OPDS dédiés, jamais ceux d’un compte administrateur partagé. Ils sont conservés en mémoire jusqu’à expiration ou déconnexion, puis devront être saisis à nouveau.</p>
    </template>
  </section>
  <EmptyState v-else icon="book" title="Catalogue à connecter" text="Le catalogue du Hub sera disponible une fois l’accès Grimmory configuré."><a v-if="grimmory" :href="grimmory" target="_blank" rel="noopener noreferrer" class="button secondary">Consulter Grimmory <HubIcon name="external" /></a></EmptyState>
  <section v-if="catalogEnabled && linked" class="section-block" aria-labelledby="book-catalog-heading">
    <div class="section-heading"><h2 id="book-catalog-heading">Livres et mangas</h2><button class="button secondary" :disabled="loading || saving" @click="load(data?.page || 1)">Actualiser le catalogue</button></div>
    <form class="book-form book-search" @submit.prevent="searchBooks"><label>Titre, auteur, série ou ISBN<input v-model="search" type="search" maxlength="200" :disabled="loading || saving" /></label><button class="button secondary" type="submit" :disabled="loading || saving">Rechercher les livres</button></form>
    <p v-if="loading" class="loading" role="status">Consultation de votre catalogue…</p>
    <div v-else-if="data?.items.length" class="book-grid">
      <article v-for="book in data.items" :key="book.id" class="panel book-card">
        <img v-if="safeCover(book)" :src="safeCover(book)" alt="" loading="lazy" class="book-cover" @error="failedCovers.push(book.id)" />
        <div v-else class="book-cover book-placeholder" aria-hidden="true"><HubIcon name="book" /></div>
        <div class="book-info"><h3>{{ book.title }}</h3><p v-if="book.authors.length">{{ book.authors.join(', ') }}</p><p v-if="book.series" class="muted">{{ book.series }}<span v-if="book.volume"> · Tome {{ book.volume }}</span></p><p v-if="book.isbn" class="muted">ISBN {{ book.isbn }}</p><p class="book-formats">{{ book.formats.length ? book.formats.join(' · ') : 'Aucun format proposé' }}</p><a v-if="safeBookURL(book)" :href="safeBookURL(book)" target="_blank" rel="noopener noreferrer" class="button secondary">Ouvrir dans Grimmory <HubIcon name="external" /></a></div>
      </article>
    </div>
    <EmptyState v-else-if="data && !error" icon="book" title="Aucun livre sur cette page" text="Essayez un autre titre, auteur, série ou ISBN. Les droits de votre compte peuvent aussi limiter les résultats." />
    <div v-if="data && !loading && (data.page > 1 || data.hasMore)" class="pagination"><button class="button secondary" :disabled="data.page <= 1" @click="load(data.page - 1)">Page précédente</button><span>Page {{ data.page }}</span><button class="button secondary" :disabled="!data.hasMore || data.page >= 1001" @click="load(data.page + 1)">Page suivante</button></div>
    <p class="footnote">Les formats sont ceux proposés par Grimmory. Ouvrez sa fiche pour lire ou télécharger avec votre compte. Deux éditions d’un même titre restent distinctes.</p>
  </section>
  <section class="panel book-request" aria-labelledby="book-request-heading">
    <h2 id="book-request-heading">Une envie de lecture ?</h2>
    <template v-if="requestsEnabled"><p>Préparez une recherche, puis choisissez l’édition et confirmez dans Shelfmark. Ses règles d’approbation continuent de s’appliquer.</p><form class="book-form" @submit.prevent="prepareRequest"><label>Livre à demander<input v-model="requestSearch" maxlength="200" required placeholder="Titre, auteur ou ISBN" /></label><button class="button primary" type="submit" :disabled="preparing">{{ preparing ? 'Préparation…' : 'Préparer la recherche Shelfmark' }}</button></form><p v-if="requestError" class="banner error-banner" role="alert">{{ requestError }}</p><div v-if="requestLink" class="book-request-confirm" role="status"><p>{{ requestLink.message }}</p><a :href="safeRequestURL(requestLink.url)" target="_blank" rel="noopener noreferrer" class="button secondary">Choisir et confirmer dans Shelfmark <HubIcon name="external" /></a></div><p class="footnote">Aucune demande n’est créée dans Le Hub. Le suivi de la demande reste dans Shelfmark.</p></template>
    <p v-else class="muted">Le lien Shelfmark n’est pas encore configuré. L’administrateur pourra l’ajouter pour vos demandes de lecture.</p>
  </section>
  </div>
</template>

<style scoped>
.book-connection p,.book-request p{font-size:13px;line-height:1.7}.book-form{display:flex;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-top:20px}.book-form label{display:grid;gap:8px;font-size:12px;flex:1;min-width:160px}.book-form input{width:100%;max-width:none;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:12px;font-size:14px;min-height:44px}.book-form input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.book-search{margin-bottom:24px}.book-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.book-card{display:flex;gap:18px;padding:20px;align-items:flex-start}.book-cover{width:88px;height:132px;object-fit:cover;border-radius:6px;flex-shrink:0;background:var(--panel2)}.book-placeholder{display:flex;align-items:center;justify-content:center;color:var(--muted)}.book-placeholder svg{width:30px;height:30px}.book-info{min-width:0}.book-info h3{font-size:16px;line-height:1.5;overflow-wrap:anywhere;margin:0 0 9px}.book-info p{font-size:12px;line-height:1.6;overflow-wrap:anywhere}.book-formats{font-weight:600}.book-info .button{font-size:11px;padding:10px;white-space:normal}.book-request{margin-top:32px}.book-request-confirm{margin-top:18px;padding:16px;background:var(--panel2);border-radius:8px}.pagination{flex-wrap:wrap}.book-connection .section-heading{flex-wrap:wrap;gap:12px}@media(max-width:950px){.book-grid{grid-template-columns:1fr}}@media(max-width:600px){.book-form{align-items:stretch;flex-direction:column}.book-form label{min-width:0}.book-cover{width:66px;height:99px}.book-card{gap:12px;padding:16px}.book-info .button{max-width:100%}.book-connection,.book-request{padding:20px}.book-form .button,.book-request-confirm .button{white-space:normal}}
</style>
