<script setup lang="ts">defineProps<{ title: string; text: string; icon?: string }>()</script>
<template><div class="empty-state"><span class="empty-icon"><HubIcon :name="icon || 'spark'" /></span><h3>{{ title }}</h3><p>{{ text }}</p><slot /></div></template>
