# Phase 13 — Neural Racing Lab

## Périmètre et séparation expérimentale

Le mode **Neural Racing Lab** est accessible depuis le menu. Il charge à la demande les artefacts `public/phase8-model-a.json`, `phase8-model-b.json` et `phase8-model-c.json`. Il vérifie l'étiquette de configuration, la graine d'origine et l'architecture historique `[7,16,16,2]`. Les fichiers A/B/C ne sont pas réécrits. Les courses du laboratoire sont des évaluations exploratoires du moteur de jeu; elles ne constituent pas les validations scientifiques des phases 4 à 8.

Les modèles historiques ont été entraînés avec cinq distances de capteurs normalisées, une vitesse normalisée et une erreur de cap d'orientation, avec deux commandes de sortie. `HistoricalBrainAdapter` reconstruit ces sept observations avec `TrackSensors` et `ObservationBuilder`, puis réutilise `NeuralController` pour produire une force. `RaceWorld` intègre ensuite cette force avec `GameVehicleDynamics` (arcade). La physique, les scénarios et les fonctions de récompense historiques ne sont pas modifiés. La différence de moteur limite la comparabilité : les résultats présents ne doivent pas être cités comme performances scientifiques historiques.

## Protocole de compétition

Le protocole impose un circuit et une configuration documentés (`GameVehicleDynamics`, pas fixe 1/60 s, un tour, paramètres de vitesse et force), puis crée un heat par rotation de positions. Chaque heat reçoit une graine distincte et stable, les pilotes conservent le même roster et les contrôleurs sont déterministes. `validateFairness` refuse une série qui change de circuit, physique ou roster, ou qui ne fait pas passer chacun par toutes les places. Le résultat JSON conserve les heats, les seeds, les paramètres de physique et la provenance des modèles.

Les pistes intégrées peuvent être comparées comme circuits d'entraînement (Original) et formes de généralisation (Technique, Ovale rapide). Il faut lancer une comparaison séparée sur chaque circuit; le classement ne mélange pas leurs scores dans le protocole d'un seul circuit. Les circuits utilisateurs validés dans Circuit Studio sont également proposés.

Mesures actuelles : tours, meilleur tour observé, progression, compteur de collisions du heat et score de jeu auxiliaire. `RaceWorld` n'expose pas encore les sorties de piste par voiture ni un taux de réussite d'épisode : ces champs ne sont pas inventés, les sorties de piste sont affichées N/D. Les collisions sont un compteur global du heat et ne doivent pas être interprétées comme un compte propre à chaque pilote. Le score de jeu n'est pas la récompense scientifique.

## Cerveaux expérimentaux

Les nouveaux réseaux utilisent le format JSON `neurodrive-experimental-brain` version 1, séparé des artefacts historiques. Leur architecture est `[nombre de capteurs + vitesse, ...couches cachées, 2]`. Les angles, la portée, le nombre de couches, les tailles de couches et l'activation cachée (`tanh`, `relu`, `sigmoid`) sont configurables; les deux sorties restent tanh pour produire direction et accélérateur signés. Le chargeur valide les dimensions et valeurs finies. Le panneau permet de créer/exporter un réseau initial et d'importer un fichier conforme.

`TrainingStopConditions` and `ExperimentalGeneticTrainer` now back the explicit, bounded experimental worker documented below. JSON v1 and CSV exports remain in the arcade result space.

## Phase 13.1 — vues 3D, télémétrie et entraînement expérimental

`createRosterRaceWorld` est la fabrique commune de la manche headless et de la vue Three.js. Elle instancie les mêmes contrôleurs, voitures, `GameVehicleDynamics`, géométrie de grille et `RaceWorld`; les contrôleurs ne sont pas recréés en Steering à l'ouverture de la vue. Depuis le résultat d'un heat, **Visualiser la dernière manche en 3D** affiche la course; la session F1 existante fournit pause/reprise, sélecteur de voiture, quatre caméras et retour au laboratoire. Une manche est relancée depuis les mêmes positions et contrôleurs avec un monde neuf, elle ne reprend pas l'état exact de la manche terminée.

