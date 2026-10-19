<script setup lang="ts">
const { capabilities } = useHub()
const route = useRoute()
</script>
<template>
  <nav class="section-nav" aria-label="Livres">
    <NuxtLink to="/livres" :aria-current="route.path === '/livres' ? 'page' : undefined">Catalogue</NuxtLink>
    <NuxtLink v-if="capabilities?.bookCollections" to="/collections" :aria-current="route.path === '/collections' ? 'page' : undefined">Collections</NuxtLink>
    <NuxtLink v-if="capabilities?.bookRequestTracking" to="/demandes-livres" :aria-current="route.path === '/demandes-livres' ? 'page' : undefined">Demandes de livres</NuxtLink>
    <NuxtLink to="/guides/kobo" :aria-current="route.path === '/guides/kobo' ? 'page' : undefined">Guide Kobo</NuxtLink>
  </nav>
</template>
