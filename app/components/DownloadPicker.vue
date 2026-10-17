<script setup lang="ts">
import type { DownloadLibraryItem, DownloadLibraryPage } from '~/types/api'

const props = defineProps<{ disabled: boolean }>()
const emit = defineEmits<{ select: [item: DownloadLibraryItem] }>()
const { session, refresh } = useHub()
const search = ref('')
const activeSearch = ref('')
const parent = ref('')
const parents = ref<DownloadLibraryItem[]>([])
const offsets = ref([0])
const data = ref<DownloadLibraryPage | null>(null)
const loading = ref(false)
const error = ref('')
let revision = 0
let timer: ReturnType<typeof setTimeout> | undefined
const labels = { movie: 'Film', show: 'Série', season: 'Saison', episode: 'Épisode' }

function clear() {
  revision++; clearTimeout(timer); data.value = null; parents.value = []; parent.value = ''; offsets.value = [0]; loading.value = false
}
async function load() {
  const current = ++revision
  clearTimeout(timer); data.value = null; error.value = ''; loading.value = true
  try {
    const result = await $fetch<DownloadLibraryPage>('/api/v1/downloads/library', { query: { ...(parent.value ? { parent: parent.value } : { q: activeSearch.value }), offset: offsets.value.at(-1) || 0 }, retry: 0 })
    if (current !== revision) return
    const lifetime = Date.parse(result.expiresAt) - Date.now()
    if (!Number.isFinite(lifetime) || lifetime <= 0) throw new Error('expired library response')
    data.value = result
    timer = setTimeout(() => { clear(); error.value = 'La liste a expiré. Actualisez les contenus pour continuer.' }, Math.min(lifetime, 2_147_483_647))
  } catch (value) {
    if (current !== revision) return
    error.value = apiMessage(value); data.value = null
    const status = (value as { statusCode?: number }).statusCode
    if (status === 401 || status === 403) { clear(); await refresh() }
  } finally { if (current === revision) loading.value = false }
}
function searchLibrary() {
  if (props.disabled) return
  const query = search.value.trim()
  if (query.length < 2) { clear(); error.value = 'Saisissez au moins deux caractères.'; return }
  activeSearch.value = query; parent.value = ''; parents.value = []; offsets.value = [0]; void load()
}
function browse(item: DownloadLibraryItem) {
  if (props.disabled) return
  parent.value = item.ratingKey; parents.value.push(item); offsets.value = [0]; void load()
}
function back(index: number) {
  parents.value = parents.value.slice(0, index + 1); parent.value = parents.value.at(-1)?.ratingKey || ''; offsets.value = [0]; void load()
}
function next() {
  if (data.value?.nextOffset == null) return
  offsets.value.push(data.value.nextOffset); void load()
}
function previous() { offsets.value.pop(); void load() }
watch(() => session.value.user?.plexId, () => { clear(); search.value = ''; activeSearch.value = ''; parent.value = ''; error.value = '' }, { flush: 'sync' })
onBeforeUnmount(clear)
</script>

<template>
  <div class="download-picker">
    <form class="library-search" @submit.prevent="searchLibrary">
      <label>Rechercher dans ma bibliothèque Plex<input v-model="search" type="search" autocomplete="off" minlength="2" maxlength="200" required placeholder="Titre d’un film ou d’une série" :disabled="disabled" /></label>
      <button class="button secondary" type="submit" :disabled="disabled">Rechercher</button>
    </form>
    <nav v-if="parents.length" aria-label="Navigation dans la série" class="library-breadcrumbs">
      <button class="text-button" :disabled="disabled || loading" @click="back(-1)">Résultats de recherche</button>
      <template v-for="(item, index) in parents" :key="item.ratingKey"><span aria-hidden="true">/</span><button v-if="index < parents.length - 1" class="text-button" :disabled="disabled || loading" @click="back(index)">{{ item.title }}</button><span v-else aria-current="page">{{ item.title }}</span></template>
    </nav>
    <p v-if="loading" role="status" class="library-message">Recherche dans votre bibliothèque…</p>
    <div v-else-if="error" class="banner error-banner" role="alert">{{ error }}<button v-if="activeSearch || parent" :disabled="disabled" @click="load">Actualiser les contenus</button></div>
    <template v-else-if="data">
      <ul v-if="data.items.length" class="library-results">
        <li v-for="item in data.items" :key="item.ratingKey" class="library-result">
          <div><h3>{{ item.title }}</h3><p>{{ labels[item.type] }}<template v-if="item.index !== undefined"> {{ item.index }}</template><template v-if="item.year"> · {{ item.year }}</template><template v-if="item.parentTitle"> · {{ item.parentTitle }}</template></p></div>
          <div class="library-actions">
            <button v-if="item.type === 'show'" class="button secondary" :aria-label="`Voir les saisons de ${item.title}`" :disabled="disabled" @click="browse(item)">Voir les saisons <HubIcon name="arrow" /></button>
            <template v-else>
              <button class="button secondary" :aria-label="`Choisir ${item.title}${item.type === 'season' ? ' en entier' : ''}`" :disabled="disabled" @click="emit('select', item)">{{ item.type === 'season' ? 'Choisir la saison entière' : 'Choisir' }}<HubIcon name="download" /></button>
              <button v-if="item.type === 'season'" class="text-button" :aria-label="`Voir les épisodes de ${item.title}`" :disabled="disabled" @click="browse(item)">Voir les épisodes <HubIcon name="arrow" /></button>
            </template>
          </div>
        </li>
      </ul>
      <p v-else class="library-message">Aucun contenu accessible ne correspond à cette recherche.</p>
      <div v-if="offsets.length > 1 || data.nextOffset !== null" class="pagination"><button class="button secondary" :disabled="disabled || offsets.length === 1" @click="previous">Page précédente</button><span>Page {{ offsets.length }}</span><button class="button secondary" :disabled="disabled || data.nextOffset === null" @click="next">Page suivante</button></div>
    </template>
    <p v-else class="library-message muted">Recherchez un film, ou ouvrez une série pour choisir une saison ou un épisode.</p>
  </div>
</template>

<style scoped>
.library-search{display:flex;align-items:flex-end;gap:12px;margin:20px 0}.library-search label{display:grid;gap:8px;font-size:13px;flex:1;min-width:0}.library-search input{width:100%;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--panel2);color:var(--text)}.library-message{margin:18px 0}.library-breadcrumbs{display:flex;align-items:center;flex-wrap:wrap;gap:10px;font-size:12px;margin:18px 0;overflow-wrap:anywhere}.library-results{list-style:none;padding:0;margin:18px 0;border:1px solid var(--line);border-radius:10px;overflow:hidden}.library-result{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px;border-bottom:1px solid var(--line)}.library-result:last-child{border:0}.library-result>div:first-child{min-width:0}.library-result h3{font-size:15px;overflow-wrap:anywhere}.library-result p{margin-top:6px;overflow-wrap:anywhere}.library-actions{display:flex;align-items:center;gap:14px;flex-wrap:wrap;justify-content:flex-end}.library-actions .button{white-space:normal}.library-actions .text-button{white-space:normal;text-align:left}@media(max-width:700px){.library-search{align-items:stretch;flex-direction:column}.library-result{align-items:stretch;flex-direction:column;gap:14px}.library-actions{justify-content:flex-start}.library-actions .button{flex:1}}
</style>
