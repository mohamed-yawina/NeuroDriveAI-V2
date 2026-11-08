# Modification 13 — audit final des laboratoires IA

Date de vérification : 6 novembre 2026.

## Résumé

Steering Lab et Neural Lab restent des modes de `RaceSession` dans le `RaceWorld` du jeu F1. Ils utilisent la scène Three.js, les voitures, le circuit, les caméras, la mini-carte et le HUD du jeu. L'audit n'a pas lancé d'entraînement. Il a confirmé les modèles historiques A/B/C et leur provenance, puis corrigé des contrôles d'anticipation qui ne changeaient pas réellement les forces, la synchronisation du pilote observé, un accès carrière évitable et un libellé de vitesse imprécis.

Le rendu et les interactions n'ont pas pu être contrôlés dans Chrome : l'environnement navigateur/CUA n'était pas disponible. Les vérifications visuelles listées en fin de document restent manuelles.

## Architecture vérifiée

`IntegratedLabLaunch` charge les artefacts A/B/C et construit les affectations de pilotes. `RaceSession` crée l'interface et la scène partagée; `RaceWorld` instancie les six voitures et leurs contrôleurs; `RaceController` publie les diagnostics Steering; `HistoricalBrainAdapter` fournit les observations, inférences et commandes des réseaux historiques; `RaceLabVisuals` dessine les contributions de force réellement publiées. Le tableau comparatif lit les six voitures du même `RaceWorld` toutes les 100 ms. Il n'utilise ni fitness d'entraînement ni résultats historiques comme résultats de course.

La simulation arcade est distincte du moteur scientifique historique. L'adaptateur réutilise les entrées et sorties historiques mais convertit les commandes en forces `GameVehicleDynamics` à 60 Hz. L'ancien protocole utilisait le moteur scientifique à 30 Hz. Une course de laboratoire est donc une démonstration arcade, jamais une répétition ni une mesure comparable à la validation scientifique.

## Bugs confirmés et corrections

| Constat | Correction | Preuve |
|---|---|---|
| Le curseur Path Following modifiait `lookAhead`, mais le contrôleur calculait ensuite sa cible avec une anticipation séparée et fixe. | La cible arcade conserve son comportement par défaut historique; le calcul de distance ajoute maintenant les écarts réels des paramètres `lookAhead` et `lookAheadTime`. | Test d'effet du curseur dans `tests/integrated-ai-labs.test.js`; test headless des cinq adversaires et circuits générés dans `tests/phase11-race-engine.test.js`. |
| `PursuitBehavior` recevait dans son contexte une durée de prédiction constante, qui masquait sa propriété configurée. | Retrait de l'override fixe : la valeur configurée est consommée par le comportement. | Test activant le plan de dépassement et comparant les forces à deux valeurs de prédiction. |
| Le sélecteur de voiture observée ne synchronisait pas systématiquement la caméra, le sélecteur du panneau Professeur et les contrôles de force. Lors du passage sur une voiture humaine, les diagnostics précédents pouvaient rester affichés. | Ajout de `syncLabCarSelection`; une voiture sans diagnostics Steering efface l'ancien affichage et annonce explicitement le pilotage humain ou l'absence de diagnostics. | Test des sélections Steering AI puis humaine, des cibles synchronisées et de l'effacement de l'état précédent. |
| Appeler `saveCareerRace()` sur une session laboratoire non montée évaluait l'argument par défaut (`this.world.cars`) avant le garde-fou laboratoire. | Le garde-fou précède maintenant le calcul du classement; les laboratoires n'écrivent jamais carrière ou championnat. | Test d'intégration appelle la méthode sans monde et vérifie que `saveRace` n'est pas appelé. |
| Les activations numériques utilisaient un libellé générique qui nommait mal la couche de sortie. | Ajout de libellés explicites : entrées, couches cachées 1/2, sorties. | Test vérifiant les quatre libellés et test d'activations. |
| L'information de la note méthode annonçait le plafond global 58 m/s comme vitesse maximale configurée de chaque voiture. | La note distingue la vitesse configurée par voiture (56 m/s) du plafond dynamique (58 m/s), et indique le pas arcade de 60 Hz contre 30 Hz historique. | Assertion de test sur la note méthode. |

Lors du premier test global, l'emploi direct de la cible prédictive de `PathFollowing` a fait échouer la simulation déterministe de trois tours sur circuit généré. Cette modification a été retirée : la ligne de course arcade par défaut a été conservée, tout en reliant les sliders à la distance de cible. Le test du circuit généré et toute la suite passent après cette correction.

## Audit Steering Lab

