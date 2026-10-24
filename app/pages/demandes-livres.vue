<script setup lang="ts">
import type { BookRequestPage, BookLinkStatus } from '~/types/api'

const { session, services, capabilities, ready, demo, refresh } = useHub()
const enabled = computed(() => !demo.value && capabilities.value?.bookRequestTracking === true)
const shelfmark = computed(() => services.value.find(service => service.id === 'shelfmark')?.url)
const linked = ref(false)
const loading = ref(false)
const saving = ref(false)
const username = ref('')
const password = ref('')
const error = ref('')
const feedback = ref('')
const data = ref<BookRequestPage | null>(null)
const catalogExpiresAt = ref('')
let revision = 0
let expiryTimer: ReturnType<typeof setTimeout> | undefined
const requestLabels: Record<string, string> = { pending: 'En attente de validation', fulfilled: 'Demande prise en charge', rejected: 'Demande refusée', cancelled: 'Demande annulée' }
const deliveryLabels: Record<string, string> = { none: 'Aucune livraison signalée', queued: 'En file d’attente', resolving: 'Préparation de la livraison', locating: 'Recherche du fichier', downloading: 'Téléchargement en cours', complete: 'Livraison terminée dans Shelfmark', error: 'Échec de livraison', cancelled: 'Livraison annulée' }
function date(value: string) { return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) }
function setLink(status: BookLinkStatus) {
  clearTimeout(expiryTimer); linked.value = status.linked
  if (status.linked) {
    const delay = status.expiresAt ? Date.parse(status.expiresAt) - Date.now() : 0
    if (!Number.isFinite(delay) || delay <= 0) { linked.value = false; data.value = null; return }
    expiryTimer = setTimeout(() => { revision++; linked.value = false; data.value = null; loading.value = false; saving.value = false; error.value = 'Votre association a expiré. Reliez à nouveau votre compte Shelfmark.' }, Math.min(delay, 2_147_483_647))
  }
}
async function failure(value: unknown) {
  error.value = apiMessage(value); data.value = null
  const status = (value as { statusCode?: number }).statusCode
  if (status === 401 || status === 403) { setLink({ linked: false }); await refresh() }
}
async function load(page = 1) {
  const current = ++revision
  data.value = null; catalogExpiresAt.value = ''; error.value = ''; loading.value = false
  if (!enabled.value || !linked.value || !session.value.user) return
  loading.value = true
  try {
    const result = await $fetch<BookRequestPage>('/api/v1/book-requests', { query: { page }, retry: 0 })
    if (current !== revision) return
    let catalogLink: BookLinkStatus | undefined
    if (result.items.some(item => item.catalogMatch)) {
      try { catalogLink = await $fetch<BookLinkStatus>('/api/v1/books/link', { retry: 0 }) } catch { /* Hide catalog details when personal access cannot be checked. */ }
    }
    if (current === revision) { catalogExpiresAt.value = catalogLink?.linked ? catalogLink.expiresAt || '' : ''; data.value = result }
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) loading.value = false }
}
async function initialize() {
  const current = ++revision
  clearTimeout(expiryTimer); linked.value = false; data.value = null; username.value = ''; password.value = ''; loading.value = false; saving.value = false; error.value = ''; feedback.value = ''
  if (!ready.value || !enabled.value || !session.value.user || !session.value.plexConnected) return
  loading.value = true
  try {
    const status = await $fetch<BookLinkStatus>('/api/v1/book-requests/link-session', { retry: 0 })
    if (current !== revision) return
    setLink(status)
    if (linked.value) await load()
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) loading.value = false }
}
async function link() {
  if (saving.value || !enabled.value || !session.value.user) return
  const current = ++revision
  saving.value = true; data.value = null; error.value = ''; feedback.value = ''
  try {
    const status = await $fetch<BookLinkStatus>('/api/v1/book-requests/link-session', { method: 'POST', body: { username: username.value, password: password.value }, retry: 0 })
    if (current !== revision) return
    password.value = ''; username.value = ''; setLink(status); saving.value = false; feedback.value = 'Votre compte Shelfmark est relié pour cette session.'
    await load()
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) { password.value = ''; saving.value = false } }
}
async function unlink() {
  if (saving.value) return
  const current = ++revision
  saving.value = true; data.value = null; error.value = ''; feedback.value = ''
  try {
    await $fetch<BookLinkStatus>('/api/v1/book-requests/link-session', { method: 'DELETE', retry: 0 })
    if (current !== revision) return
    setLink({ linked: false }); feedback.value = 'Votre association Shelfmark a été retirée.'
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) saving.value = false }
}
function catalogChanged(message: string) { feedback.value = message; void load(data.value?.page || 1) }
watch([ready, enabled, () => session.value.user?.plexId, () => session.value.plexConnected], initialize, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { revision++; clearTimeout(expiryTimer); password.value = ''; username.value = '' })
</script>

