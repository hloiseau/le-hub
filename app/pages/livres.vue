<script setup lang="ts">
import type { BookPage, BookLinkStatus, BookRequestLink } from '~/types/api'

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
let revision = 0
let requestRevision = 0
let expiryTimer: ReturnType<typeof setTimeout> | undefined

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
  data.value = null; error.value = ''; loading.value = false
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
  <section class="page-heading"><h1>Livres</h1></section>
  <BookNavigation />
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
      <BookCard v-for="book in data.items" :key="book.id" :book="book" />
    </div>
    <EmptyState v-else-if="data && !error" icon="book" title="Aucun livre sur cette page" text="Essayez un autre titre, auteur, série ou ISBN. Les droits de votre compte peuvent aussi limiter les résultats." />
    <div v-if="data && !loading && (data.page > 1 || data.hasMore)" class="pagination"><button class="button secondary" :disabled="data.page <= 1" @click="load(data.page - 1)">Page précédente</button><span>Page {{ data.page }}</span><button class="button secondary" :disabled="!data.hasMore || data.page >= 1001" @click="load(data.page + 1)">Page suivante</button></div>
    <p class="footnote">Les formats sont ceux proposés par Grimmory. Ouvrez sa fiche pour lire ou télécharger avec votre compte. Deux éditions d’un même titre restent distinctes.</p>
  </section>
  <section class="panel book-request" aria-labelledby="book-request-heading">
    <h2 id="book-request-heading">Demander un livre</h2>
    <template v-if="requestsEnabled"><p>Préparez une recherche, puis choisissez l’édition et confirmez dans Shelfmark. Ses règles d’approbation continuent de s’appliquer.</p><form class="book-form" @submit.prevent="prepareRequest"><label>Livre à demander<input v-model="requestSearch" maxlength="200" required placeholder="Titre, auteur ou ISBN" /></label><button class="button primary" type="submit" :disabled="preparing">{{ preparing ? 'Préparation…' : 'Préparer la recherche Shelfmark' }}</button></form><p v-if="requestError" class="banner error-banner" role="alert">{{ requestError }}</p><div v-if="requestLink" class="book-request-confirm" role="status"><p>{{ requestLink.message }}</p><a :href="safeRequestURL(requestLink.url)" target="_blank" rel="noopener noreferrer" class="button secondary">Choisir et confirmer dans Shelfmark <HubIcon name="external" /></a></div><p class="footnote">Aucune demande n’est créée dans Le Hub. Le suivi de la demande reste dans Shelfmark.</p></template>
    <p v-else class="muted">Le lien Shelfmark n’est pas encore configuré. L’administrateur pourra l’ajouter pour vos demandes de lecture.</p>
  </section>
  </div>
</template>

<style scoped>
.book-connection p,.book-request p{font-size:13px;line-height:1.7}.book-form{display:flex;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-top:20px}.book-form label{display:grid;gap:8px;font-size:12px;flex:1;min-width:160px}.book-form input{width:100%;max-width:none;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:12px;font-size:14px;min-height:44px}.book-form input:focus-visible{outline:2px solid var(--accent);outline-offset:3px}.book-search{margin-bottom:24px}.book-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.book-request{margin-top:32px}.book-request-confirm{margin-top:18px;padding:16px;background:var(--panel2);border-radius:8px}.pagination{flex-wrap:wrap}.book-connection .section-heading{flex-wrap:wrap;gap:12px}@media(max-width:950px){.book-grid{grid-template-columns:1fr}}@media(max-width:600px){.book-form{align-items:stretch;flex-direction:column}.book-form label{min-width:0}.book-cover{width:66px;height:99px}.book-request{padding:20px}.book-form .button,.book-request-confirm .button{white-space:normal}}
</style>
