# Le Hub

Portail Nuxt pour centraliser services, demandes, bibliothèque et performances du serveur.

**Statut : projet initialisé, développement à venir.** Le dépôt contient la documentation et le suivi de la roadmap. Il n’y a pas encore d’application exécutable, d’image publiée ni de déploiement prêt à installer.

- [Roadmap et tickets](docs/roadmap.md)
- [Architecture commune](docs/architecture.md)
- [Contribuer](CONTRIBUTING.md)
- [Projet complémentaire : le-concierge](https://github.com/hloiseau/le-concierge)

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
