<script setup lang="ts">
const { session, capabilities } = useHub()
</script>
<template>
  <div>
    <section class="page-heading"><h1>Demandes de report</h1><p class="lede">Demandes des membres pour conserver un contenu plus longtemps.</p></section>
    <template v-if="session.admin && capabilities?.extensionRequests">
      <p class="inline-notice">Enregistrer une réponse ne change pas la date de suppression. Le report doit être appliqué séparément dans Maintainerr.</p>
      <ExtensionRequests admin />
    </template>
    <EmptyState v-else icon="requests" title="Accès administrateur requis" text="Cette file est réservée aux administrateurs du serveur." />
  </div>
</template>
