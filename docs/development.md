# Développer et installer Le Hub

## Démarrage

Node 24 (minimum 24.11), npm et le backend [Le Concierge](https://github.com/hloiseau/le-concierge) sont requis.

```bash
npm ci
cp .env.example .env
npm run dev
```

Ouvrir `http://localhost:3000`. Le backend doit utiliser exactement cette valeur pour `PUBLIC_ORIGIN`. Le serveur Nuxt relaie uniquement `/api/v1/**` vers `NUXT_API_BASE`, qui reste une configuration serveur. Les secrets Discord, Plex et Seerr ne sont jamais configurés dans le Hub.

`NUXT_PUBLIC_DISCORD_URL` permet d'ajouter le lien d'invitation Discord. `NUXT_PUBLIC_DEMO=true` active une démonstration visuelle explicitement étiquetée : identité et contenus fictifs, aucune connexion au serveur multimédia, aucune action sur des données réelles. Garder cette variable à `false` en exploitation.

## Validation

```bash
npm run generate:api
npm run typecheck
npm run build
npx playwright install chromium
npm test
```

Les tests navigateur couvrent les versions ordinateur et mobile, les états anonymes/connectés, les filtres, l'échappement des titres, les préférences et les erreurs amont. Les réponses API y sont simulées : ces tests ne valident pas l'accès à un vrai serveur Plex/Seerr.

Pour une installation de Chromium déjà disponible, `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` permet d'utiliser son chemin. L'exécution locale de cette première version a utilisé Chromium 153 fourni séparément après échec du téléchargement standard de Playwright ; la CI utilise le navigateur installé par Playwright.

Le contrat `api/openapi.json` (version 0.9.0) vient du Concierge. Les types `app/types/generated.d.ts` sont générés via openapi-typescript ; `app/types/api.ts` les réexporte avec les libellés français. En cas d'évolution du backend, recopier son contrat versionné, régénérer, puis vérifier les usages TypeScript. La CI vérifie qu'une génération ne modifie pas le fichier committé. La synchronisation entre dépôts n'est pas automatisée.

## Production

```bash
npm run build
NUXT_API_BASE=http://api:8080 HOST=0.0.0.0 PORT=3000 node .output/server/index.mjs
```

Le Dockerfile produit une image non-root contenant seulement `.output`. La CI construit les images sur PR ; elle publie sur GHCR après les validations, uniquement sur main ou sur un tag. `edge` suit main, les tags `sha-<commit>` figent une construction. Ne pas supposer une image présente avant réussite du workflow correspondant.

Les exemples Compose, TrueNAS et Caddy communs sont dans [le guide de déploiement du Concierge](https://github.com/hloiseau/le-concierge/blob/main/docs/deployment.md). L'API interne du bot n'est jamais relayée par le Hub. Le proxy conserve cookies, origine et redirections HTTP ; il ne doit pas suivre le redirect de connexion Plex côté serveur.

## Dépendances — constat du 15 octobre 2026

Le contrôle npm du graphe de dépendances de construction a signalé deux avis amont : `braces <=3.0.3` ([GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)) et `node-forge <=1.4.0` ([GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv)), avec propagation à plusieurs packages Nuxt/Nitro. Les dernières versions retournées par le registre à cette date étaient encore concernées. Aucun downgrade automatique n'a été effectué.

Ces packages ne figurent pas dans le manifeste des dépendances de la sortie standalone `.output` examinée, qui est la seule arborescence copiée dans l'image d'exécution. Cela ne remplace pas un audit complet. Le serveur de développement reste lié à la boucle locale et les builds doivent utiliser des sources de confiance. Dependabot suit les correctifs amont.

## État réel des fonctions

Accueil, connexion Plex, demandes Seerr et réglages de notifications réunis, affiches, téléchargements, livres, monitoring, retraits et préférences disposent de parcours implémentés. Chaque intégration exige ses sources et capacités côté backend ; une page disponible ne prouve pas sa configuration réelle. Les affiches Plex sont servies après contrôle de la session et des droits, sans token navigateur. Les notifications de salon et les DM personnels sont exécutés par le backend selon sa configuration et les préférences applicables. Les tests navigateur utilisent des réponses simulées ; la réception des messages, les images privées et les capteurs du NAS restent à valider sur l’installation.

Le portail n’affiche aucune page avant une session Plex valide, y compris en accès direct à une URL. La liaison Discord est facultative dans Mon compte. Le mode démo n’accorde aucun accès aux données réelles et doit rester désactivé sur le NAS.
