# Le Hub

Portail Nuxt pour centraliser services, demandes, bibliothèque et performances du serveur.

**Statut : première version exécutable en validation.** Les fondations et premiers parcours sont implémentés et testés localement. La configuration et la validation sur les services réels restent nécessaires ; aucune installation NAS n’a été effectuée.

- [Roadmap et tickets](docs/roadmap.md)
- [Architecture commune](docs/architecture.md)
- [Contribuer](CONTRIBUTING.md)
- [Projet complémentaire : le-concierge](https://github.com/hloiseau/le-concierge)

Le portail est fermé avant connexion Plex : seuls les comptes ayant accès au serveur peuvent entrer. Les liens et les données restent protégés côté API.

## Déployer sur TrueNAS

Les deux premières versions sont fusionnées ; les images sont disponibles sur GHCR. Utiliser le [guide TrueNAS](https://github.com/hloiseau/le-concierge/blob/main/docs/truenas-quickstart.md) : YAML Hub + API ou version complète avec bot, Caddy et vérification. Le [tutoriel Discord](https://github.com/hloiseau/le-concierge/blob/main/docs/discord-quickstart.md) couvre la liaison facultative et les commandes du bot. Le tag `edge` suit main ; les YAML utilisent `edge`.

## Démarrer

`npm ci`, puis `npm run dev` avec le backend local. Voir le [guide de développement et validation](docs/development.md) pour les variables, tests, contrat API et images Docker. Le mode `NUXT_PUBLIC_DEMO=true` affiche des données fictives explicitement signalées.

La page « Avant leur départ » et le bloc d’accueil affichent les départs estimés des lectures enregistrées, lorsque le backend expose la capacité `departures`. Les accès Plex, règles Maintainerr et exclusions sont vérifiés ; les données périmées sont retirées. L’état d’une saison entière reste explicitement incertain.

Avec l’API Concierge 0.5 et la capacité `notifications`, « Mon compte » permet d’activer les rappels dans le Hub, de choisir les jours avant retrait, les heures calmes de Paris et le plafond quotidien. Les DM Discord demandent un consentement distinct, une liaison Discord et l’activation du service par l’administrateur. « Mes rappels », dans « Avant leur départ », concerne les films et épisodes déjà commencés. Les rappels nécessitent une autorisation Plex active ; reconnectez-vous après un redémarrage du backend. Voir le [périmètre backend](https://github.com/hloiseau/le-concierge/blob/feat/private-reminders-and-recent/docs/removal-reminders.md).

« Mes suivis » permet de suivre un film, une série ou une saison déjà demandé dans Seerr, avec disponibilité vérifiée à l’ouverture et désabonnement. Un contenu devenu inaccessible conserve une ligne anonyme pour pouvoir supprimer son suivi. Les alertes Discord de disponibilité restent à raccorder. « Demander un délai » crée une demande examinable par les administrateurs dans « Avant leur départ », sans modifier Maintainerr ni garantir la conservation.

Les nouveautés de l’accueil proposent la pagination Plex avec dates d’ajout et regroupement par identifiant stable. Les réponses expirées ou en erreur sont effacées. Le contrat OpenAPI 0.5 est copié du Concierge et ses types TypeScript sont générés par `npm run generate:api` ; la CI vérifie leur synchronisation. Les intégrations non disponibles restent masquées par les capacités du backend.

## Périmètre

- V0 : accès Plex, Seerr, Downloadarr, Torrent Watch, Shelfmark et Grimmory, nouveautés, FAQ et guides.
- V1 : connexion Plex obligatoire, liaison Discord facultative, comptes liés, demandes et préférences personnelles.
- V2 : catalogue livres/mangas, demandes Shelfmark, imports, collections et accès Kobo selon capacités.
- V3 : performances CPU, RAM, GPU, stockage, réseau et activité Plex, en direct et sur historique.
- V4 : forums, votes et roadmap publique.
- V5 : conversions et téléchargements Downloadarr.

Le portail consomme l’API Go du Concierge. Les abonnements sont activés avec leur backend de phase 5 ; les ajouts de livres de l’accueil dépendent de l’intégration Grimmory.

## Suivi

Les issues décrivent les objectifs, critères d’acceptation, phases, priorités et dépendances. Une priorité P0 est relative à sa phase. Les états des issues font référence ; une case non cochée ne signifie pas qu’une application est disponible.

Les tableaux GitHub Projects et milestones ne sont pas configurés à ce stade. La [roadmap liée](docs/roadmap.md) permet de naviguer immédiatement dans le backlog.

## Licence

[MIT](LICENSE), Copyright 2026 Hugo Loiseau.
