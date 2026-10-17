# Roadmap — Le Hub

16 issues de développement, dont la priorité « Avant leur départ ». Le statut actuel est celui de chaque issue GitHub ; cette page organise le périmètre, sans échéances promises.

Les dépendances sont des liens vers les issues des deux dépôts. Les références Cxx/Hxx permettent de relier le découpage initial aux numéros GitHub.

## Avancement au 17 octobre 2026

La [PR Hub #29](https://github.com/hloiseau/le-hub/pull/29) et la [PR Concierge #40](https://github.com/hloiseau/le-concierge/pull/40) sont fusionnées et leurs images `edge` publiées. Elles raccordent demandes, nouveautés, rappels, suivis, livres/collections, suivi Shelfmark, performances, communauté et téléchargements personnels. Les tests navigateur couvrent ordinateur et mobile avec sources simulées. Le [suivi détaillé backend](https://github.com/hloiseau/le-concierge/blob/main/docs/roadmap.md) distingue parcours livrés, configuration nécessaire et limites restantes.

Les imports Grimmory restent explicitement non vérifiés sans corrélation amont ; aucune liste de tomes manquants ou de nouvelles sorties n’est inventée. Le statut Kobo n’est pas simulé. Le contrat personnel Downloadarr est fusionné dans la [PR amont #1](https://github.com/hloiseau/LibraryDownloadarr/pull/1), publié sur `quality-preview` et son fonctionnement confirmé par l’administrateur après installation. La recette à deux comptes et des transferts longs reste ouverte. Les métriques et publications communautaires nécessitent une configuration explicite ; les pages effacent les données expirées, révoquées et les réponses tardives après déconnexion.

## Phase 2 — Portail V0 / V1

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

- [#16 — À voir avant leur départ](https://github.com/hloiseau/le-hub/issues/16), avec [les sources backend #25](https://github.com/hloiseau/le-concierge/issues/25) et [la politique de rappel #26](https://github.com/hloiseau/le-concierge/issues/26). La liste personnelle, les préférences, la boîte de rappels et les demandes de délai sont connectées au backend avec tests simulés. Les sources réelles doivent encore être configurées et la recette menée avec les comptes autorisés.
