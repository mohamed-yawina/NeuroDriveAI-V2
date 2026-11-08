# Phase 8 — Configuration B : résultats intermédiaires

## Protocole exécuté

Configuration B a été exécutée trois fois, avec les graines 2026, 2027 et 2028 : 100 générations, population de 16, réseau 7-16-16-2, trois circuits (original, technique, fast oval) et 30 évaluations physiques par candidat et par génération. Les scénarios d'une génération sont appariés entre les candidats et changent entre générations. La fitness phase 7 et ses pondérations n'ont pas été modifiées.

L'élitisme est passé de 3/8 pour A à 6/16 pour B afin de conserver la fraction historique de 37,5 %. Les autres paramètres sont mutation 0,08, sigma gaussien 0,12, sélection par tournoi de trois candidats, sans croisement. L'architecture, le moteur physique et le pas fixe sont inchangés.

La validation principale a utilisé 30 scénarios indépendants par circuit et par réseau, graine de scénario 731001, avec les mêmes conditions pour A, B et Steering. Les poids des réseaux sont restés inchangés. Le quatrième circuit a été réservé à un test final séparé; il n'a participé ni à l'entraînement ni au choix des modèles.

## Coût réel et fitness d'entraînement

Chaque seed B a évalué 1 600 candidats, soit 4 800 épisodes physiques sur les trois circuits. Total : **14 400 épisodes**, **2 031,1 s** (33 min 51,1 s) d'entraînement séquentiel.

Durées mesurées : seed 2026, 674,8 s; seed 2027, 618,7 s; seed 2028, 737,6 s. Aucune durée d'entraînement A n'avait été enregistrée dans ses artefacts phase 7.

| Configuration | Fitness maximale par seed | Moyenne ± écart-type entre seeds | Dernière moyenne de population, moyenne ± écart-type | Épisodes physiques |
| --- | --- | ---: | ---: | ---: |
| A, historique — 50 × 8 | 111,15 · 37,10 · 79,10 | 75,78 ± 37,13 | 48,04 ± 27,00 | 3 600 |
| B — 100 × 16 | 111,23 · 122,51 · 121,84 | 118,53 ± 6,33 | 90,41 ± 12,03 | 14 400 |

Les temps d'entraînement A ne sont pas présents dans les artefacts historiques. B utilise quatre fois plus d'épisodes que A, car le nombre de générations et la population ont tous deux doublé. Les résultats ne permettent donc pas d'isoler l'effet de la population de celui du nombre de générations; la comparaison mesure des budgets/configurations complets.

## Validation indépendante sur les trois circuits connus

Les taux de réussite sont des tours terminés; les trois valeurs par configuration correspondent aux réseaux entraînés avec les trois graines. L'écart-type entre ces taux est exprimé en points de pourcentage et décrit seulement ces trois réseaux.

| Circuit | Steering | A : tours / 90 | B : tours / 90 | B : taux par seed | Progression moyenne B | Temps au tour réussi B | Sorties B / épisode | Temps hors piste B |
| --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |
| Original | 30/30 | 41/90 (45,6 %, SD 46,7 pp) | **88/90 (97,8 %, SD 3,8 pp)** | 28/30 · 30/30 · 30/30 | 695,1 m | 27,38 s | 0,01 | 0,04 s |
| Technique | 30/30 | 38/90 (42,2 %, SD 47,3 pp) | **69/90 (76,7 %, SD 26,0 pp)** | 27/30 · 14/30 · 28/30 | 488,5 m | 24,76 s | 0,40 | 1,33 s |
| Fast oval | 30/30 | 39/90 (43,3 %, SD 45,1 pp) | **86/90 (95,6 %, SD 7,7 pp)** | 26/30 · 30/30 · 30/30 | 743,9 m | 28,47 s | 0,31 | 0,17 s |

Globalement, B termine 243/270 essais (90,0 %), contre 118/270 (43,7 %) pour A; Steering termine 90/90 sur ces trois circuits. B dépasse A sur chacun des circuits dans cet échantillon. L'écart de seed demeure visible surtout sur le circuit technique. Les temps au tour sont calculés uniquement sur les essais ayant validé un tour. La progression est la progression signée télémétrée, pas une conversion en taux de réussite.

