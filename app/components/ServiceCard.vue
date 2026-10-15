<script setup lang="ts">
import type { Service } from '~/types/api'
defineProps<{ service: Service }>()
const icons: Record<string, string> = { plex: 'play', seerr: 'spark', downloadarr: 'download', 'torrent-watch': 'chart', shelfmark: 'book', grimmory: 'book' }
</script>
<template>
  <component :is="service.url ? 'a' : 'div'" class="service-card" :class="[{ unavailable: !service.url }, service.id]" :href="service.url || undefined" :target="service.url ? '_blank' : undefined" :rel="service.url ? 'noopener noreferrer' : undefined">
    <span class="service-icon"><HubIcon :name="icons[service.id] || 'spark'" /></span>
    <div><h3>{{ service.name }}</h3><p>{{ service.description }}</p></div>
    <HubIcon v-if="service.url" name="external" class="service-open" /><span v-else class="setup-tag">À connecter</span>
  </component>
</template>
