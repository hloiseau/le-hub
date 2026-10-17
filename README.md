# Le Hub

Portail Nuxt pour centraliser services, demandes, bibliothèque et performances du serveur.

**Statut : intégrations publiées, validation réelle partielle.** Les parcours sont fusionnés et les images `edge` publiées. L’administrateur confirme l’installation et le fonctionnement de Downloadarr ; les autres intégrations restent dépendantes de leur configuration et de leur recette réelle. Voir les limites dans la [roadmap](docs/roadmap.md).

- [Roadmap et tickets](docs/roadmap.md)
- [Architecture commune](docs/architecture.md)
- [Contribuer](CONTRIBUTING.md)
- [Projet complémentaire : le-concierge](https://github.com/hloiseau/le-concierge)

Le portail est fermé avant connexion Plex : seuls les comptes ayant accès au serveur peuvent entrer. Les liens et les données restent protégés côté API.

## Déployer sur TrueNAS

Les deux premières versions sont fusionnées ; les images sont disponibles sur GHCR. Utiliser le [guide TrueNAS](https://github.com/hloiseau/le-concierge/blob/main/docs/truenas-quickstart.md) : YAML Hub + API ou version complète avec bot, Caddy et vérification. Le [tutoriel Discord](https://github.com/hloiseau/le-concierge/blob/main/docs/discord-quickstart.md) couvre la liaison facultative et les commandes du bot. Le tag `edge` suit main ; les YAML utilisent `edge`.

## Démarrer

`npm ci`, puis `npm run dev` avec le backend local. Voir le [guide de développement et validation](docs/development.md) pour les variables, tests, contrat API et images Docker. Le mode `NUXT_PUBLIC_DEMO=true` affiche des données fictives explicitement signalées.

La page « Avant leur départ » et le bloc d’accueil affichent les départs estimés des lectures enregistrées, lorsque le backend expose la capacité `departures`. Les accès Plex, règles Maintainerr et exclusions sont vérifiés ; les données périmées sont retirées. Les saisons suivies sont développées en épisodes effectivement concernés ; un état de visionnage inconnu reste explicite.

Avec l’API Concierge 0.9 et la capacité `notifications`, « Mon compte » permet d’activer les rappels dans le Hub, de choisir les jours avant retrait, les heures calmes de Paris et le plafond quotidien. Les DM Discord demandent un consentement distinct, une liaison Discord et l’activation du service par l’administrateur. Leur case peut activer les rappels personnels en même temps ; elle explique les configurations manquantes. Les rappels collectifs dans le salon Discord, avec mention des demandeurs Seerr, restent séparés de cette préférence. « Mes rappels », dans « Avant leur départ », concerne les lectures commencées, demandes et suivis non vus confirmés par Plex. L’option « tous mes contenus non vus » reste désactivée par défaut. Les rappels nécessitent une autorisation Plex active ; reconnectez-vous après un redémarrage du backend. Voir le [périmètre backend](https://github.com/hloiseau/le-concierge/blob/main/docs/removal-reminders.md).

« Mes suivis » affiche automatiquement les films et séries demandés sur Seerr par le compte connecté, avec leurs saisons et états. Aucun identifiant ni lien n’est à recopier. Les anciens suivis ajoutés séparément restent dans une section secondaire, avec désabonnement et choix du canal. Les alertes de disponibilité disposent d’une boîte personnelle et de DM facultatifs sur consentement, avec déduplication des demandes déjà notifiées par Seerr et plafond commun aux rappels. « Demander un délai » crée une demande examinable par les administrateurs dans « Avant leur départ », sans modifier Maintainerr ni garantir la conservation.

Les nouveautés de l’accueil proposent la pagination Plex avec dates d’ajout et regroupement par identifiant stable. Les réponses expirées ou en erreur sont effacées. Les demandes affichent les affiches et le nom du demandeur fournis par Seerr ; les nouveautés et le choix d’un téléchargement utilisent des affiches Plex accessibles uniquement avec la session personnelle. Le contrat OpenAPI 0.9 est copié du Concierge et ses types TypeScript sont générés par `npm run generate:api` ; la CI vérifie leur synchronisation. Les intégrations non disponibles restent masquées par les capacités du backend.

`/telechargements` utilise la connexion Plex déjà ouverte pour activer l’accès personnel Downloadarr sans seconde authentification. La recherche permet de choisir un film, une saison entière ou un épisode dans la bibliothèque personnelle ; le collage d’un lien Plex reste facultatif. La qualité et les pistes sont vérifiées avant confirmation. Le téléchargement MP4/ZIP traverse le proxy sans exposer de token au navigateur. L’image Downloadarr existante `quality-preview` reste compatible ; mettre à jour ensemble Concierge et Hub pour le contrat 0.9. Le téléchargement possède son entrée dédiée et n’apparaît plus dans la page bibliothèque de livres.

Le catalogue `/livres` associe les identifiants OPDS personnels Grimmory et propose recherche, couvertures et pagination. `/collections` conserve les éditions et numérotations source, sans inventer de tomes manquants ; le guide Kobo décrit les étapes dans Grimmory sans prétendre connaître l’état de la liseuse.

`/performances` affiche mesures réelles, valeurs indisponibles et historiques avec graphique accessible, zoom et tableau. Tautulli suffit pour l’activité Plex ; CPU, RAM, GPU et réseau nécessitent le collecteur hôte. Son absence ou une panne de l’historique n’efface plus les observations Plex actuelles. Les détails d’hôte et sessions Plex sont réservés aux administrateurs. `/communaute` et `/roadmap` affichent uniquement la sélection publiée par le backend ; les votes restent dans Discord. Toutes ces vues retirent les données expirées et les réponses tardives après déconnexion.

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
