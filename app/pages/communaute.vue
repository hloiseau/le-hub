<script setup lang="ts">
import type { RoadmapPage } from '~/types/api'
const route = useRoute()
const { capabilities } = useHub()
const roadmapFeed = usePublishedFeed<RoadmapPage>('roadmap')
const hasRoadmap = computed(() => !!roadmapFeed.data.value?.items.length)
const roadmap = computed(() => route.query.vue === 'roadmap' || (!capabilities.value?.community && hasRoadmap.value))
</script>
<template>
  <div>
    <section class="page-heading"><h1>Communauté</h1></section>
    <nav class="section-nav" aria-label="Communauté">
      <NuxtLink v-if="capabilities?.community || !capabilities?.roadmap" to="/communaute" :aria-current="!roadmap ? 'page' : undefined">Discussions</NuxtLink>
      <NuxtLink v-if="hasRoadmap" to="/communaute?vue=roadmap" :aria-current="roadmap ? 'page' : undefined">Roadmap</NuxtLink>
    </nav>
    <CommunityRoadmap v-if="roadmap" :enabled="roadmapFeed.enabled.value" :data="roadmapFeed.data.value" :loading="roadmapFeed.loading.value" :error="roadmapFeed.error.value" @reload="roadmapFeed.load" />
    <CommunityTopics v-else />
  </div>
</template>
