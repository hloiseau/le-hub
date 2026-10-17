<script setup lang="ts">
import { downloadQualityLabels, plexRatingKey, ratingKeyFromPlexLink, type DownloadQuality } from '~/utils/downloads'
import type { DownloadarrLinkStatus as LinkStatus, DownloadOptions, DownloadJob, DownloadJobs as DownloadList, DownloadLibraryItem } from '~/types/api'

// Native same-origin POSTs must preserve Origin for the API's CSRF check.
useHead({ meta: [{ name: 'referrer', content: 'same-origin' }] })

const { session, ready, capabilities, services, demo, refresh } = useHub()
const route = useRoute()
const enabled = computed(() => !demo.value && capabilities.value?.downloads === true)
const personal = computed(() => ready.value && enabled.value && !!session.value.user && session.value.plexConnected === true)
const externalService = computed(() => services.value.find(service => service.id === 'downloadarr')?.url)
const linked = ref(false)
const connecting = ref(false)
const checking = ref(false)
const creating = ref(false)
const removing = ref('')
const loadingJobs = ref(false)
const loadingOptions = ref(false)
const qualityOptions = ref<DownloadQuality[]>([])
const quality = ref<DownloadQuality | ''>('')
const season = ref(false)
const sourceLink = ref('')
const ratingKey = ref('')
const selectedTitle = ref('')
const confirmationHeading = ref<HTMLHeadingElement | null>(null)
const options = ref<DownloadOptions | null>(null)
const audio = ref('')
const subtitle = ref('')
const confirmed = ref(false)
const list = ref<DownloadList | null>(null)
const error = ref('')
const feedback = ref('')
const pending = ref(false)
const now = ref(Date.now())
let generation = 0
let optionsRevision = 0
let jobsRevision = 0
let pendingUntil = 0
let pollTimer: ReturnType<typeof setTimeout> | undefined
let flowTimer: ReturnType<typeof setTimeout> | undefined
let grantTimer: ReturnType<typeof setTimeout> | undefined
let jobsTimer: ReturnType<typeof setTimeout> | undefined
let fileTimer: ReturnType<typeof setTimeout> | undefined
let listTimer: ReturnType<typeof setTimeout> | undefined
const stageLabels = { deciding: 'Vérification du contenu', waiting: 'En attente de préparation', processing: 'Préparation en cours', finalizing: 'Finalisation du fichier', ready: 'Fichier prêt' }
const stateLabels = { preparing: 'Préparation', ready: 'Prêt à récupérer', sending: 'Transfert demandé', error: 'Préparation en erreur' }
const validChoice = computed(() => !!options.value && qualityOptions.value.includes(quality.value as DownloadQuality) && options.value.audio.some(item => item.id === audio.value) && options.value.subtitle.some(item => item.id === subtitle.value))
const busy = computed(() => creating.value || !!removing.value || connecting.value || checking.value)
function date(value: string) { return Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Date inconnue' }
function invalidateOptions() { optionsRevision++; options.value = null; audio.value = ''; subtitle.value = ''; confirmed.value = false; loadingOptions.value = false }
function stopFlow() { clearTimeout(pollTimer); clearTimeout(flowTimer); pending.value = false; pendingUntil = 0; connecting.value = false }
function clearPrivate() {
  generation++; jobsRevision++; stopFlow(); invalidateOptions()
  clearTimeout(grantTimer); clearTimeout(jobsTimer); clearTimeout(fileTimer); clearTimeout(listTimer)
  linked.value = false; list.value = null; qualityOptions.value = []; quality.value = ''; selectedTitle.value = ''; creating.value = false; removing.value = ''; loadingJobs.value = false; checking.value = false
}
function expire() { clearPrivate(); error.value = 'Votre accès Downloadarr a expiré. Actualisez votre accès pour continuer.' }
function applyLink(status: LinkStatus) {
  clearTimeout(grantTimer)
  const delay = status.expiresAt ? Date.parse(status.expiresAt) - Date.now() : 0
  qualityOptions.value = (status.qualityOptions || []).filter(value => value in downloadQualityLabels)
  linked.value = status.linked && Number.isFinite(delay) && delay > 0 && qualityOptions.value.length > 0
  if (!linked.value) { list.value = null; invalidateOptions(); return }
  if (!qualityOptions.value.includes(quality.value as DownloadQuality)) quality.value = qualityOptions.value[0] || ''
  grantTimer = setTimeout(expire, Math.min(delay, 2_147_483_647))
}
async function failure(value: unknown) {
  error.value = apiMessage(value)
  const status = (value as { statusCode?: number }).statusCode
  if (status === 401 || status === 403) { clearPrivate(); await refresh() }
}
function selectedFromRoute() {
  invalidateOptions(); sourceLink.value = ''; ratingKey.value = ''; selectedTitle.value = ''; season.value = false
  if (route.query.ratingKey === undefined) return
  const key = plexRatingKey(route.query.ratingKey)
  if (key) ratingKey.value = key
  else error.value = 'Ce lien ne désigne pas un contenu Plex valide. Copiez le lien de sa fiche dans Plex.'
}
function selectContent(item: DownloadLibraryItem) {
  if (busy.value || loadingOptions.value || item.type === 'show') return
  sourceLink.value = ''; ratingKey.value = item.ratingKey; selectedTitle.value = ''; season.value = item.type === 'season'
  void inspect()
}
async function initialize() {
  clearPrivate(); error.value = ''; feedback.value = ''; selectedFromRoute()
  if (!personal.value) return
  const current = generation; checking.value = true
  try {
    const status = await $fetch<LinkStatus>('/api/v1/downloads/link', { retry: 0 })
    if (current !== generation) return
    applyLink(status)
    if (linked.value) await loadJobs()
    else { checking.value = false; await connect() }
  } catch (value) { if (current === generation) await failure(value) }
  finally { if (current === generation) checking.value = false }
}
function schedulePoll() {
  clearTimeout(pollTimer)
  if (pending.value && document.visibilityState === 'visible') pollTimer = setTimeout(poll, 2500)
}
async function connect() {
  if (!personal.value || busy.value || pending.value) return
  const current = ++generation; connecting.value = true; error.value = ''; feedback.value = ''
  try {
    const result = await $fetch<LinkStatus>('/api/v1/downloads/link', { method: 'POST', body: {}, retry: 0 })
    if (current !== generation) return
    if (result.linked) {
      applyLink(result)
      if (!linked.value) throw new Error('invalid authorization response')
      await loadJobs(); return
    }
    const deadline = Date.parse(result.expiresAt || '')
    if (!Number.isFinite(deadline) || deadline <= Date.now()) throw new Error('invalid authorization response')
    pending.value = true; pendingUntil = Math.min(deadline, Date.now() + 5 * 60_000)
    flowTimer = setTimeout(() => { stopFlow(); error.value = 'L’activation a expiré. Vous pouvez la relancer.' }, pendingUntil - Date.now())
    await poll()
  } catch (value) { if (current === generation) { stopFlow(); await failure(value) } }
  finally { if (current === generation) connecting.value = false }
}
async function poll() {
  if (!pending.value || !personal.value || document.visibilityState !== 'visible') return
  if (Date.now() >= pendingUntil) { stopFlow(); error.value = 'L’activation a expiré. Vous pouvez la relancer.'; return }
  const current = generation
  try {
    const status = await $fetch<LinkStatus>('/api/v1/downloads/link/poll', { method: 'POST', body: {}, retry: 0 })
    if (current !== generation || !pending.value) return
    if (status.linked) {
      stopFlow(); applyLink(status)
      if (!linked.value) { error.value = 'Votre association ne permet pas de préparer un téléchargement.'; return }
      await loadJobs(); return
    }
  } catch (value) {
    if (current !== generation) return
    stopFlow(); await failure(value); return
  }
  if (current === generation) schedulePoll()
}
function scheduleJobs() {
  clearTimeout(jobsTimer)
  if (linked.value && document.visibilityState === 'visible' && list.value?.items.some(item => item.state === 'preparing' || item.state === 'sending')) jobsTimer = setTimeout(loadJobs, 5000)
}
function scheduleFileExpiry() {
  clearTimeout(fileTimer); now.value = Date.now()
  const next = Math.min(...(list.value?.items.map(item => Date.parse(item.expiresAt)).filter(time => time > now.value) || []))
  if (Number.isFinite(next)) fileTimer = setTimeout(scheduleFileExpiry, Math.min(next - now.value, 2_147_483_647))
}
async function loadJobs() {
  if (!personal.value || !linked.value || loadingJobs.value) return
  const current = generation; const request = ++jobsRevision
  clearTimeout(jobsTimer); loadingJobs.value = true
  try {
    const result = await $fetch<DownloadList>('/api/v1/downloads', { retry: 0 })
    if (current !== generation || request !== jobsRevision) return
    const lifetime = Date.parse(result.expiresAt) - Date.now()
    if (!Number.isFinite(lifetime) || lifetime <= 0) throw new Error('expired jobs snapshot')
    clearTimeout(listTimer)
    listTimer = setTimeout(() => { jobsRevision++; list.value = null; loadingJobs.value = false; clearTimeout(jobsTimer); if (document.visibilityState === 'visible' && linked.value) void loadJobs() }, Math.min(lifetime, 2_147_483_647))
    list.value = result; scheduleFileExpiry(); scheduleJobs()
  } catch (value) {
    if (current === generation && request === jobsRevision) { list.value = null; clearTimeout(fileTimer); clearTimeout(listTimer); await failure(value) }
  } finally { if (current === generation && request === jobsRevision) loadingJobs.value = false }
}
async function inspect() {
  if (!personal.value || !linked.value || busy.value || loadingOptions.value) return
  invalidateOptions(); error.value = ''; feedback.value = ''
  if (sourceLink.value.trim()) {
    const key = ratingKeyFromPlexLink(sourceLink.value)
    if (!key) { error.value = 'Copiez le lien complet d’un film, d’un épisode ou d’une saison depuis Plex.'; return }
    ratingKey.value = key; sourceLink.value = ''
  }
  if (!ratingKey.value || !qualityOptions.value.includes(quality.value as DownloadQuality)) { error.value = 'Choisissez un contenu Plex et une qualité autorisée.'; return }
  const current = generation; const request = optionsRevision; loadingOptions.value = true
  try {
    const result = await $fetch<DownloadOptions>('/api/v1/downloads/options', { query: { ratingKey: ratingKey.value, quality: quality.value, season: season.value }, retry: 0 })
    if (current !== generation || request !== optionsRevision) return
    if (result.season !== season.value || !result.audio.length || !result.subtitle.length || result.fileCount < 1) throw new Error('invalid options response')
    options.value = result; selectedTitle.value = result.title; audio.value = result.audio.find(item => item.id === 'plex')?.id || result.audio[0]?.id || ''; subtitle.value = result.subtitle.find(item => item.id === 'plex')?.id || result.subtitle[0]?.id || ''
    await nextTick()
    if (current === generation && request === optionsRevision) confirmationHeading.value?.focus()
  } catch (value) { if (current === generation && request === optionsRevision) await failure(value) }
  finally { if (current === generation && request === optionsRevision) loadingOptions.value = false }
}
async function create() {
  if (!personal.value || !linked.value || creating.value || !confirmed.value || !validChoice.value) return
  const current = generation; creating.value = true; error.value = ''; feedback.value = ''; confirmed.value = false
  try {
    const job = await $fetch<DownloadJob>('/api/v1/downloads', { method: 'POST', body: { ratingKey: ratingKey.value, quality: quality.value, season: season.value, audio: audio.value, subtitle: subtitle.value, confirmed: true }, retry: 0 })
    if (current !== generation) return
    invalidateOptions(); feedback.value = job.reused ? 'La préparation existante a été retrouvée.' : 'La préparation a été demandée. Vous pouvez suivre son état ci-dessous.'
    jobsRevision++; loadingJobs.value = false
    await loadJobs()
  } catch (value) { if (current === generation) await failure(value) }
  finally { if (current === generation) creating.value = false }
}
function jobID(id: string) { return /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id) }
function readyFile(job: DownloadJob) { return linked.value && job.state === 'ready' && jobID(job.id) && Date.parse(job.expiresAt) > now.value }
async function remove(job: DownloadJob) {
  if (!linked.value || busy.value || !jobID(job.id)) return
  const current = generation; removing.value = job.id; error.value = ''; feedback.value = ''
  try {
    await $fetch(`/api/v1/downloads/${job.id}`, { method: 'DELETE', retry: 0 })
    if (current !== generation) return
    jobsRevision++; loadingJobs.value = false
    feedback.value = 'La préparation a été retirée.'; await loadJobs()
  } catch (value) { if (current === generation) await failure(value) }
  finally { if (current === generation) removing.value = '' }
}
function visibilityChanged() {
  clearTimeout(pollTimer); clearTimeout(jobsTimer)
  if (document.visibilityState !== 'visible') return
  now.value = Date.now(); schedulePoll()
  if (linked.value) void loadJobs()
}
watch(quality, invalidateOptions, { flush: 'sync' })
watch([season, sourceLink], () => { selectedTitle.value = ''; invalidateOptions() }, { flush: 'sync' })
watch([audio, subtitle], () => { confirmed.value = false }, { flush: 'sync' })
watch(() => route.query.ratingKey, selectedFromRoute)
watch([personal, () => session.value.user?.plexId], initialize, { immediate: true, flush: 'sync' })
onMounted(() => document.addEventListener('visibilitychange', visibilityChanged))
onBeforeUnmount(() => { clearPrivate(); sourceLink.value = ''; document.removeEventListener('visibilitychange', visibilityChanged) })
</script>

