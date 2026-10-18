<script setup lang="ts">
const { capabilities, demo, session } = useHub()
</script>
<template>
  <div>
  <section class="page-heading"><p class="eyebrow">NE PAS PASSER À CÔTÉ</p><h1>Avant leur départ<span>.</span></h1><p class="lede">Les départs estimés de vos demandes, suivis et visionnages, selon vos accès et vos préférences.</p></section>
  <DepartureList />
  <ReminderInbox />
  <ExtensionRequests />
  <ExtensionRequests v-if="session.admin" admin />
  <div class="panel editorial-panel section-block"><h2>Ce que cette liste vous indique</h2><p>Les retraits prévus par Maintainerr sont rapprochés de vos demandes Seerr, de vos suivis et de vos visionnages enregistrés dans Tautulli. Seuls les contenus accessibles avec votre compte Plex sont affichés.</p><p>Une demande ou un suivi peut apparaître même si vous n’avez pas commencé à regarder. L’état « non vu » doit être confirmé par Plex ; une absence d’historique ne suffit pas. Vous pouvez aussi inclure tous vos contenus non vus dans vos préférences.</p><p v-if="capabilities?.notifications && !demo" class="muted">Activez vos rappels dans Mes demandes pour être prévenu avant les départs qui vous concernent.</p><p v-if="capabilities?.extensionRequests && !demo" class="muted">Vous pouvez demander un délai pour un départ affiché. Un administrateur examinera votre demande ; son enregistrement ne suspend pas le retrait.</p><p class="muted">Une date estimée ne garantit ni l’heure du retrait, ni la conservation du contenu.</p><NuxtLink to="/demandes#rappels" class="button secondary">Régler mes notifications <HubIcon name="arrow" /></NuxtLink></div>
  </div>
</template>
