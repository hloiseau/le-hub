# Le Hub

Portail Nuxt pour centraliser services, demandes, bibliothèque et performances du serveur.

**Statut : première version exécutable en validation.** Les fondations et premiers parcours sont implémentés et testés localement. La configuration et la validation sur les services réels restent nécessaires ; aucune installation NAS n’a été effectuée.

- [Roadmap et tickets](docs/roadmap.md)
- [Architecture commune](docs/architecture.md)
- [Contribuer](CONTRIBUTING.md)
- [Projet complémentaire : le-concierge](https://github.com/hloiseau/le-concierge)

## Démarrer

`npm ci`, puis `npm run dev` avec le backend local. Voir le [guide de développement et validation](docs/development.md) pour les variables, tests, contrat API et images Docker. Le mode `NUXT_PUBLIC_DEMO=true` affiche des données fictives explicitement signalées.

L’entrée « À voir avant leur départ » prépare la nouvelle priorité Maintainerr/Tautulli ; aucun rappel réel n’est encore envoyé.

## Périmètre

- V0 : accès Plex, Seerr, Downloadarr, Torrent Watch, Shelfmark et Grimmory, nouveautés, FAQ et guides.
- V1 : connexion Discord, comptes liés, demandes et préférences personnelles.
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
