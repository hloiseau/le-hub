<script setup lang="ts">
import type { CommunityPage } from '~/types/api'
const { enabled, data, loading, error, load } = usePublishedFeed<CommunityPage>('community')
const labels = { open: 'Ouvert', planned: 'Prévu', in_progress: 'En cours', resolved: 'Résolu', declined: 'Non retenu' }
const date = (value: string) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Paris' }).format(new Date(value))
</script>

<template>
  <div>
  <section class="page-heading"><h1>La communauté<span>.</span></h1><p class="lede">Les propositions et problèmes sélectionnés pour les membres du Hub.</p></section>
  <EmptyState v-if="!enabled" icon="spark" title="La communauté arrive bientôt" text="Les sujets seront visibles quand une sélection sera publiée par votre serveur." />
  <template v-else>
    <section class="panel community-intro"><h2>Une discussion, un seul vote</h2><p>Les discussions, votes et statuts restent dans Discord. Ouvrez le fil avec votre compte Discord pour participer ; Le Hub ne crée aucun vote supplémentaire.</p><p class="muted">Cette sélection est publiée après validation. Elle ne constitue pas une lecture en direct des salons Discord.</p><div class="community-buttons"><button class="button secondary" :disabled="loading" @click="load">Actualiser la communauté</button><NuxtLink to="/roadmap" class="button secondary">Voir la roadmap <HubIcon name="arrow" /></NuxtLink></div></section>
    <p v-if="loading" class="loading" role="status">Chargement de la sélection…</p>
    <div v-else-if="error" class="banner error-banner" role="alert">{{ error }}<button @click="load">Réessayer la communauté</button></div>
    <template v-else-if="data">
      <div v-if="data.items.length" class="community-list"><article v-for="item in data.items" :key="item.id" class="panel community-thread"><div><p class="eyebrow">{{ item.kind === 'proposal' ? 'Proposition' : 'Problème' }}</p><h2>{{ item.title }}</h2><div class="community-status"><span class="status-badge" :class="item.status === 'resolved' ? 'available' : item.status === 'declined' ? 'declined' : 'pending'">{{ labels[item.status] }}</span><span v-if="item.archived" class="status-badge">Archivé</span></div><p class="muted">Vérifié le {{ date(item.updatedAt) }}</p></div><a :href="item.url" target="_blank" rel="noopener noreferrer" class="button secondary">{{ item.archived ? 'Consulter dans Discord' : 'Discuter et voter dans Discord' }} <HubIcon name="external" /></a></article></div>
      <EmptyState v-else icon="spark" title="Aucun sujet publié" text="Les nouveaux sujets apparaîtront ici après leur sélection." />
      <p class="footnote">Sélection publiée le {{ date(data.publishedAt) }}. Un salon retiré de la publication disparaît à l’actualisation.</p>
    </template>
  </template>
  </div>
</template>

<style scoped>
.community-intro p{font-size:13px;line-height:1.8;margin:14px 0}.community-buttons,.community-status{display:flex;gap:12px;flex-wrap:wrap}.community-list{display:grid;gap:16px;margin-top:24px}.community-thread{display:flex;align-items:center;justify-content:space-between;gap:24px}.community-thread>div{min-width:0}.community-thread h2{font-size:20px;line-height:1.5;overflow-wrap:anywhere}.community-thread .muted{font-size:11px;margin-top:12px}.community-thread .button{flex-shrink:0}.community-status .status-badge{display:inline-block}.footnote{margin-top:20px}@media(max-width:700px){.community-thread{flex-direction:column;align-items:flex-start}.community-thread .button{white-space:normal}}
</style>
