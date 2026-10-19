<script setup lang="ts">
const { capabilities, demo } = useHub()
</script>
<template>
  <div>
  <section class="page-heading page-heading-actions"><h1>Retraits prévus</h1><NuxtLink v-if="capabilities?.notifications && !demo" to="/compte#rappels" class="button secondary">Régler mes notifications <HubIcon name="arrow" /></NuxtLink></section>
  <DepartureList />
  <ReminderInbox />
  <ExtensionRequests />
  <details class="panel section-block contextual-help"><summary>Comment sont déterminés les départs ?</summary><p>Les retraits prévus par Maintainerr sont rapprochés de vos demandes Seerr, de vos suivis et de vos visionnages enregistrés dans Tautulli. Seuls les contenus accessibles avec votre compte Plex sont affichés.</p><p>Une demande ou un suivi peut apparaître même si vous n’avez pas commencé à regarder. L’état « non vu » doit être confirmé par Plex ; une absence d’historique ne suffit pas. Vous pouvez aussi inclure tous vos contenus non vus dans vos préférences.</p><p v-if="capabilities?.notifications && !demo" class="muted">Activez vos rappels dans Mon compte pour être prévenu avant les départs qui vous concernent.</p><p v-if="capabilities?.extensionRequests && !demo" class="muted">Vous pouvez demander un délai pour un départ affiché. Un administrateur examinera votre demande ; son enregistrement ne suspend pas le retrait.</p><p class="muted">Une date estimée ne garantit ni l’heure du retrait, ni la conservation du contenu.</p></details>
  </div>
</template>