Les métriques par seed, intervalles Wilson des complétions, intervalles des moyennes, comparaisons appariées et données par épisode sont conservés dans `results/phase8-b/validation.json` et `.csv`. Les intervalles sont conditionnels aux scénarios générés; 30 scénarios par réseau et seulement trois graines ne donnent pas une estimation robuste de toutes les conditions possibles.

## Test final sur le quatrième circuit inédit

Le circuit `phase8-chicane-test` n'était pas inclus dans les trois circuits d'entraînement. Les contrôleurs ont reçu les mêmes 30 scénarios de ce circuit.

| Contrôleur / modèle | Tours terminés | Progression moyenne | Sorties / épisode | Temps hors piste moyen |
| --- | ---: | ---: | ---: | ---: |
| Steering | 30/30 | 707,4 m | 23,38 s | 4,00 | 5,64 s |
| A, seeds 2026/2027/2028 | 33/90 | 426,5 m | 35,01 s | 0,94 | 2,11 s |
| B, seeds 2026/2027/2028 | 57/90 | 580,3 m | 30,10 s | 0,72 | 1,49 s |

Détail B : seed 2026 = 27/30, seed 2027 = 0/30, seed 2028 = 30/30. Le réseau B améliore le total par rapport à A sur ce test, mais l'échec complet d'une graine montre que la robustesse entre entraînements n'est pas acquise. Les mesures complètes par modèle et scénario sont dans `results/phase8-b/held-out-final.json` et `.csv`.

## Interprétation et limites

- Le meilleur fitness B moyen est plus élevé et moins variable entre ces trois graines que celui de A, avec quatre fois plus d'épisodes. Cela ne démontre pas que B est plus efficace par épisode.
- La validation progresse fortement sur les circuits original et ovale et reste moins régulière sur le circuit technique.
- Le test inédit est encourageant en total, mais le résultat 0/30 de B seed 2027 est un échec sérieux; ne pas conclure que la généralisation est résolue.
- La taille d'échantillon est réduite : trois graines et 30 scénarios par réseau/circuit. Les scénarios au sein d'un circuit ne sont pas des expériences d'entraînement indépendantes. Les écarts-types entre graines sont descriptifs, sans prétention d'inférence populationnelle.
- Le test final est verrouillé et ne doit pas servir à choisir des paramètres. La configuration C n'a pas été exécutée.

## Profil technique

Un benchmark de 30 épisodes d'entraînement a effectué 40 500 pas (1 350 par épisode à la limite de 45 s simulées) en 5,95 s, soit 6 806 pas/s sur cette machine. Pendant B, le coût total observé a été 0,141 s par épisode en moyenne, checkpoints compris; les épisodes ne duraient pas tous 45 s simulées. Le moteur réutilise déjà les objets physiques par circuit; aucun changement de physique ou d'ordre d'intégration n'a été introduit pour accélérer l'expérience.

Le build de production mesure 539,90 kB minifiés pour le JavaScript principal (138,33 kB gzip) et 66,10 kB pour le worker; Vite signale que le chunk principal dépasse son seuil de 500 kB. Une tentative de configuration de séparation de chunks n'a pas pu être chargée par le bundler Vite dans l'environnement courant (accès refusé lors du chargement de la config) et a été retirée. Le build standard reste réussi; la séparation en chunks reste une optimisation front-end à reprendre dans un environnement où la config Vite est chargée normalement.

## Artefacts et reproductibilité

Les modèles sont enregistrés séparément dans `results/phase8-b/models/seed-2026.json`, `seed-2027.json` et `seed-2028.json`. Les métriques génération sont dans `training.json`, `generation-statistics.csv`, `generation-circuit-statistics.csv` et `generation-statistics.json`. La validation et le test final ont leurs propres exports JSON/CSV. Les empreintes SHA-256 des artefacts phase 7 sont conservées; leur vérification a réussi (`historicalArtifactsUnchanged: true`).

Commandes : `npm run train:phase8-b` (refuse d'écraser un dossier B existant), `npm run validate:phase8-b`, `npm run test:phase8-heldout`, `npm test`, `npm run build`. La validation ne réentraîne ni ne modifie les modèles. Aucun entraînement C n'a été lancé.