<template>
  <div>
    <section class="page-heading"><p class="eyebrow">À EMPORTER</p><h1>Mes téléchargements<span>.</span></h1><p class="lede">Préparez un film, un épisode ou une saison à récupérer pour vos déplacements.</p></section>
    <div v-if="feedback" class="banner" role="status">{{ feedback }}</div>
    <div v-if="error" class="banner error-banner" role="alert">{{ error }}<button v-if="!pending" :disabled="busy || loadingJobs" @click="linked ? loadJobs() : initialize()">Actualiser mon accès</button></div>
    <EmptyState v-if="!enabled" icon="download" title="Téléchargements à connecter" text="La préparation de fichiers depuis le Hub n’est pas activée sur ce serveur."><a v-if="externalService" :href="externalService" target="_blank" rel="noopener noreferrer" class="button secondary">Ouvrir Downloadarr <HubIcon name="external" /></a></EmptyState>
    <template v-else-if="personal">
      <p class="download-access" :role="linked ? undefined : 'status'">{{ linked ? 'Accès avec votre compte Plex : seuls vos contenus autorisés et vos préparations sont affichés.' : checking || connecting || pending ? 'Activation des téléchargements avec votre compte Plex…' : 'Votre accès Plex est prêt à être actualisé.' }}</p>
      <template v-if="linked">
        <section class="panel section-block" aria-labelledby="download-selection-title">
          <h2 id="download-selection-title">Choisir un contenu</h2>
          <DownloadPicker :disabled="busy || loadingOptions" @select="selectContent" />
          <form class="download-selection" @submit.prevent="inspect">
            <details class="download-link-fallback"><summary>Utiliser un lien Plex à la place</summary><label class="source-label">Lien de la fiche Plex<input v-model="sourceLink" type="url" inputmode="url" autocomplete="off" maxlength="4096" placeholder="https://app.plex.tv/desktop/…" :disabled="creating" aria-describedby="download-source-help" /></label><p id="download-source-help" class="muted">Collez le lien d’un film, d’un épisode ou d’une saison ouvert dans Plex.</p><label>Contenu<select v-model="season" :disabled="creating"><option :value="false">Un film ou un épisode</option><option :value="true">Une saison entière (ZIP)</option></select></label></details>
            <label>Qualité<select v-model="quality" :disabled="creating"><option v-for="value in qualityOptions" :key="value" :value="value">{{ downloadQualityLabels[value] }}</option></select></label>
            <p v-if="selectedTitle && !options" class="muted">Contenu sélectionné : {{ selectedTitle }}</p>
            <button class="button secondary" type="submit" :disabled="busy || loadingOptions || (!ratingKey && !sourceLink)">{{ loadingOptions ? 'Vérification des pistes…' : 'Afficher les options' }}</button>
          </form>
          <form v-if="options" class="download-confirmation" @submit.prevent="create">
            <h3 ref="confirmationHeading" tabindex="-1">{{ options.title }}</h3><p>{{ options.type === 'season' ? 'Saison' : options.type === 'episode' ? 'Épisode' : 'Film' }} · {{ options.fileCount }} fichier{{ options.fileCount > 1 ? 's' : '' }} · {{ downloadQualityLabels[quality as DownloadQuality] }}</p>
            <div class="download-selectors"><label>Piste audio<select v-model="audio" :disabled="creating"><option v-for="item in options.audio" :key="item.id" :value="item.id">{{ item.label }}</option></select></label><label>Sous-titres<select v-model="subtitle" :disabled="creating"><option v-for="item in options.subtitle" :key="item.id" :value="item.id">{{ item.label }}</option></select></label></div>
            <p>Le fichier MP4 contient une piste audio. Les sous-titres choisis sont incrustés dans la vidéo et ne pourront pas être masqués.</p><p v-if="options.season">Les pistes proposées sont compatibles avec chaque épisode. La sélection Plex utilise le choix actuel de chaque épisode.</p>
            <label class="download-consent"><input v-model="confirmed" type="checkbox" :disabled="creating" />Je confirme la préparation de ce contenu. Le choix de pistes peut aussi modifier leur sélection dans mon compte Plex.</label>
            <button class="button primary" type="submit" :disabled="busy || !confirmed || !validChoice">{{ creating ? 'Demande en cours…' : 'Confirmer la préparation' }}</button>
          </form>
        </section>
        <section class="section-block" aria-labelledby="download-jobs-title">
          <div class="section-heading"><h2 id="download-jobs-title">Vos préparations</h2><button class="button secondary" :disabled="loadingJobs || busy" @click="loadJobs">Actualiser les préparations</button></div>
          <p class="download-note muted">Deux préparations au maximum par personne. Elles peuvent disparaître après expiration ou redémarrage de Downloadarr ; le Hub ne les recrée pas automatiquement.</p>
          <p v-if="loadingJobs && !list" class="loading" role="status">Consultation des préparations…</p>
          <div v-if="list?.items.length" class="download-jobs">
            <article v-for="job in list.items" :key="job.id" class="panel download-job">
              <h3>{{ job.title }}</h3><p>{{ job.season ? 'Saison · ZIP' : 'MP4' }} · {{ downloadQualityLabels[job.quality] }}<span v-if="job.audioLabel"> · {{ job.audioLabel }}</span><span v-if="job.subtitleLabel"> · {{ job.subtitleLabel }}</span></p>
              <p class="download-state"><strong>{{ stateLabels[job.state] || 'État inconnu' }}</strong><span v-if="job.state === 'preparing'"> · {{ stageLabels[job.stage] || 'Étape non précisée' }}</span></p>
              <template v-if="job.state === 'preparing'"><progress v-if="job.progress !== null" :value="job.progress" max="100" :aria-label="`Préparation de ${job.title}`" /><p>{{ job.progress === null ? 'Pourcentage non mesuré' : `${Math.round(job.progress)} %` }} · {{ job.readyCount }} sur {{ job.fileCount }} fichier{{ job.fileCount > 1 ? 's prêts' : ' prêt' }}</p></template>
              <p v-if="job.state === 'error'" role="alert">{{ job.error || 'La préparation a échoué. Consultez Downloadarr ou contactez l’administrateur.' }}</p>
              <p v-if="job.state === 'sending'">Le serveur a reçu une demande de transfert. Vérifiez son résultat dans les téléchargements de votre navigateur.</p>
              <p v-if="Date.parse(job.expiresAt) <= now">Cette préparation a expiré. Actualisez la liste avant toute nouvelle demande.</p>
              <p v-else class="muted">Créée le {{ date(job.createdAt) }} · expiration prévue le {{ date(job.expiresAt) }}</p>
              <div class="download-actions"><form v-if="readyFile(job)" method="post" :action="`/api/v1/downloads/${job.id}/file`" target="_blank" rel="noopener" @submit="feedback = 'Transfert demandé au navigateur. Vérifiez ses téléchargements ; vous pourrez réessayer tant que ce fichier reste prêt.'"><button class="button primary" type="submit">Récupérer le fichier <HubIcon name="download" /></button></form><button class="button secondary" :disabled="busy || !jobID(job.id)" @click="remove(job)">{{ removing === job.id ? 'Retrait…' : job.state === 'preparing' ? 'Annuler la préparation' : 'Retirer la préparation' }}</button></div>
            </article>
          </div>
          <EmptyState v-else-if="list" icon="download" title="Aucune préparation en cours" text="Choisissez un contenu et confirmez ses options pour le préparer." />
          <p v-if="list" class="footnote">État vérifié le {{ date(list.checkedAt) }}. Les préparations actives sont actualisées lorsque cette page est visible. Un fichier prêt n’est pas encore un fichier enregistré sur votre appareil.</p>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.download-access{font-size:13px;line-height:1.8;color:var(--muted)}
