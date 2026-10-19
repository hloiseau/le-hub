<script setup lang="ts">
definePageMeta({ redirect: to => to.hash === '#extension-admin-heading' ? '/admin/reports' : { path: '/retraits', hash: to.hash } })
</script>
