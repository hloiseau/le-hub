<script setup lang="ts">
import type { Book, BookPage, BookLinkStatus, BookRequestPage } from '~/types/api'
const props = defineProps<{ request: BookRequestPage['items'][number], requestPage: number, catalogExpiresAt: string, disabled: boolean }>()
const emit = defineEmits<{ changed: [message: string], reload: [] }>()
const { session, capabilities, demo, refresh } = useHub()
const enabled = computed(() => !demo.value && capabilities.value?.booksCatalog && session.value.user && session.value.plexConnected)
const delivered = computed(() => props.request.status === 'fulfilled' && props.request.deliveryState === 'complete')
const open = ref(false)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const search = ref('')
const activeSearch = ref('')
const data = ref<BookPage | null>(null)
const accessExpiresAt = ref(props.catalogExpiresAt)
const now = ref(Date.now())
const accessValid = computed(() => Date.parse(accessExpiresAt.value) > now.value)
const verifiedUntil = computed(() => Date.parse(props.request.catalogMatch?.verifiedAt || '') + 5 * 60_000)
const fresh = computed(() => enabled.value && delivered.value && props.request.catalogStatus === 'available' && !!props.request.catalogMatch?.book && accessValid.value && verifiedUntil.value > now.value)
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
const date = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

function scheduleExpiry() {
  clearTimeout(timer); now.value = Date.now()
  const deadlines = [Date.parse(accessExpiresAt.value), verifiedUntil.value].filter(value => value > now.value)
  if (!deadlines.length) return
  timer = setTimeout(() => {
    now.value = Date.now()
    if (!accessValid.value) { revision++; data.value = null; loading.value = false; saving.value = false }
    scheduleExpiry()
  }, Math.min(Math.min(...deadlines) - now.value, 2_147_483_647))
}
function close() { revision++; open.value = false; data.value = null; loading.value = false; saving.value = false; search.value = ''; activeSearch.value = ''; error.value = '' }
async function failure(value: unknown) {
  error.value = apiMessage(value); data.value = null
  const response = value as { statusCode?: number, data?: { error?: { code?: string } } }
  if (response.data?.error?.code === 'books_link_required') { accessExpiresAt.value = ''; scheduleExpiry() }
  if (response.data?.error?.code === 'shelfmark_link_required') emit('reload')
  if (response.statusCode === 401 || response.statusCode === 403) { accessExpiresAt.value = ''; scheduleExpiry(); await refresh() }
}
async function load(page = 1) {
  const current = ++revision
  data.value = null; error.value = ''; loading.value = false
  if (!enabled.value || !accessValid.value || !open.value) return
  loading.value = true
  try {
    const result = await $fetch<BookPage>('/api/v1/books', { query: { q: activeSearch.value, page }, retry: 0 })
    if (current === revision) data.value = result
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) loading.value = false }
}
async function choose() {
  if (props.disabled || saving.value || !enabled.value || !delivered.value) return
  close(); open.value = true; loading.value = true
  const current = ++revision
  try {
    const status = await $fetch<BookLinkStatus>('/api/v1/books/link', { retry: 0 })
    if (current !== revision) return
    accessExpiresAt.value = status.linked ? status.expiresAt || '' : ''; scheduleExpiry()
    loading.value = false
    if (accessValid.value) await load()
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) loading.value = false }
}
function searchBooks() { activeSearch.value = search.value.trim(); void load() }
async function confirm(book: Book) {
  if (props.disabled || saving.value || loading.value || !enabled.value || !delivered.value || !data.value || !accessValid.value || !book.formats.length) return
  const current = ++revision
  saving.value = true; error.value = ''
  try {
    await $fetch(`/api/v1/book-requests/${props.request.id}/catalog-match`, { method: 'POST', retry: 0, body: { requestPage: props.requestPage, bookId: book.id, catalogPage: data.value.page, catalogQuery: activeSearch.value } })
    if (current !== revision) return
    close(); emit('changed', 'La correspondance avec votre édition Grimmory est confirmée.')
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) saving.value = false }
}
async function remove() {
  if (props.disabled || saving.value) return
  close(); const current = ++revision; saving.value = true
  try {
    await $fetch(`/api/v1/book-requests/${props.request.id}/catalog-match`, { method: 'DELETE', retry: 0 })
    if (current === revision) emit('changed', 'La correspondance a été retirée. Votre demande et votre livre sont conservés.')
  } catch (value) { if (current === revision) await failure(value) }
  finally { if (current === revision) saving.value = false }
}
watch(() => props.catalogExpiresAt, value => { accessExpiresAt.value = value; scheduleExpiry() })
watch(() => props.request.catalogMatch, scheduleExpiry, { immediate: true })
watch([enabled, () => session.value.user?.plexId, () => props.request.id], () => { close(); accessExpiresAt.value = ''; scheduleExpiry() }, { flush: 'sync' })
function visible() { if (!document.hidden) scheduleExpiry() }
onMounted(() => document.addEventListener('visibilitychange', visible))
onBeforeUnmount(() => { revision++; clearTimeout(timer); document.removeEventListener('visibilitychange', visible) })
</script>

