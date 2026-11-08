# Modification 22 — AI Telemetry Center Pro

## Résumé

Le panneau repliable **AI Telemetry Center** est intégré aux sessions Steering Lab et Neural Lab, dans le panneau de laboratoire F1 existant. Il observe la voiture choisie dans `#lab-follow-car`; il ne lance ni contrôleur parallèle ni seconde simulation. Les forces 3D et le visualiseur MLP existants restent réutilisés.

## Architecture et provenance des données

- `RaceSession.updateIntegratedLabPanel()` sélectionne la voiture de la session et appelle `collectAITelemetry(car, world, { modelName })` toutes les 100 ms, pendant le rafraîchissement HUD existant.
- `src/game/AITelemetryCenter.js` transforme ces états en un instantané d'affichage et conserve au plus 300 échantillons (environ 30 secondes à 10 Hz) dans des tableaux `Float32Array` préalloués. Les courbes ne se mettent à jour que lorsqu'un nouvel échantillon est accepté. La mémoire est bornée et réinitialisée au changement de pilote, au recul du temps de simulation ou à la fermeture de session.
- Vitesse : norme de `car.velocity`, affichée en km/h. Accélération : variation mesurée de vitesse en m/s² entre échantillons de temps de simulation. Progression : `validatedProgress` en mètres; aucune valeur de remplacement n'est affichée lorsqu'elle manque. Tours et état viennent de `GameCar` / `RaceDirector`.
- Neural : modèle et architecture viennent du contrôleur affecté à cette voiture et du roster. Les sept entrées viennent de `HistoricalBrainAdapter.lastObservation`, les sorties de `NeuralController.lastCommands`, les activations de son inférence et la force arcade de `RaceWorld.lastForces`. Les sorties réseau sont distinguées de la force appliquée et du mouvement mesuré. Aucun poids n'est écrit ou modifié.
- Steering : contributions, poids et vecteurs proviennent de `RaceController.getDecisionData()` et de `BehaviorManager.getDebugData()`. L'angle est celui de la force résultante relativement à l'axe du véhicule; les commandes longitudinales sont la projection de cette force sur `maxForce`, pas des pédales séparément simulées. Les magnitudes des contributions pondérées sont indiquées en unités arcade. Pursuit n'est actif que lorsqu'une contribution est réellement publiée.
- Pilote humain : vitesse et télémétrie de course restent observables; sorties de contrôleur et forces Steering sont indiquées comme non applicables. Les forces d'un ancien pas IA ne sont pas réutilisées pour l'humain.

## Interface et comportement

- Identité Racing Red, mesures numériques compactes et panneau repliable à l'intérieur du panneau de laboratoire.
- Courbes canvas légères : vitesse; direction et demandes longitudinales; forces pondérées en Steering Lab. Les légendes indiquent les grandeurs et unités pertinentes. Les courbes Neural ne prétendent pas présenter des forces Steering.
- Cases à cocher masquent chaque graphique; **PAUSE GRAPHIQUES** suspend l'échantillonnage sans arrêter la course; reprise, réinitialisation et changement de pilote sont supportés. L'historique se réinitialise aussi après une remise à zéro du temps de course.
- Le visualiseur neuronal existant continue d'afficher les entrées, couches, activations et poids du réseau réellement sélectionné. L'indication du modèle est liée au `driverId` affecté, et non simplement à la voiture actuellement regardée.
- Le tableau comparatif existant reste la comparaison arcade observée de la même manche. Il n'est pas une validation expérimentale contrôlée et ne modifie pas la carrière.
- Aucun nouveau nœud Three.js n'est créé par ce centre. Les gestionnaires de ses boutons sont liés au signal d'abandon de session; son tampon et ses références sont nettoyés lors de `dispose()` et en cas d'échec de construction.

## Mode Professeur

Une étape **Comprendre les décisions de l’IA** a été ajoutée au parcours existant. Elle relie la perception, les forces pondérées, les observations et les sorties réseau au centre de télémétrie. Le parcours reste à 11 étapes pour 180 secondes au total; aucune mesure pré-remplie n'est ajoutée.

## Tests

Nouveaux tests dans `tests/ai-telemetry-center.test.js` couvrent : contributions et poids Steering issus d'un contrôleur réel; inférence et activations du MLP historique via `HistoricalBrainAdapter`; distinction sorties/force arcade; absence de sorties avant la première observation; non-affichage des forces IA sur un véhicule humain; capacité et cadence bornées, pause, remise à zéro et changement de voiture; liaison de `RaceSession` au `driverId` observé; ajout de l'étape professeur. Le test de timeline existant vérifie maintenant les 11 étapes et les trois minutes.

## Validation

- `npm.cmd test` : **295 tests réussis sur 38 fichiers**.
- `npm.cmd run build` : réussi. Vite conserve l'avertissement connu du chunk Three.js de **509,00 kB** (127,80 kB gzip); aucune mesure FPS n'a été faite.
- Manifeste `docs/ultimate-edition-lot5-1-integrity.csv` : **175 entrées présentes, 0 manquante, 0 divergence SHA-256**.
- Aucun entraînement n'a été lancé. Aucun poids, résultat scientifique, protocole, circuit de course ou règle de physique n'a été modifié intentionnellement.
- Chrome est installé, mais le lancement d'un processus navigateur automatisé a été refusé par la politique d'exécution de l'environnement. Aucun rendu canvas/WebGL n'a donc été observé; l'ergonomie réelle et les FPS restent à vérifier manuellement.

## Checklist Chrome

1. Ouvrir Steering Lab, sélectionner une voiture Steering IA, puis comparer les nombres à ceux du vecteur 3D et du contrôleur observé. Passer sur la voiture humaine et vérifier que les forces deviennent non applicables.
2. Masquer un graphique, mettre en pause/reprendre les graphiques, réinitialiser et changer de voiture suivie. Vérifier que la simulation continue et que l'historique repart proprement.
3. Ouvrir Neural Lab, suivre successivement Steering AI et Neural A/B/C; vérifier l'identifiant du modèle, les sept observations, les activations, les deux sorties et la force arcade de cette même voiture.
4. Laisser tourner plusieurs minutes et vérifier que l'historique reste borné; recommencer une manche puis retourner au menu pour contrôler le nettoyage.
5. Suivre l'étape « Comprendre les décisions de l’IA » du Mode Professeur. Vérifier dans DevTools l'absence d'erreurs et surveiller la fluidité sur une grille de six voitures.
