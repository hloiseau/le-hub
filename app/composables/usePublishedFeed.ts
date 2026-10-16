export function usePublishedFeed<T extends { publishedAt: string; expiresAt: string }>(kind: 'community' | 'roadmap') {
  const { session, ready, capabilities, demo, refresh } = useHub()
  const enabled = computed(() => !demo.value && capabilities.value?.[kind] === true)
  const data = shallowRef<T | null>(null)
  const loading = ref(false)
  const error = ref('')
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  async function load() {
    const current = ++generation
    clearTimeout(timer)
    data.value = null; loading.value = false; error.value = ''
    if (!ready.value || !session.value.user || !session.value.plexConnected || !enabled.value) return
    loading.value = true
    try {
      const result = await $fetch<T>(`/api/v1/${kind}`, { retry: 0 })
      if (current !== generation) return
      const remaining = Date.parse(result.expiresAt) - Date.now()
      if (!Number.isFinite(remaining) || remaining <= 0) throw new Error('expired publication')
      data.value = result
      timer = setTimeout(() => { data.value = null; if (document.visibilityState === 'visible') void load() }, Math.min(remaining, 60_000))
    } catch (value) {
      if (current !== generation) return
      error.value = apiMessage(value)
      const status = (value as { statusCode?: number }).statusCode
      if (status === 401 || status === 403) await refresh()
    } finally { if (current === generation) loading.value = false }
  }
  function visibleAgain() { if (document.visibilityState === 'visible') void load() }
  watch([ready, enabled, () => session.value.user?.plexId, () => session.value.plexConnected], load, { immediate: true })
  onMounted(() => document.addEventListener('visibilitychange', visibleAgain))
  onBeforeUnmount(() => { generation++; clearTimeout(timer); document.removeEventListener('visibilitychange', visibleAgain) })
  return { enabled, data, loading, error, load }
}
