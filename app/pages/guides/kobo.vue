<script setup lang="ts">
const { services } = useHub()
const grimmory = computed(() => services.value.find(service => service.id === 'grimmory')?.url)
</script>

<template>
  <div>
  <section class="page-heading"><p class="eyebrow">VOTRE LECTURE VOUS SUIT</p><h1>Lire sur Kobo<span>.</span></h1><p class="lede">L’intégration native Grimmory, avec votre compte personnel.</p></section>
  <section class="panel kobo-guide"><h2>Vérifier l’intégration disponible</h2><p>La version installée et la configuration Kobo ne sont pas vérifiées par Le Hub. Suivez ces étapes seulement si votre Grimmory propose Réglages → Appareils → Kobo. Aucun état de synchronisation n’est affiché ici.</p><ol><li>Ouvrez Grimmory. Votre compte doit disposer de la permission Kobo Sync ; votre liseuse doit être connectée à un compte Kobo.</li><li>Dans Réglages → Appareils, récupérez votre jeton personnel. Gardez-le dans Grimmory et votre liseuse, sans le saisir dans Le Hub.</li><li>Branchez la liseuse en USB et sauvegardez son fichier <code>.kobo/Kobo/Kobo eReader.conf</code>. Suivez le guide officiel pour modifier <code>api_endpoint</code> dans <code>[OneStoreServices]</code>, puis éjectez-la proprement.</li><li>Choisissez les livres dans l’étagère Kobo de Grimmory, puis lancez la synchronisation sur la liseuse.</li></ol><p>EPUB est pris en charge ; les conversions dépendent des réglages du serveur. Les PDF ne sont pas pris en charge par cette intégration.</p><a href="https://grimmory.org/docs/integration/kobo/" target="_blank" rel="noopener noreferrer" class="button secondary">Guide officiel Grimmory <HubIcon name="external" /></a><a v-if="grimmory" :href="grimmory" target="_blank" rel="noopener noreferrer" class="button secondary">Ouvrir mon Grimmory <HubIcon name="external" /></a></section>
  <NuxtLink to="/collections" class="button secondary kobo-back">Retrouver mes collections <HubIcon name="arrow" /></NuxtLink>
  </div>
</template>

<style scoped>
.kobo-guide p,.kobo-guide li{font-size:13px;line-height:1.9}.kobo-guide ol{padding-left:22px;display:grid;gap:16px}.kobo-guide code{overflow-wrap:anywhere}.kobo-guide .button{margin:12px 12px 0 0;white-space:normal}.kobo-back{margin-top:24px}
</style>