<template>
  <div class="request-catalog">
    <template v-if="request.catalogMatch">
      <p><strong>{{ fresh ? 'Édition disponible dans votre catalogue Grimmory.' : 'Correspondance enregistrée, présence dans votre catalogue à revérifier.' }}</strong></p>
      <p class="muted">Correspondance confirmée par vous le {{ date(request.catalogMatch.confirmedAt) }}.<template v-if="request.catalogMatch.verifiedAt"> Catalogue consulté le {{ date(request.catalogMatch.verifiedAt) }}.</template> Cela ne prouve pas un import automatique depuis Shelfmark.</p>
      <BookCard v-if="fresh && request.catalogMatch.book" :book="request.catalogMatch.book" class="matched-book" />
    </template>
    <p v-else class="muted">Présence dans le catalogue Grimmory : non vérifiée.</p>
    <div class="catalog-actions">
      <button v-if="enabled && delivered" class="button secondary" :disabled="disabled || saving || loading" :aria-expanded="open" :aria-controls="`catalog-choice-${request.id}`" @click="open ? close() : choose()">{{ open ? 'Fermer le choix' : request.catalogMatch ? 'Choisir à nouveau l’édition' : 'Choisir l’édition disponible' }}</button>
      <button v-if="request.catalogMatch" class="text-button" :disabled="disabled || saving" @click="remove">Retirer la correspondance</button>
    </div>
    <div v-if="error" class="banner error-banner" role="alert">{{ error }}<button v-if="open" :disabled="disabled || saving || loading" @click="choose">Réessayer le choix</button></div>
    <section v-if="open" :id="`catalog-choice-${request.id}`" class="catalog-choice" :aria-labelledby="`catalog-title-${request.id}`">
      <h4 :id="`catalog-title-${request.id}`">Choisir l’édition pour « {{ request.title }} »</h4>
      <p>Choisissez dans votre catalogue personnel l’édition qui correspond à cette demande. Les éditions restent distinctes ; aucune n’est sélectionnée automatiquement.</p>
      <p v-if="loading" role="status">Consultation de votre catalogue…</p>
      <p v-else-if="!accessValid">Reliez votre catalogue personnel pour choisir une édition. <NuxtLink to="/livres">Gérer mon accès Grimmory</NuxtLink>, puis revenez à cette demande.</p>
      <template v-if="accessValid">
        <form class="catalog-search" @submit.prevent="searchBooks"><label>Titre, auteur, série ou ISBN<input v-model="search" type="search" maxlength="200" :disabled="disabled || saving || loading" /></label><button class="button secondary" type="submit" :disabled="disabled || saving || loading">Rechercher les éditions</button></form>
        <div v-if="data?.items.length" class="catalog-editions"><BookCard v-for="book in data.items" :key="book.id" :book="book"><button class="button primary" :disabled="disabled || saving || !book.formats.length" @click="confirm(book)">{{ saving ? 'Confirmation…' : book.formats.length ? 'Confirmer cette édition' : 'Aucun format disponible' }}</button></BookCard></div>
        <p v-else-if="data">Aucune édition accessible sur cette page. Essayez une autre recherche ou la page suivante.</p>
        <div v-if="data && (data.page > 1 || data.hasMore)" class="catalog-pagination"><button class="button secondary" :disabled="disabled || saving || loading || data.page <= 1" @click="load(data.page - 1)">Éditions précédentes</button><span>Page {{ data.page }}</span><button class="button secondary" :disabled="disabled || saving || loading || !data.hasMore || data.page >= 1001" @click="load(data.page + 1)">Éditions suivantes</button></div>
        <p class="footnote">Vous confirmez la correspondance avec cette demande. Cela ne prouve pas un import automatique depuis Shelfmark.</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.request-catalog{margin:18px 0}.request-catalog p{font-size:13px;line-height:1.7;overflow-wrap:anywhere}.catalog-actions,.catalog-pagination{display:flex;align-items:center;gap:14px;flex-wrap:wrap}.catalog-actions .button,.catalog-actions .text-button{white-space:normal;text-align:left}.catalog-choice{margin-top:20px;padding:20px;border:1px solid var(--line);border-radius:12px}.catalog-choice h4{font-size:16px;line-height:1.6;overflow-wrap:anywhere}.catalog-search{display:flex;align-items:flex-end;gap:14px;margin:20px 0}.catalog-search label{display:grid;gap:8px;flex:1;min-width:0;font-size:13px}.catalog-search input{width:100%;padding:12px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px}.catalog-editions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.catalog-pagination{margin-top:18px}.error-banner{margin-top:16px}.error-banner button{margin-left:12px}.matched-book{margin:16px 0}@media(max-width:1000px){.catalog-editions{grid-template-columns:1fr}}@media(max-width:600px){.catalog-choice{padding:14px}.catalog-search{flex-direction:column;align-items:stretch}.catalog-actions{align-items:stretch;flex-direction:column}.catalog-actions .button{width:100%}.catalog-pagination .button{padding:10px;font-size:12px}}
</style>
