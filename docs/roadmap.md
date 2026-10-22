# Roadmap — Le Hub

## État vérifié au 22 octobre 2026

Le Hub installé est `d86b929` ([PR #41](https://github.com/hloiseau/le-hub/pull/41)). API/bot Concierge : `20f96b6` ; runtime Eris : `5dd08ded`. Les quatre services sont sains. Le [bilan commun](https://github.com/hloiseau/le-concierge/blob/main/docs/status-2026-10-22.md) décrit les versions, livraisons, preuves et limites ; il remplace les notes de travail du 19 octobre, conservées dans l’historique Git.

### Livré

- PR #38 : présentation inspirée d’Ouicheur, slogans retirés, accès administrateur aux délais.
- PR #39 : Retraits prévus et Demandes de report distincts, notifications dans Mon compte, pages intermédiaires retirées, boutons Livres espacés, six courbes de Performances, lien de roadmap masqué si vide.
- PR #40 : réglages des notifications regroupés et simplifiés, délais par boutons, options avancées repliables.
- PR #41 avec Concierge #55 : information sur les autorisations Plex chiffrées persistantes et leur effacement par déconnexion. Les rappels peuvent continuer sans navigateur et après redémarrage.
- Concierge #54 : listes personnelles de retraits réparées ; exclusion des contenus terminés et non vérifiables pour les notifications Hub, DM et salon. La liste complète des retraits reste distincte de celle des notifications ; ce filtre ne demande pas d’activer une nouvelle option.

### Recette et suite

Deux comptes ont été contrôlés le 20 octobre : associations Seerr, demandes et retraits personnels, accès administrateur refusé au membre ordinaire, déconnexion isolée, conservation des autorisations après redémarrage API. Navigation Compte, Demandes, Retraits, Performances et Livres sur ordinateur sans erreur JavaScript ni débordement. Les tests automatisés des PR couvrent ordinateur et mobile.

La réception réelle des DM n’a pas été testée ; le second compte avait ses notifications désactivées et n’a pas lié Discord. La roadmap publique n’était pas configurée lors de cette recette. Les sondes n’ont créé aucun téléchargement, demande ni message de test.

Restent les recettes de rappels consentis et révocation (#16), les graphiques et la coexistence Plex/A310 sous charge prolongée (#11/#12), la sélection publique des issues (#14), puis les livres (#8–#10), en dernier selon la priorité utilisateur. Les difficultés conversationnelles d’Eris sont suivies dans [Concierge #62](https://github.com/hloiseau/le-concierge/issues/62). Les phases ci-dessous gardent leur numérotation historique ; aucun calendrier n’est promis.

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
