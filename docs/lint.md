# Lint du Hub

`npm ci` prépare Nuxt, puis `npm run lint` contrôle JavaScript, TypeScript et les composants Vue. La CI lance ce contrôle avant le typecheck, le build et les tests navigateur. Elle échoue aussi sur les avertissements.

Le module officiel [Nuxt ESLint](https://eslint.nuxt.com/packages/module) génère la configuration adaptée aux imports automatiques du projet. Les règles recommandées sont actives, sans règles de formatage ni réécriture automatique du code. Les versions directes sont fixées dans `package.json`, les dépendances transitives dans `package-lock.json`.

La déclaration générée depuis OpenAPI reste vérifiée par `npm run check:api` et le typecheck ; elle est exclue du lint. Les sorties de build, les rapports de tests, le cache et le Node local ne sont pas du code source à contrôler.

Le lint ne remplace pas une revue d’accessibilité : les tests navigateur couvrent notamment la navigation mobile, le clavier sur les détails de demandes, les états vides et les erreurs. La validation avec les services installés reste séparée.

Vérification du 16 octobre 2026 après ajout d’ESLint : `npm run lint` et `npm run typecheck` réussissent. `npm audit` signale deux avis préexistants, propagés à onze packages : `braces` et `node-forge`, décrits dans [development.md](development.md). `npm ls braces node-forge --all` les rattache à Nuxt/Nitro ; aucune nouvelle alerte ne concerne ESLint ou son module Nuxt. Aucun correctif automatique ou downgrade de Nuxt n’a été appliqué.
