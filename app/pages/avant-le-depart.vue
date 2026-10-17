<script setup lang="ts">
const { capabilities, demo, session } = useHub()
</script>
<template>
  <div>
  <section class="page-heading"><p class="eyebrow">NE PAS PASSER À CÔTÉ</p><h1>Avant leur départ<span>.</span></h1><p class="lede">Retrouvez les départs estimés des films et séries que vous avez déjà commencé à regarder.</p></section>
  <DepartureList />
  <ReminderInbox />
  <ExtensionRequests />
  <ExtensionRequests v-if="session.admin" admin />
  <div class="panel editorial-panel section-block"><h2>Ce que cette liste vous indique</h2><p>Elle rapproche vos lectures enregistrées dans Tautulli des retraits prévus par Maintainerr, avec vos accès Plex actuels. Une absence d’historique ne signifie jamais « non vu ».</p><p>Les demandes jamais lancées et les suivis ne sont pas encore inclus. L’état d’une saison reste incertain tant que tous ses épisodes n’ont pas été vérifiés.</p><p v-if="capabilities?.notifications && !demo" class="muted">Activez vos rappels dans Mes demandes pour retrouver ici vos lectures à reprendre.</p><p v-if="capabilities?.extensionRequests && !demo" class="muted">Vous pouvez demander un délai pour un départ affiché. Un administrateur examinera votre demande ; son enregistrement ne suspend pas le retrait.</p><p class="muted">Une date estimée ne garantit ni l’heure du retrait, ni la conservation du contenu.</p><NuxtLink to="/demandes#rappels" class="button secondary">Régler mes notifications <HubIcon name="arrow" /></NuxtLink></div>
  </div>
</template>