.download-link-fallback{border-top:1px solid var(--line);padding-top:18px}.download-link-fallback summary{font-size:12px;color:var(--muted);cursor:pointer}.download-link-fallback label,.download-link-fallback p{margin-top:16px}.download-link-fallback p{font-size:12px}
.download-access p,.download-note,.download-confirmation p,.download-job p{font-size:13px;line-height:1.8;margin:12px 0}.download-access .button{margin-top:12px}.download-selection{display:grid;gap:18px;margin-top:20px}.download-selection label,.download-selectors label{display:grid;gap:8px;font-size:13px}.download-selection input{width:100%;min-width:0;padding:12px;border:1px solid var(--line);border-radius:8px;background:var(--panel2);color:var(--text)}.download-selection>p{font-size:12px;margin:0}.download-selectors{display:grid;grid-template-columns:1fr 1fr;gap:18px}.download-selectors select{width:100%;max-width:none;font-size:13px}.download-selection>.button{justify-self:start}.download-confirmation{margin-top:28px;padding-top:24px;border-top:1px solid var(--line)}.download-confirmation h3,.download-job h3{font-size:20px;overflow-wrap:anywhere}.download-consent{display:flex;align-items:flex-start;gap:12px;margin:22px 0;font-size:13px;line-height:1.7}.download-consent input{width:20px;height:20px;flex-shrink:0;margin-top:2px}.download-jobs{display:grid;gap:18px;margin-top:20px}.download-state{margin-top:20px!important}.download-job progress{width:100%;height:14px;accent-color:var(--purple)}.download-job p{overflow-wrap:anywhere}.download-actions{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-top:18px}.download-actions form{margin:0}@media(max-width:700px){.download-selectors{grid-template-columns:1fr}.download-access .section-heading{align-items:flex-start}.download-actions{align-items:stretch;flex-direction:column}.download-actions .button{width:100%}.download-confirmation>.button{white-space:normal}}
</style>
