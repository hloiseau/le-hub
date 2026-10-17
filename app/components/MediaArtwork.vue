<script setup lang="ts">
const props = defineProps<{ src?: string }>()
const failed = ref(false)
const safeSource = computed(() => props.src && (/^\/api\/v1\/posters\/plex\/[1-9]\d*$/.test(props.src) || /^https:\/\/image\.tmdb\.org\/t\/p\/w342\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/.test(props.src)) ? props.src : '')
watch(() => props.src, () => { failed.value = false })
</script>
<template>
  <img v-if="safeSource && !failed" :src="safeSource" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" class="media-artwork" @error="failed = true" />
  <span v-else class="media-artwork artwork-placeholder" aria-hidden="true"><HubIcon name="play" /></span>
</template>
<style scoped>
.media-artwork{display:block;width:100%;height:100%;object-fit:cover}.artwork-placeholder{display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#39334b,#242837);color:var(--muted)}.artwork-placeholder svg{width:30%;height:30%;max-width:42px;max-height:42px}
</style>
