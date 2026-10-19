<script setup lang="ts">
import { metricDate, metricLabels, metricText, type Metrics } from '~/utils/metrics'
import type { MonitoringHistory } from '~/types/api'
const props = defineProps<{ history: MonitoringHistory, metric: keyof Metrics, compact?: boolean }>()
const container = ref<HTMLElement | null>(null); const width = ref(720)
let resize: ResizeObserver | undefined
onMounted(() => { resize = new ResizeObserver(entries => { width.value = Math.max(240, entries[0]?.contentRect.width || 720) }); if (container.value) resize.observe(container.value) })
onBeforeUnmount(() => resize?.disconnect())
const from = ref(0); const to = ref(100); const selected = ref<number | null>(null)
const duration = computed(() => ({ '1h': 3600, '24h': 86400, '7d': 604800 }[props.history.range]) * 1000)
const start = computed(() => Date.parse(props.history.updatedAt) - duration.value + duration.value * from.value / 100)
const end = computed(() => Date.parse(props.history.updatedAt) - duration.value + duration.value * to.value / 100)
const points = computed(() => props.history.items.filter(p => Date.parse(p.at) >= start.value && Date.parse(p.at) <= end.value))
const maximum = computed(() => Math.max(props.history.items[0]?.values[props.metric]?.unit === 'percent' ? 100 : 1, ...points.value.map(p => p.values[props.metric]?.value ?? 0)))
const minimum = computed(() => Math.min(0, ...points.value.map(p => p.values[props.metric]?.value ?? 0)))
const axisText = (value: number) => metricText({ value, status: 'available', unit: props.history.items[0]?.values[props.metric]?.unit || 'count' })
const x = (at: string) => 48 + (Date.parse(at) - start.value) / Math.max(1, end.value - start.value) * (width.value - 70)
const plotBottom = computed(() => props.compact ? 130 : 220)
const y = (value: number) => plotBottom.value - (value - minimum.value) / (maximum.value - minimum.value) * (plotBottom.value - 25)
const axisDate = (value: number) => new Intl.DateTimeFormat('fr-FR', { ...(props.history.range === '1h' ? {} : { day: '2-digit', month: '2-digit' }), hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(new Date(value))
const paths = computed(() => {
  const groups: string[] = []; let line = ''; let previous = 0
  for (const p of points.value) {
    const m = p.values[props.metric]; const at = Date.parse(p.at)
    if (!m || m.status !== 'available' || m.value === null) { if (line) groups.push(line); line = ''; previous = 0; continue }
    if (previous && at - previous > props.history.stepSeconds * 1000 * 1.1) { if (line) groups.push(line); line = '' }
    line += `${line ? ' L' : 'M'}${x(p.at)},${y(m.value)}`; previous = at
  }
  if (line) groups.push(line)
  return groups
})
const focus = computed(() => selected.value === null ? null : points.value[selected.value])
function key(event: KeyboardEvent) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  selected.value = event.key === 'Home' ? 0 : event.key === 'End' ? points.value.length - 1 : Math.max(0, Math.min(points.value.length - 1, (selected.value ?? -1) + (event.key === 'ArrowLeft' ? -1 : 1)))
}
function zoom(edge: 'from' | 'to') {
  if (edge === 'from') from.value = Math.min(Number(from.value), Number(to.value) - 5)
  else to.value = Math.max(Number(to.value), Number(from.value) + 5)
  selected.value = null
}
watch(() => [props.history.range, props.metric], () => { from.value = 0; to.value = 100; selected.value = null })
</script>
<template>
  <div ref="container" class="metric-chart" :class="{ 'compact-chart': compact }">
    <p v-if="!compact" class="muted">Moyennes sur {{ history.stepSeconds / 60 }} minute(s). Les interruptions de collecte restent visibles.</p>
    <svg :viewBox="`0 0 ${width} ${compact ? 160 : 255}`" role="img" :tabindex="compact ? undefined : 0" :aria-label="compact ? `Tendance : ${metricLabels[metric]}` : `Historique : ${metricLabels[metric]}. Flèches gauche et droite pour parcourir les mesures.`" @keydown="key">
      <title>{{ metricLabels[metric] }}</title>
      <line x1="48" y1="25" x2="48" :y2="plotBottom" class="axis" /><line x1="48" :y1="plotBottom" :x2="width - 22" :y2="plotBottom" class="axis" />
      <line x1="48" :y1="(25 + plotBottom) / 2" :x2="width - 22" :y2="(25 + plotBottom) / 2" class="grid" />
      <text x="44" y="18">{{ axisText(maximum) }}</text><text x="40" :y="plotBottom + 4" text-anchor="end">{{ minimum }}</text>
      <path v-for="(path, index) in paths" :key="index" :d="path" class="curve" />
      <template v-for="(point, index) in points" :key="point.at">
        <circle v-if="!compact && point.values[metric]?.status === 'available' && point.values[metric]?.value !== null" :cx="x(point.at)" :cy="y(point.values[metric]!.value!)" :r="selected === index ? 5 : 3" @pointerenter="selected = index" @click="selected = index"><title>{{ metricDate(point.at) }} · {{ metricText(point.values[metric]) }}</title></circle>
      </template>
      <text x="48" :y="plotBottom + 24">{{ axisDate(start) }}</text><text :x="width - 22" :y="plotBottom + 24" text-anchor="end">{{ axisDate(end) }}</text>
    </svg>
    <p v-if="!compact" class="chart-tooltip" role="status">{{ focus ? `${metricDate(focus.at)} · ${metricText(focus.values[metric])}` : 'Touchez un point ou utilisez les flèches du clavier sur le graphique.' }}</p>
    <div v-if="!compact" class="zoom-controls"><label>Début du zoom<input v-model.number="from" type="range" min="0" max="95" step="1" @input="zoom('from')"></label><label>Fin du zoom<input v-model.number="to" type="range" min="5" max="100" step="1" @input="zoom('to')"></label><button class="button secondary compact" @click="from = 0; to = 100; selected = null">Réinitialiser le zoom</button></div>
    <p v-if="compact ? !paths.length : !points.length" class="muted">{{ compact ? 'Pas de données pour cette mesure.' : 'Aucune mesure sur cette période.' }}</p>
    <details v-if="!compact"><summary>Consulter les mesures en tableau</summary><div class="chart-table"><table><thead><tr><th>Date · Paris</th><th>{{ metricLabels[metric] }}</th></tr></thead><tbody><tr v-for="point in points" :key="point.at"><td>{{ metricDate(point.at) }}</td><td>{{ metricText(point.values[metric]) }}</td></tr></tbody></table></div></details>
  </div>
</template>
<style scoped>
.metric-chart.compact-chart svg{height:160px}.compact-chart>p{font-size:12px}
.metric-chart{min-width:0}.metric-chart svg{width:100%;height:255px;display:block;overflow:visible}.axis{stroke:var(--muted,#888);stroke-width:1}.grid{stroke:currentColor;opacity:.12}.curve{fill:none;stroke:var(--accent,#d6e795);stroke-width:2.5;vector-effect:non-scaling-stroke}circle{fill:var(--accent,#d6e795);cursor:pointer}svg text{fill:currentColor;font-size:11px}.chart-tooltip{min-height:2.8em;font-size:.9rem}.zoom-controls{display:flex;flex-wrap:wrap;gap:1rem;align-items:center}.zoom-controls label{flex:1;min-width:120px;font-size:.85rem}.zoom-controls input{display:block;width:100%;margin-top:.5rem}.chart-table{overflow:auto;max-height:320px}table{width:100%;border-collapse:collapse;font-size:.85rem}td,th{padding:.65rem;text-align:left;border-bottom:1px solid #ffffff18}details{margin-top:1rem}summary{cursor:pointer}
</style>