Les contrôleurs F1 actifs combinent par `BehaviorManager` les forces pondérées de Path Following, Obstacle Avoidance et Separation, puis bornent la résultante à `maxForce`. Pursuit ne contribue que lorsque le planificateur de dépassement l'active. `RaceLabVisuals` trace les contributions pondérées exposées par le contrôleur, la résultante, la vitesse et la direction cible. Une force nulle ou absente masque son vecteur; les flèches sont disposées autour de la voiture suivie et supprimées au nettoyage.

| Comportement actif F1 | Calcul observé | Paramètres contrôlables | Limites |
|---|---|---|---|
| Path Following · Seek | Projection sur segments du circuit fermé, point de visée en avant, force Seek `vitesse désirée − vitesse actuelle`; réduction de vitesse selon la courbure. | Poids, distance d'anticipation, temps d'anticipation, paramètres propres au contrôleur. | La cible et la dynamique sont celles du moteur arcade. |
| Obstacle Avoidance | Prédictions avant/avant-lointain et dégagement des cercles représentant les voitures; contribution uniquement lorsqu'une menace existe. | Poids, portée et portée minimale. | Le contrôle principal traite les voitures; ne prétend pas fournir une détection d'obstacle universelle. |
| Separation | Somme des vecteurs d'éloignement des voisins, pondérée par la proximité, bornée selon la configuration. | Poids. | Comportement de groupe arcade distinct du protocole scientifique. |
| Pursuit | Seek vers une position prédite de l'adversaire; ne contribue que lors d'une décision de dépassement active. | Poids et durée de prédiction. | Non actif en continu; un vecteur absent est correctement masqué. |

Les contrôles de pause/reprise et de ralenti restent ceux de la session F1. Le bouton « suivre une voiture Steering IA » choisit une voiture avec contrôleur réel. Si l'utilisateur choisit la voiture humaine, le panneau indique qu'aucune force Steering n'est calculée pour elle. La sélection de circuit du panneau principal se base sur les circuits disponibles au menu; le test de compatibilité passe aussi un circuit Circuit Studio valide aux contrôleurs, mais le sélecteur intégré ne présente pas directement la bibliothèque utilisateur.

## Audit Neural Lab

Les trois artefacts chargés sont `public/phase8-model-a.json`, `public/phase8-model-b.json` et `public/phase8-model-c.json`. Vérification structurelle effectuée : chaque réseau a l'architecture `[7,16,16,2]`, 434 paramètres numériques finis, et les métadonnées de configuration/graine associées (A/2026, B/2027, C/2028). Les poids n'ont pas été modifiés.

Les sept entrées affichées sont :

| Entrée | Unité/échelle présentée | Origine |
|---|---|---|
| 5 distances de capteurs à −60°, −30°, 0°, +30°, +60° | distance normalisée par la portée 45 m | Rayons `TrackSensors` de la voiture suivie, bornés/normalisés par l'adaptateur |
| vitesse | rapport sans unité `vitesse / vitesse maximale` | vitesse de cette voiture et sa configuration arcade |
| erreur de cap | `erreur signée / π` | orientation de la voiture par rapport à la trajectoire |

Le `NeuralNetwork.forward` calcule les activations réelles par couche avec `tanh`. L'adaptateur conserve l'observation, les deux activations cachées de 16 valeurs et les deux sorties de l'inférence réelle de cette voiture. La sortie 0 demande la direction dans `[-1,1]`; la sortie 1 est une commande longitudinale signée (accélération ou freinage). Leur conversion en force latérale/longitudinale, avec masse, vitesse et limite de force arcade, est une adaptation de démonstration. Les sorties ne sont pas des unités physiques historiques.

Les tests vérifient séparément A/B/C, le refus des architectures ou provenances incompatibles, la capture des entrées et des activations de la voiture suivie, Steering AI, les contrôleurs sur circuit Circuit Studio généré, ainsi que les transitions de sélection. Les données Neural et Steering du tableau sont par voiture : identifiant/nom, contrôleur affecté, vitesse, progression validée, tours, incidents, statut et temps d'arrivée uniquement si la voiture a réellement fini. Elles ne sont pas fitness ou rang scientifique.

## Mode Professeur

`ProfessorDemo` fournit dix étapes guidées, commandes précédent/suivant, pause/reprise, sortie et transitions vers Steering Lab ou Neural Lab. Durée prévue : 180 s. Les étapes affichent les notions et numéros de diapositives déclarés dans le cours. Les séquences de laboratoire peuvent nécessiter que la personne sélectionne un modèle ou une voiture; le bouton « ouvrir/revenir au module » déclenche la transition, mais la démonstration n'automatise pas chaque action de l'utilisateur. Les tests vérifient la structure, la durée, l'ordre et les transitions programmées; aucun parcours visuel Chrome n'a été réalisé.

## Matrice de traçabilité pédagogique