<template>
  <div>
  <section class="page-heading"><h1>Demandes de livres<span>.</span></h1><p class="lede">Les étapes signalées par votre compte personnel Shelfmark.</p></section>
  <BookNavigation />
  <div v-if="feedback" class="banner" role="status">{{ feedback }}</div>
  <div v-if="error" class="banner error-banner" role="alert">{{ error }}<button :disabled="saving || loading" @click="linked ? load() : initialize()">Réessayer</button></div>
  <section v-if="enabled && session.user" class="panel" aria-labelledby="shelfmark-heading">
    <div class="section-heading"><h2 id="shelfmark-heading">Votre accès Shelfmark</h2><a v-if="shelfmark" :href="shelfmark" target="_blank" rel="noopener noreferrer" class="button secondary">Ouvrir Shelfmark <HubIcon name="external" /></a></div>
    <template v-if="linked"><p>Cette consultation affiche uniquement les demandes de votre compte.</p><button class="button secondary" :disabled="saving" @click="unlink">Retirer mon association Shelfmark</button></template>
    <template v-else>
      <p id="shelfmark-help">Utilisez votre connexion locale Shelfmark. Les connexions via un fournisseur externe ou un proxy restent disponibles directement dans Shelfmark.</p>
      <form class="tracking-form" @submit.prevent="link">
        <label>Nom d’utilisateur Shelfmark<input v-model="username" name="shelfmark-username" autocomplete="off" maxlength="200" required :disabled="saving" aria-describedby="shelfmark-help" /></label>
        <label>Mot de passe Shelfmark<input v-model="password" name="shelfmark-password" autocomplete="off" type="password" maxlength="1024" required :disabled="saving" /></label>
        <button class="button primary" type="submit" :disabled="saving || loading">{{ saving ? 'Vérification…' : 'Relier mon compte Shelfmark' }}</button>
      </form>
      <p class="footnote">Le mot de passe sert uniquement à cette connexion. La session est conservée en mémoire jusqu’à expiration ou déconnexion. Utilisez votre compte personnel.</p>
    </template>
  </section>
  <EmptyState v-else icon="book" title="Suivi Shelfmark à connecter" text="Connectez-vous au Hub et utilisez une instance Shelfmark configurée pour consulter vos demandes."><a v-if="shelfmark" :href="shelfmark" target="_blank" rel="noopener noreferrer" class="button secondary">Consulter Shelfmark <HubIcon name="external" /></a></EmptyState>
  <section v-if="enabled && linked" class="section-block" aria-labelledby="requests-heading">
    <div class="section-heading"><h2 id="requests-heading">Vos demandes</h2><button class="button secondary" :disabled="loading || saving" @click="load(data?.page || 1)">Actualiser les demandes</button></div>
    <p class="banner">Une livraison terminée dans Shelfmark ne confirme pas l’import dans Grimmory. Vérifiez votre catalogue avant de commencer la lecture.</p>
    <p v-if="loading" class="loading" role="status">Consultation de vos demandes…</p>
    <div v-else-if="data?.items.length" class="request-list">
      <article v-for="item in data.items" :key="item.id" class="panel request-card">
        <h3>{{ item.title }}</h3><p v-if="item.authors.length" class="muted">{{ item.authors.join(', ') }}</p>
        <p><strong>{{ requestLabels[item.status] || 'État inconnu' }}</strong> · {{ deliveryLabels[item.deliveryState] || 'Livraison non vérifiée' }}</p>
        <BookRequestCatalog :request="item" :request-page="data.page" :catalog-expires-at="catalogExpiresAt" :disabled="saving || loading" @changed="catalogChanged" @reload="load(data?.page || 1)" />
        <dl><div><dt>Demande créée</dt><dd>{{ date(item.createdAt) }}</dd></div><div v-if="item.reviewedAt"><dt>Décision Shelfmark</dt><dd>{{ date(item.reviewedAt) }}</dd></div><div v-if="item.deliveryUpdatedAt"><dt>Dernier état de livraison</dt><dd>{{ date(item.deliveryUpdatedAt) }}</dd></div></dl>
      </article>
    </div>
    <EmptyState v-else-if="data" icon="book" title="Aucune demande sur cette page" text="Les demandes confirmées dans Shelfmark apparaîtront ici. Un téléchargement direct peut ne pas créer de demande." />
    <div v-if="data" class="request-pagination"><button class="button secondary" :disabled="loading || saving || data.page <= 1" @click="load(data.page - 1)">Page précédente</button><span>Page {{ data.page }}</span><button class="button secondary" :disabled="loading || saving || !data.hasMore || data.page >= 1001" @click="load(data.page + 1)">Page suivante</button></div>
    <p v-if="data" class="footnote">Vérifié le {{ date(data.checkedAt) }}. Actualisation à votre demande.</p>
  </section>
  </div>
</template>

<style scoped>
.tracking-form{display:grid;grid-template-columns:1fr 1fr auto;align-items:end;gap:1rem;margin:1.5rem 0}.tracking-form label{display:grid;gap:.5rem}.tracking-form input{min-width:0;width:100%}.request-list{display:grid;gap:1rem}.request-card h3{overflow-wrap:anywhere}.request-card dl{display:flex;gap:1.5rem;flex-wrap:wrap;font-size:.85rem}.request-card dt{color:var(--muted);margin-bottom:.3rem}.request-card dd{margin:0}.request-pagination{display:flex;justify-content:space-between;align-items:center;gap:.75rem;margin-top:1.5rem;flex-wrap:wrap}.error-banner button{margin-left:1rem}@media(max-width:700px){.tracking-form{grid-template-columns:1fr}.request-card dl{display:grid;gap:.8rem}.request-pagination .button{padding:.7rem}.section-heading{flex-wrap:wrap;gap:1rem}}
</style>
