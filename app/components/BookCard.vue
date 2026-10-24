<script setup lang="ts">
import type { Book } from '~/types/api'
const props = defineProps<{ book: Book }>()
const { services } = useHub()
const failedCover = ref(false)
const cover = computed(() => props.book.coverUrl === `/api/v1/books/${props.book.id}/cover` && /^[1-9]\d*$/.test(props.book.id) && !failedCover.value ? props.book.coverUrl : '')
const destination = computed(() => {
  const grimmory = services.value.find(service => service.id === 'grimmory')?.url
  if (!props.book.url || !grimmory) return ''
  try {
    const base = new URL(grimmory); const url = new URL(props.book.url)
    return ['http:', 'https:'].includes(url.protocol) && url.origin === base.origin && !url.username && !url.password && !url.search && !url.hash && url.pathname === `${base.pathname.replace(/\/$/, '')}/book/${props.book.id}` ? url.href : ''
  } catch { return '' }
})
watch(() => props.book, () => { failedCover.value = false })
</script>

<template>
  <article class="panel book-card">
    <img v-if="cover" :src="cover" alt="" loading="lazy" class="book-cover" @error="failedCover = true" />
    <div v-else class="book-cover book-placeholder" aria-hidden="true"><HubIcon name="book" /></div>
    <div class="book-info">
      <h3>{{ book.title }}</h3><p v-if="book.authors.length">{{ book.authors.join(', ') }}</p>
      <p v-if="book.series" class="muted">{{ book.series }}<span v-if="book.volume"> · Tome {{ book.volume }}</span></p>
      <p v-if="book.language || book.publisher" class="muted">{{ [book.language, book.publisher].filter(Boolean).join(' · ') }}</p>
      <p v-if="book.isbn" class="muted">ISBN {{ book.isbn }}</p>
      <p class="book-formats">{{ book.formats.length ? book.formats.join(' · ') : 'Aucun format proposé' }}</p>
      <div class="book-actions"><slot /><a v-if="destination" :href="destination" target="_blank" rel="noopener noreferrer" class="button secondary">Ouvrir dans Grimmory <HubIcon name="external" /></a></div>
    </div>
  </article>
</template>

<style scoped>
.book-card{display:flex;gap:18px;padding:20px;align-items:flex-start}.book-cover{width:88px;height:132px;object-fit:cover;border-radius:6px;flex-shrink:0;background:var(--panel2)}.book-placeholder{display:flex;align-items:center;justify-content:center;color:var(--muted)}.book-placeholder svg{width:30px;height:30px}.book-info{min-width:0}.book-info h3{font-size:16px;line-height:1.5;overflow-wrap:anywhere;margin:0 0 9px}.book-info p{font-size:12px;line-height:1.6;overflow-wrap:anywhere}.book-formats{font-weight:600}.book-actions{display:flex;flex-wrap:wrap;gap:10px}.book-actions :deep(.button){font-size:11px;padding:10px;white-space:normal}@media(max-width:600px){.book-cover{width:66px;height:99px}.book-card{gap:12px;padding:16px}.book-actions :deep(.button){max-width:100%}}
</style>