Le support local `docs/professor-course/Steering behaviors Master Miage IA2.pptx` contient 62 diapositives. Les numéros ci-dessous proviennent de ce fichier. Le dépôt local `SteeringBehavioursM2IA2_Casa_2026_2027` a aussi été examiné; son README et ses consignes techniques ne donnent pas de grille officielle d'évaluation Casablanca G1. Les exemples de projets associés à d'autres villes/promotions du support ne sont pas assimilés à des obligations G1. En l'absence de barème G1 fourni, le statut « obligation G1 » est **non confirmé** pour toutes les notions.

| Notion | Référence du support | Code / test représentatif | Démonstration actuelle | Statut et limite |
|---|---|---|---|---|
| Seek / steering force | 11–14; équation de force diapo 12 | `src/ai/SeekBehavior.js`, `src/game/RaceController.js`; `steering.test.js`, `phase11-race-engine.test.js` | Steering Lab, Path Following | Présent et testé dans le moteur arcade; équation/échelle ne vaut pas protocole historique. G1 : non confirmé. |
| Flee | 18 | `src/ai/behaviors/SteeringBehaviors.js`; `steering-behaviors.test.js` | Bibliothèque Steering Academy historique, pas comportement de course F1 | Code/test, non actif dans RaceController. G1 : non confirmé. |
| Pursuit / Evade | 19–20 | `SteeringBehaviors.js`, contrôleur F1 pour Pursuit; `steering-behaviors.test.js`, `integrated-ai-labs.test.js` | Pursuit conditionnel visible en Steering Lab; Evade dans l'atelier historique | Pursuit actif conditionnellement; Evade n'est pas un comportement de course. G1 : non confirmé. |
| Arrive | 22–24 | `SteeringBehaviors.js`; `steering-behaviors.test.js` | Atelier historique | Code/test, non actif dans la course. G1 : non confirmé. |
| Wander | 26–28 | `SteeringBehaviors.js`; `steering-behaviors.test.js` | Atelier historique | Code/test, non actif dans la course. G1 : non confirmé. |
| Projection scalaire / Path Following | 29–31 | `src/ai/PathFollowing.js`, `src/game/RaceController.js`; `path-following-advanced.test.js`, `integrated-ai-labs.test.js` | Steering Lab et Mode Professeur | Actif, diagnostics d'écart/segment/courbure; modèle de route arcade. G1 : non confirmé. |
| Obstacle Avoidance | 32–36 | `SteeringBehaviors.js`, `RaceController.js`; `steering-behaviors.test.js`, `phase11-race-engine.test.js` | Steering Lab, vecteur réel si non nul | Actif sur adversaires détectés; définition des obstacles limitée au contrôleur F1. G1 : non confirmé. |
| Alignment / Cohesion | 37–38 | `SteeringBehaviors.js`; `steering-behaviors.test.js` | Atelier historique | Code/test mais non actif dans les courses F1. G1 : non confirmé. |
| Separation / Boids | 39–42 | `SteeringBehaviors.js`, `RaceController.js`; tests Steering et moteur de course | Separation visible en Steering Lab | Separation est active dans le contrôleur F1; Boids complet (Alignment+Cohesion+Separation) n'est pas le contrôleur de course. G1 : non confirmé. |
| Leader Following | 50–51 | implémentation comportement/atelier selon modules Steering; tests unitaires Steering | Atelier historique | Non raccordé aux courses F1; aucune prétention d'activité dans le laboratoire intégré. G1 : non confirmé. |
| Combinaison / BehaviorManager | 10–13, 31 | `src/ai/behaviors/BehaviorManager.js`, `RaceController.js`; `steering-behaviors.test.js`, `phase11-race-engine.test.js` | Forces pondérées et résultante au Steering Lab | Somme pondérée plafonnée par `maxForce`; les priorités historiques de chaque expérience ne sont pas réinterprétées. G1 : non confirmé. |
| Réseau neuronal | 43–49 | `src/ai/NeuralNetwork.js`, `src/neural-lab/ExperimentProtocol.js`; `neural-network.test.js`, `integrated-ai-labs.test.js` | Neural Lab avec cerveau historique sélectionné | Architecture, observations, activations et sorties réelles; adaptation arcade explicitement séparée. G1 : non confirmé. |
| Algorithme génétique / neuroévolution | 43–47 | `src/ai/training/GeneticTrainer.js`; `training.test.js` | Non dans la course intégrée; outil expérimental/historique séparé | Code et tests existent; aucun entraînement exécuté pour cette modification. G1 : non confirmé. |
| Entraînement / fitness | 43–49 | `src/ai/training/`, protocoles et résultats `results/`; `training.test.js` | Résultats historiques consultables par outils/exports; pas confondus avec le tableau arcade | Métriques issues des protocoles enregistrés; pas de nouvelle mesure. Exigence G1 non confirmée. |
| Généralisation | 43–49 | scripts et validations Phase 6/8 dans `results/`; `generalization.test.js`, `phase8-heldout.test.js` | Expériences historiques documentées; une course circuit utilisateur reste arcade | Résultats historiques protégés; une course arcade n'est pas test held-out. G1 : non confirmé. |

