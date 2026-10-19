<script setup lang="ts">
import type { RoadmapPage } from '~/types/api'
const { enabled, data, loading, error, load } = usePublishedFeed<RoadmapPage>('roadmap')
const labels = { planned: 'Prévu', in_progress: 'En cours', delivered: 'Livré' }
const titles = computed(() => new Map(data.value?.items.map(item => [item.id, item.title]) || []))
const date = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeZone: 'Europe/Paris' }).format(new Date(value.length === 10 ? `${value}T00:00:00Z` : value))
</script>

<template>
  <div>
  <section class="page-heading"><h1>La roadmap<span>.</span></h1><p class="lede">Ce qui est prévu, en cours et livré, dans la sélection publiée pour les membres du Hub.</p></section>
  <EmptyState v-if="!enabled" icon="spark" title="La roadmap arrive bientôt" text="Les évolutions apparaîtront quand une sélection sera publiée par votre serveur." />
  <template v-else>
    <div class="section-heading"><p class="muted roadmap-intro">Les dates apparaissent uniquement lorsqu’elles sont confirmées. Les discussions privées et les détails d’administration ne font pas partie de cette sélection.</p><button class="button secondary" :disabled="loading" @click="load">Actualiser la roadmap</button></div>
    <p v-if="loading" class="loading" role="status">Chargement de la roadmap…</p>
    <div v-else-if="error" class="banner error-banner" role="alert">{{ error }}<button @click="load">Réessayer la roadmap</button></div>
    <template v-else-if="data">
      <div v-if="data.items.length" class="roadmap-list"><article v-for="item in data.items" :id="`step-${item.id}`" :key="item.id" class="panel roadmap-item"><span class="status-badge" :class="item.status === 'delivered' ? 'available' : item.status === 'in_progress' ? 'processing' : 'pending'">{{ labels[item.status] }}</span><h2>{{ item.title }}</h2><p v-if="item.summary">{{ item.summary }}</p><p v-if="item.confirmedDate" class="confirmed-date">Date confirmée : <time :datetime="item.confirmedDate">{{ date(item.confirmedDate) }}</time></p><div v-if="item.dependencies.length" class="dependencies"><h3>Étapes nécessaires</h3><ul><li v-for="id in item.dependencies" :key="id"><a v-if="titles.has(id)" :href="`#step-${id}`">{{ titles.get(id) }}</a></li></ul></div><div v-if="item.discussionUrl || item.issueUrl" class="roadmap-links"><a v-if="item.discussionUrl" :href="item.discussionUrl" target="_blank" rel="noopener noreferrer" class="button secondary">La proposition dans Discord <HubIcon name="external" /></a><a v-if="item.issueUrl" :href="item.issueUrl" target="_blank" rel="noopener noreferrer" class="button secondary">Consulter sur GitHub <HubIcon name="external" /></a></div></article></div>
      <EmptyState v-else icon="spark" title="Aucune étape publiée" text="Les étapes confirmées apparaîtront ici après leur sélection." />
      <p class="footnote">Sélection publiée le {{ date(data.publishedAt) }}. Les statuts suivent la publication approuvée, sans calendrier déduit.</p>
    </template>
    <NuxtLink to="/communaute" class="button secondary">Retrouver la communauté <HubIcon name="arrow" /></NuxtLink>
  </template>
  </div>
</template>

<style scoped>
.roadmap-intro{font-size:13px;line-height:1.8;max-width:620px}.roadmap-list{display:grid;gap:16px}.roadmap-item{scroll-margin-top:90px}.roadmap-item h2{font-size:21px;line-height:1.5;margin:18px 0 12px;overflow-wrap:anywhere}.roadmap-item p{font-size:13px;line-height:1.8;overflow-wrap:anywhere}.roadmap-item .status-badge{display:inline-block}.dependencies{font-size:12px;margin:18px 0}.dependencies h3{font-size:12px}.dependencies ul{padding-left:20px;line-height:2}.dependencies a{text-decoration:underline}.roadmap-links{display:flex;flex-wrap:wrap;gap:12px;margin-top:20px}.footnote{margin:20px 0}@media(max-width:700px){.section-heading{align-items:flex-start;flex-direction:column;gap:12px}.roadmap-links .button{white-space:normal}}
</style>