Les conditions de course sont déterministes : grille définie par l'ordre des positions, pas fixe de 1/60 s, physique arcade sans bruit aléatoire et contrôleurs déterministes. Le champ `seed` est conservé comme identifiant de run; il ne randomise pas la physique actuelle. Le test de fair-play exige des identifiants de seed uniques, un roster et une physique identiques, une permutation de slots par heat et la rotation complète des positions.

Chaque voiture expose `getDriverTelemetry` : identifiant de pilote, progression du tour courant, tours, liste des temps au tour valides (>1 s), meilleur tour, collisions de voitures, contacts de bord, événements de sortie, durée hors piste, état de course et réussite. Un contact hors piste est compté lorsqu'avant correction la position dépasse la largeur admissible; `offTrackTime` additionne les pas fixes (1/60 s) durant lesquels le moteur corrige une telle excursion. Un événement est une transition de l'intérieur vers l'extérieur. `collisions` additionne les impacts voiture-voiture et ces contacts de bord; les sous-compteurs permettent de les distinguer. `successRate` du tableau est la fraction des heats terminés parmi les heats exécutés pour un pilote. Un heat plafonné en pas de simulation compte comme un échec, sans extrapoler le temps ou les tours manquants.

Les heats sont classés en `known-training-track` (Original), `held-out-generalization-track` (Technique/Ovale) ou `user-defined` (Circuit Studio). Chaque lancement compare un seul circuit; les résultats de circuits différents restent séparés et ne servent pas à sélectionner un modèle pour le test held-out historique.

`ExperimentalGeneticTrainer` est un GA distinct. Le trainer scientifique existant reste inchangé, car il fixe l'architecture et le parseur réseau historique. Le worker expérimental reçoit angles/portée de capteurs, tailles de couches, activation, circuit arcade, graine, budget et arrêts; il compare le candidat à Steering avec une rotation de deux positions. Les observations sont exactement `nombre capteurs + vitesse normalisée`, la sortie est `[direction, accélérateur]`. Les seuils de fitness et de réussite sont examinés après une génération complète. L'arrêt manuel est coopératif : la génération en cours s'achève pour laisser un point de reprise complet. Le budget d'épisodes doit permettre une génération entière.

Un checkpoint `neurodrive-experimental-checkpoint` v1 sauvegardé après chaque génération contient paramètres de réseau/GA/protocole/arrêt, graine, population complète de la génération suivante, état RNG xorshift, historique, compteurs d'épisodes, meilleur réseau, score et génération du meilleur. Toute discordance de paramètres bloque la reprise. Le worker expose un arrêt manuel et le client le termine après `complete`/`error`; en quittant le labo il demande l'arrêt à la frontière de génération. Les checkpoints sont stockés sous une clé locale distincte des données scientifiques.

L'interface n'autorise que des validations courtes (maximum 5 générations, 8 individus, 40 épisodes et 1 800 pas/épisode). L'entraînement ne démarre qu'après clic explicite. Le modèle final téléchargé contient sa provenance expérimentale; les JSON/CSV de course contiennent circuit, catégorie, seed, temps/tours, collisions par voiture, sorties, progression, réussite, score arcade et source du pilote.

## Tests et limites de validation

`tests/neural-racing-lab.test.js` vérifie les formats et dimensions, les adaptateurs, l'intégrité du chargement historique, les heats headless déterministes, les collisions individuelles, les budgets d'arrêt, la reprise exacte après checkpoint et la libération du client Worker. `npm.cmd test` couvre également la non-régression des phases précédentes; `npm.cmd run build` valide le bundle.

Les courses 3D utilisent un rendu Three.js réel mais aucune validation visuelle automatisée n'est revendiquée dans ce rapport. La réussite dépend du franchissement réel de la ligne d'arrivée; les sorties de piste signifient des corrections de limite par la physique arcade et ne sont pas une mesure de pénalité dans le moteur scientifique. Les scores arcade ne sont pas comparables aux récompenses des phases 4 à 8. Le worker produit un très court entraînement de démonstration et ne remplace pas une campagne expérimentale pré-enregistrée.