Les diapositives 52–62 décrivent différents projets et promotions (Nice, EMSI Marrakech, Rabat, EMSI Casablanca 2024–25); elles ne constituent pas une consigne attestée pour Casablanca G1 2026–27.

## Robustesse et intégrité

Tests automatisés passés : navigation de lancement, rejet d'un chargement Neural en erreur et relance Steering, verrouillage du double lancement, contrôleurs/circuits générés, sélection et télémétrie, force/activations, absence d'écriture carrière, nettoyage des vecteurs, modèles incompatibles. Les tests de non-régression Course rapide couvrent aussi les cinq adversaires et le circuit généré sur trois tours. Les tests existants couvrent REDLINE et son cycle menu/session. Aucun résultat laboratoire n'est persisté en carrière.

Le manifeste local `docs/ultimate-edition-lot5-1-integrity.csv` a été recalculé : **175 fichiers présents, 175 SHA-256 concordants**. Aucun entraînement de production n'a été lancé. Les tests de suite incluent des tests unitaires du trainer déjà présents; ils ne lancent pas de campagne de production.

## Fichiers modifiés

- `src/game/RaceController.js` — réglages d'anticipation réellement reliés à la cible arcade, sans changer la ligne par défaut; retrait du contexte Pursuit qui écrasait sa configuration.
- `src/game/RaceSession.js` — synchronisation du pilote suivi et des contrôles, effacement des diagnostics Steering obsolètes, garde avant tout calcul/accès de sauvegarde carrière en mode laboratoire, libellés de couches Neural.
- `src/ui/IntegratedLabLaunch.js` — explication de la vitesse arcade et de la différence de fréquence.
- `tests/integrated-ai-labs.test.js` — tests d'intégration et de liaison des réglages, sélections, modèles, circuits et persistance.
- `docs/modification-13-final-ai-labs-audit.md` — ce rapport.

## Validation

- `npm.cmd test` : **35 fichiers, 247 tests réussis**.
- `npm.cmd run build` : réussi avec Vite. Avertissement existant : chunk Three.js de 509 kB minifié, supérieur au seuil de 500 kB; le build n'échoue pas.
- Manifeste scientifique : **175/175 SHA-256 concordants**.
- Entraînement : aucun.
- Chrome : non exécuté, navigateur indisponible dans l'environnement de travail.

## Checklist Chrome restante

1. Depuis le menu, ouvrir Steering Lab; confirmer le circuit F1, les six voitures, et qu'une voiture Steering IA est choisie par défaut.
2. Ouvrir le panneau Professeur, changer les poids Path Following/Obstacle/Separation, puis vérifier que valeurs et flèches changent dans la course; vérifier Pursuit pendant un dépassement déclenché.
3. Choisir la voiture humaine : confirmer le libellé « pilotage humain » et l'absence de vecteurs Steering IA; sélectionner ensuite une voiture IA et confirmer l'effacement de toute donnée ancienne.
4. Mettre en pause, reprendre, ralentir, changer de caméra, redimensionner la fenêtre et revenir au menu.
5. Ouvrir Neural Lab; choisir successivement A, B, C et Steering, puis changer la voiture suivie. Comparer les valeurs entrées, activations, sorties et télémétrie avec chaque voiture.
6. Vérifier que le panneau indique la démonstration arcade et que les courses de laboratoire ne modifient ni carrière ni championnat.
7. Tester Circuit Studio : exporter un circuit valide, le charger dans les contrôleurs de laboratoire via un chemin de test disponible, puis retour menu → Steering → menu → Neural → menu à plusieurs reprises.
8. Confirmer REDLINE audible dans le menu seulement, silencieuse dans chaque session et de nouveau audible après retour au menu.

## Limites restantes

- Aucune inspection Chrome visuelle ni mesure FPS/mémoire n'a été possible; aucun résultat de performance visuelle n'est revendiqué.
- La bibliothèque des circuits utilisateur n'est pas directement proposée par le sélecteur du laboratoire principal, bien que la compatibilité de contrôleur avec un circuit Circuit Studio valide soit testée.
- Le Mode Professeur guide les transitions et affiche une notion; il ne pilote pas toutes les actions de sélection à la place du présentateur.
- La conformité officielle Casablanca G1 demeure indéterminée faute de barème/consignes G1 explicites dans les sources locales consultées.
- Les Steering Behaviors non utilisés par le contrôleur F1 restent dans le code et les démonstrations pédagogiques historiques; ils ne sont pas faussement présentés comme actifs dans Steering Lab.
