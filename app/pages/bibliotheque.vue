<script setup lang="ts">const { services } = useHub()</script>
<template>
  <div><section class="page-heading"><h1>Votre bibliothèque<span>.</span></h1><p class="lede">Catalogue et demandes de livres.</p></section><div class="services-grid two-columns"><ServiceCard v-for="service in services.filter(s => s.category === 'read')" :key="service.id" :service="service" /></div><section class="panel section-block"><h2>Votre catalogue personnel</h2><p>Reliez vos identifiants OPDS Grimmory pour rechercher vos livres et mangas. Préparez aussi une recherche à confirmer dans Shelfmark.</p><NuxtLink to="/livres" class="button primary">Consulter mes livres <HubIcon name="arrow" /></NuxtLink> <NuxtLink to="/collections" class="button secondary">Mes collections <HubIcon name="arrow" /></NuxtLink> <NuxtLink to="/guides/kobo" class="button secondary">Guide Kobo <HubIcon name="arrow" /></NuxtLink></section>
  </div>
</template>
