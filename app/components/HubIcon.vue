<script setup lang="ts">
const props = defineProps<{ name: string }>()
const paths: Record<string, string> = {
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  requests: 'M8 3h8v4H8z M6 5H4v16h16V5h-2 M8 12h8 M8 16h5',
  book: 'M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1v15',
  server: 'M3 3h18v7H3z M3 14h18v7H3z M7 6.5h.01 M7 17.5h.01 M12 6.5h5 M12 17.5h5',
  user: 'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M4 21v-2a8 8 0 0 1 16 0v2',
  help: 'M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4 M12 18h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  external: 'M14 3h7v7 M21 3l-10 10 M10 3H3v18h18v-7',
  play: 'm8 4 12 8-12 8Z',
  download: 'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',
  chart: 'M4 20V10 M10 20V4 M16 20v-8 M22 20V7',
  spark: 'm12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  close: 'm6 6 12 12 M6 18 18 6',
  check: 'm5 12 4 4L19 6',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',
}
</script>
<template><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path :d="paths[props.name] || paths.spark" /></svg></template>
