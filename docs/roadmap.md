# Roadmap — Le Hub

16 issues de développement, dont la priorité « Avant leur départ ». Le statut actuel est celui de chaque issue GitHub ; cette page organise le périmètre, sans échéances promises.

Priorité confirmée le 18 octobre : films/séries, notifications Discord et fiabilité du Hub d'abord. Les livres, utilisés uniquement par l'administrateur, passent en dernier. Le travail de correspondance des demandes avec le catalogue reste conservé localement, sans déploiement. Les phases ci-dessous gardent leur numérotation historique.

Les dépendances sont des liens vers les issues des deux dépôts. Les références Cxx/Hxx permettent de relier le découpage initial aux numéros GitHub.

## Avancement au 18 octobre 2026

La [PR Hub #29](https://github.com/hloiseau/le-hub/pull/29) et la [PR Concierge #40](https://github.com/hloiseau/le-concierge/pull/40) sont fusionnées et leurs images `edge` publiées. Elles raccordent demandes, nouveautés, rappels, suivis, livres/collections, suivi Shelfmark, performances, communauté et téléchargements personnels. Les tests navigateur couvrent ordinateur et mobile avec sources simulées. Le [suivi détaillé backend](https://github.com/hloiseau/le-concierge/blob/main/docs/roadmap.md) distingue parcours livrés, configuration nécessaire et limites restantes.

Les [PR Hub #32](https://github.com/hloiseau/le-hub/pull/32) et [Concierge #44](https://github.com/hloiseau/le-concierge/pull/44) sont également fusionnées, publiées sur `edge` et déployées sur le NAS. API, bot et Hub passent leurs sondes. Les demandes et notifications sont regroupées ; l’aide explique `public:true` pour `/nouveautes`, `/surprise` et `/recap`. Huit commandes Discord sont synchronisées. Le lot est couvert par 226 scénarios navigateur ordinateur/mobile ; aucune publication dans un vrai salon n’a été effectuée par ces tests.

Les images installées Grimmory v3.5.0 et Shelfmark v1.4.0 correspondent aux sources auditées. Les routes personnelles refusent les lectures anonymes ; connexion OPDS/Shelfmark et isolation entre deux comptes restent non validées. Les imports Grimmory restent explicitement non vérifiés sans corrélation amont ; aucune liste de tomes manquants ou de nouvelles sorties n’est inventée. Le statut Kobo n’est pas simulé. Le contrat personnel Downloadarr est fusionné dans la [PR amont #1](https://github.com/hloiseau/LibraryDownloadarr/pull/1), publié sur `quality-preview` et son fonctionnement confirmé par l’administrateur après installation. La recette à deux comptes et des transferts longs reste ouverte. Les publications communautaires nécessitent encore la sélection et l’exporteur. Les pages effacent les données expirées, révoquées et les réponses tardives après déconnexion.

Le collecteur hôte fonctionne chaque minute sur le NAS. Quatorze clés hôte/Plex/GPU ont été vérifiées disponibles dans l’historique SQLite : CPU, température, charge, RAM, réseau, stockage, activité Plex, puissance et fréquence GPU. La collecte couvre les cinq disques du pool, sans les disques de démarrage, et sa capacité ZFS ; elle n’a reçu aucun privilège supplémentaire et l’API lit son dossier sans pouvoir y écrire. Le raccordement GPU est déployé et réutilise l’API Toparr existante sur l’Arc A310 ; le Hub distingue la fraîcheur de cette source des autres mesures. Le rendu sous charge réelle reste à recetter. Les droits personnels, la réception des rappels et les bibliothèques de deux comptes réels ne sont pas validés par ces contrôles d’exploitation.

## Phase 2 — Portail V0 / V1

Les demandes Seerr et les réglages de notifications sont réunis dans « Mes demandes ». « Mes suivis » disparaît du menu et son ancienne adresse redirige vers cette page. Les abonnements ajoutés séparément restent gérables lorsqu’ils existent, sans recopier les demandes ni supprimer de données. Mon compte et les boîtes de rappels renvoient au même formulaire de préférences ; les annonces de salon restent distinctes du consentement aux messages privés.

Le contrat 0.9 ajoute les affiches Plex privées et les affiches Seerr, remplace la saisie manuelle des suivis par les demandes du compte Seerr et permet de choisir les messages privés sans activer préalablement une autre case. Le bouton de téléchargement a été retiré de la page Bibliothèque. Les performances conservent les observations actuelles si l'historique ou les détails administrateur échouent et expliquent l'absence de capteurs système. Les rappels collectifs avec mention des demandeurs sont assurés par le Concierge dans le salon configuré, indépendamment des préférences DM et des connexions au Hub ; leur envoi réel reste à vérifier sur le serveur Discord.

| Ticket | Version cible | Priorité | Dépendances |
| --- | --- | --- | --- |
| [#1 — Initialiser Nuxt, TypeScript et le client API commun](https://github.com/hloiseau/le-hub/issues/1) | V0 | P0 | [C02](https://github.com/hloiseau/le-concierge/issues/2) |
| [#2 — Construire l’accueil et les accès aux six services](https://github.com/hloiseau/le-hub/issues/2) | V0 | P0 | [H01](https://github.com/hloiseau/le-hub/issues/1) |
| [#3 — Afficher les derniers films, séries puis livres ajoutés](https://github.com/hloiseau/le-hub/issues/3) | V0 | P1 | [H02](https://github.com/hloiseau/le-hub/issues/2), [C06](https://github.com/hloiseau/le-concierge/issues/6) |
| [#4 — Protéger le Hub avec Plex et lier Discord en option](https://github.com/hloiseau/le-hub/issues/4) | V1 | P0 | [H01](https://github.com/hloiseau/le-hub/issues/1), [C04](https://github.com/hloiseau/le-concierge/issues/4) |
| [#5 — Afficher mes demandes Seerr](https://github.com/hloiseau/le-hub/issues/5) | V1 | P0 | [H04](https://github.com/hloiseau/le-hub/issues/4), [C05](https://github.com/hloiseau/le-concierge/issues/5) |
| [#6 — Ajouter préférences et préparer la gestion des abonnements](https://github.com/hloiseau/le-hub/issues/6) | V1 | P1 | [H04](https://github.com/hloiseau/le-hub/issues/4), [C03](https://github.com/hloiseau/le-concierge/issues/3) |
| [#7 — Publier une image Hub et documenter le déploiement](https://github.com/hloiseau/le-hub/issues/7) | V0 / V1 | P0 | [H01](https://github.com/hloiseau/le-hub/issues/1), [C10](https://github.com/hloiseau/le-concierge/issues/10) |

## Phase 3 — Livres et mangas

| Ticket | Version cible | Priorité | Dépendances |
| --- | --- | --- | --- |
| [#8 — Construire le catalogue livres et mangas Grimmory](https://github.com/hloiseau/le-hub/issues/8) | V2 | P1 | [H04](https://github.com/hloiseau/le-hub/issues/4), [C12](https://github.com/hloiseau/le-concierge/issues/12) |
| [#9 — Créer les demandes Shelfmark et suivre les imports](https://github.com/hloiseau/le-hub/issues/9) | V2 | P1 | [H08](https://github.com/hloiseau/le-hub/issues/8), [C13](https://github.com/hloiseau/le-concierge/issues/13), [C14](https://github.com/hloiseau/le-concierge/issues/14) |
| [#10 — Ajouter collections, tomes manquants et accès Kobo](https://github.com/hloiseau/le-hub/issues/10) | V2 | P2 | [H08](https://github.com/hloiseau/le-hub/issues/8), [C11](https://github.com/hloiseau/le-concierge/issues/11), [C15](https://github.com/hloiseau/le-concierge/issues/15) |

## Phase 4 — Monitoring

| Ticket | Version cible | Priorité | Dépendances |
| --- | --- | --- | --- |
| [#11 — Construire le dashboard système avec graphiques historiques](https://github.com/hloiseau/le-hub/issues/11) | V3 | P1 | [H04](https://github.com/hloiseau/le-hub/issues/4), [C17](https://github.com/hloiseau/le-concierge/issues/17) |
| [#12 — Afficher activité Plex et transcodages dans le dashboard](https://github.com/hloiseau/le-hub/issues/12) | V3 | P1 | [H11](https://github.com/hloiseau/le-hub/issues/11), [C18](https://github.com/hloiseau/le-concierge/issues/18) |

## Phase 5 — Fonctionnalités avancées

| Ticket | Version cible | Priorité | Dépendances |
| --- | --- | --- | --- |
| [#13 — Intégrer propositions, problèmes et votes du Discord](https://github.com/hloiseau/le-hub/issues/13) | V4 | P2 | [H04](https://github.com/hloiseau/le-hub/issues/4), [C23](https://github.com/hloiseau/le-concierge/issues/23) |
| [#14 — Afficher une roadmap publique filtrée](https://github.com/hloiseau/le-hub/issues/14) | V4 | P2 | [H02](https://github.com/hloiseau/le-hub/issues/2), [C23](https://github.com/hloiseau/le-concierge/issues/23) |
| [#15 — Intégrer Downloadarr, conversions et fichiers disponibles](https://github.com/hloiseau/le-hub/issues/15) | V5 | P1 | [H04](https://github.com/hloiseau/le-hub/issues/4), [C24](https://github.com/hloiseau/le-concierge/issues/24) |


## Priorité ajoutée — phase 2

- [#16 — À voir avant leur départ](https://github.com/hloiseau/le-hub/issues/16), avec [les sources backend #25](https://github.com/hloiseau/le-concierge/issues/25) et [la politique de rappel #26](https://github.com/hloiseau/le-concierge/issues/26). La liste personnelle, les préférences, la boîte de rappels et les demandes de délai sont connectées au backend avec tests simulés. Maintainerr 3.30.1 et Tautulli v2.18.2 sont configurés et vérifiés en lecture seule sur le serveur Plex attendu ; la recette personnelle des échéances, du visionnage, des reports et de la réception reste à mener avec les comptes autorisés.
