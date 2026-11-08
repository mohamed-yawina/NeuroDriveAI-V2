# NeuroDriveAI V2 - Voiture suit circuit

Simulation autonome de course en Three.js pour le Master IA2. La voiture low-poly est guidee par des forces de steering et un suivi de chemin avec anticipation. L'IA, la dynamique physique et le rendu restent separes afin de preparer une future phase d'apprentissage neuronal.

## Installation et lancement

Prerequis : Node.js 20.19+ ou 22.12+, npm.

```bash
npm install
npm run dev
```

Ouvrez l'adresse locale affichee par Vite.

### NeuroDrive F1 — Red Racing Edition (Phase 14)

Le menu principal présente une monoplace dans un showroom Three.js : glissez pour la faire pivoter, utilisez la molette pour zoomer, puis choisissez une livrée et une vue depuis Garage. Circuits permet de choisir l'une des trois pistes du moteur et une course de 3, 5 ou 8 tours. Jouer lance le moteur F1 arcade contre cinq pilotes autonomes. Les commandes sont ↑/W (accélérer), ↓/S (freiner), ←/A et →/D (braquer), Espace (pause), R (redémarrer) et C (changer de caméra). Le HUD fournit vitesse, tours, meilleur tour, classement, mini-carte et incidents relevés par la télémétrie. La fin de course affiche un podium 3D et le classement.

L'audio est synthétisé avec Web Audio après une interaction utilisateur. Les volumes moteur, effets, ambiance et interface sont réglables. Haptique utilise Gamepad API ou `navigator.vibrate` quand le navigateur et le contrôleur les exposent ; l'option se désactive sans API détectée. Aucun fichier audio tiers n'est nécessaire.

Carrière, stratégie pneus/ERS, boîte de vitesses, météo et replay ne sont pas disponibles. Ces options n'influencent pas la course. Steering Academy, Circuit Studio et Neural Racing Lab restent accessibles depuis le menu. Les détails de correspondance du wireframe se trouvent dans [docs/phase14-red-racing-edition.md](docs/phase14-red-racing-edition.md).

### Démonstration Phase 9

L'écran d'accueil permet de choisir le circuit, Steering Behaviors ou Neural, et la configuration A, B ou C avant de lancer la simulation. Le pilote neuronal charge le réseau public préservé de la configuration choisie. Les commandes en course sont Espace (pause/reprise), R (redémarrage), C (caméra de poursuite/vue aérienne) et **Retour au menu** (ferme la session et libère la scène 3D). Le circuit et le modèle actifs sont affichés dans le HUD. Les trois circuits interactifs réutilisent les géométries de généralisation déjà présentes dans le projet.

Pour lancer l'application avec npm sous Windows :

```powershell
npm.cmd install
npm.cmd run dev
```

Pour servir le build localement après compilation :

```powershell
npm.cmd run build
npm.cmd run preview
```

Le panneau AI Lab conserve l'entraînement dans un Web Worker, l'import/export JSON/CSV, les comparaisons appariées et les résultats A/B/C. Retour au menu demande l'arrêt du worker d'entraînement de cette session à la fin de l'épisode courant; les commandes d'entraînement lancées dans un autre processus restent indépendantes. L'export de présentation lit la configuration C complète dans `results/phase8-c-recovered-resume-20261102-2231/` et peut recevoir un autre dossier complet via `npm.cmd run export:phase8-ai-lab -- --phase8-c-dir=<dossier>`.

## Commandes

- **Espace** : pause / reprise
- **R** : redemarrer la simulation
- **C** : camera de poursuite / vue aerienne
- **D** : afficher / masquer le debug du chemin
- **S** : afficher / masquer les cinq rayons des capteurs

## AI Lab et pilote neuronal

Le panneau AI Lab lance une neuro-evolution dans un Web Worker. Chaque individu est execute dans `TrainingEnvironment`, qui reutilise le modele de piste, les capteurs, l'observateur, les forces et l'integration physique du jeu sans creer de renderer. Les episodes utilisent un pas fixe de 1/30 s, une limite de 45 s, et se terminent sur un tour valide, 3.5 s hors piste, 4 s bloque ou la limite de temps.

Les reglages par defaut sont 250 generations, 16 individus, 4 elites, mutation gaussienne de taux 0.08 et ecart-type 0.12. La graine par defaut est 2026. Les 16 individus sont evalues a chaque generation; la recompense combine progression signee physiquement plausible, tours valides, maintien sur piste, vitesse avant, sorties, blocage et variations de braquage. Ce sont des parametres de depart pedagogiques, pas une garantie de convergence ni de performance de course. L'entrainement peut prendre plusieurs minutes selon le navigateur et les episodes.

Apres une generation, **Tester le meilleur** charge le vrai reseau dans la simulation en direct. Le pilote `Neural` est aussi selectionnable apres entrainement ou import. **Exporter JSON** et **Importer un modele JSON** sauvegardent ou valident l'architecture fixe `7-16-16-2`. Les poids exportes sont le meilleur individu evalue, sans entrainement simule ni substitution du pilote classique.

## Validation scientifique

Le bouton **Entraîner x3 seeds** lance trois runs sequentiels aux graines de base, base+1 et base+2. Pour chaque generation, les 16 episodes sont termines avant de calculer le meilleur score de generation, le meilleur global, la moyenne et les agregats physiques. Le graphique trace le meilleur score de generation (vert) et la moyenne de population (bleu); pour plusieurs graines, chaque courbe est la moyenne entre les runs aux generations correspondantes. **Exporter statistiques CSV** produit une ligne par generation et par graine, avec les metriques agregees et les metriques de l'episode gagnant, notamment sa cause de fin, ses tours, sa progression signee, ses sorties et blocages. Un tour valide exige un franchissement avant de la ligne et au moins 95% de longueur signee; ce seuil empeche de compter comme tour le segment partiel initial lorsque le spawn est aleatoire.

**Comparer Steering / Neural x3** execute les deux pilotes avec le meme depart, cap, circuit, pas de temps et limites pour chacune de trois graines. Le runner hors interface reproduit le protocole complet et ecrit les fichiers de resultats:

```bash
npm run validate:training
```

Par defaut, ce script execute 250 generations, 16 individus et les graines 2026, 2027 et 2028. Il enregistre `results/phase4-scientific-validation.json` et `results/phase4-generation-statistics.csv`. Options: `node scripts/run-scientific-validation.js --seeds=2026,2027,2028 --generations=250 --population=16`. Le meilleur score peut varier avec la graine; ces runs mesurent cette variabilite et ne constituent pas, seuls, une validation de generalisation hors de ce circuit.

## Verification

```bash
npm test
npm run build
```

## Validation de generalisation

Apres la validation d'entrainement, executez `npm run validate:generalization`. Le protocole charge sans les modifier les trois meilleurs reseaux sauvegardes, puis les compare a Steering sur 30 scenarios apparies du circuit original et de deux variantes. Les resultats scenario par scenario sont enregistres dans `results/phase6-generalization-validation.json` et `results/phase6-generalization-validation.csv`; le protocole, les intervalles de confiance et l'interpretation sont dans `docs/generalization-validation.md`.

## Entrainement multi-circuits

Pour reproduire la phase 7, executez `npm run train:multitrack -- --generations=50 --population=8 --seeds=2026,2027,2028`. Le processus entraine un reseau par graine sur l'original, le circuit technique et l'ovale, puis produit des jeux de validation et de test independants. Les artefacts `results/phase7-*` et la documentation scientifique sont dans `docs/multitrack-training.md`; les fichiers historiques des phases precedentes restent separes.

## Phase 8 : configurations A/B/C

La configuration C a ete terminee pour les trois graines et validee sur les circuits original, technique, fast oval et le circuit final inedit. L'ancien checkpoint incomplet reste conserve; le jeu complet et ses exports sont dans `results/phase8-c-recovered-resume-20261102-2231/`. Le protocole, la reprise deterministe de 2028, les resultats et leurs limites sont decrits dans `docs/phase8-configuration-c.md`. Pour une future reprise interrompue de C, utilisez `npm run recover:phase8-c -- --attempt=<identifiant-unique>`; les checkpoints complets sont versionnes et les resultats precedents ne sont pas remplaces.

## Phase 10 : Steering Academy

Depuis le menu, **Steering Academy** ouvre le laboratoire interactif Seek, Flee, Arrive, Pursuit, Evade, Wander, Obstacle Avoidance, Separation, Alignment, Cohesion, Boids, Leader Following et Path Following. Les comportements peuvent être activés ensemble et réglés par poids. Le panneau montre leurs forces, leurs forces pondérées et la résultante plafonnée à `maxForce`. La simulation utilise un pas fixe de 1/60 s et un générateur aléatoire réinitialisable par graine.

Les formules, références aux diapositives du support du professeur, choix du BehaviorManager et tests sont documentés dans `docs/phase10-steering-academy.md`. Cette phase ne modifie ni le moteur des expériences historiques, ni les modèles/résultats A/B/C, et ne lance aucun entraînement.

## Phase 11 : Formula 1 Racing Engine

Le bouton **Lancer la course** ouvre une course de trois tours sur le circuit choisi. La grille contient six voitures, dont une voiture joueur et cinq pilotes autonomes. Le départ utilise cinq feux rouges et un compte à rebours de trois secondes. Les commandes sont **Flèches / WASD** pour accélérer, freiner et braquer, **Espace** pour pause/reprise, **R** pour recommencer, **C** pour changer de caméra, **1–6** ou le sélecteur pour suivre une voiture, et **Retour au menu** pour fermer proprement la session. Le HUD affiche la vitesse, le tour, le meilleur temps, le classement et une mini-carte.

Le moteur jouable est isolé dans `src/game/`. Sa dynamique arcade utilise un pas fixe de 1/60 s et ses propres réponses aux collisions. Les IA composent Path Following, Obstacle Avoidance, Separation et Pursuit via le `BehaviorManager`; le planificateur vérifie les voies, gère le décalage de dépassement et revient vers la ligne de course. Le moteur de `src/physics/VehicleDynamics.js` et les protocoles scientifiques historiques restent séparés.

**Ouvrir Neural AI Lab** conserve la simulation individuelle, le choix Steering/Neural et les modèles A/B/C historiques. **Steering Academy** reste accessible depuis le menu. Les formules, classes, limites connues et tests sont documentés dans `docs/phase11-f1-racing-engine.md`.

## Phase 12 : Circuit Studio

Le menu **Circuit Studio** permet d'éditer des points de contrôle, fermer la boucle, régler la largeur et la ligne de départ, annuler/rétablir, réinitialiser, importer/exporter du JSON et gérer une bibliothèque locale de circuits utilisateur. Le générateur crée des circuits Easy, Medium ou Hard de façon déterministe à partir d'une graine. La validation vérifie la courbe Catmull-Rom, les intersections, la largeur et la sécurité de la grille de six voitures avant d'autoriser les tests.

Les commandes **Tester Steering**, **Tester F1 Racing**, **Préparer Neural** et **Path Following Academy** passent le même circuit à leurs moteurs respectifs. Le mode Neural utilise seulement les artefacts choisis dans Neural AI Lab; Circuit Studio ne lance pas d'entraînement. Le format, les seuils de validation et les adaptations sont détaillés dans `docs/phase12-circuit-studio.md`.

## Architecture

- `src/main.js` : menu, chargement dynamique des modes et navigation de session
- `src/game/` : grille F1, dynamique arcade, IA de course, collisions, dépassement, temps et classement
- `src/scene/` : scene, circuit, monoplace, camera et visualisation debug
- `src/ai/` : seek, suivi anticipe, capteurs, observations, telemetry et controleurs
- `src/ai/TrackSensors.js` : intersections rayon-segments sur les bords reels du circuit
- `src/ai/ObservationBuilder.js` : vecteur d'entree a sept valeurs normalisees
- `src/ai/TelemetryRecorder.js` : progression signee, tours valides et statistiques sans rendu
- `src/ai/SteeringController.js` et `src/ai/NeuralController.js` : controleurs interchangeables qui emettent des forces physiques
- `src/ai/neural/NeuralNetwork.js` : perceptron 7-16-16-2, mutation, copie et JSON valide
- `src/ai/training/` : environnement physique sans rendu, recompense, PRNG et trainer genetique
- `src/ai/training/ControllerComparison.js` et `TrainingCsv.js` : episodes apparies et export des agregats par generation
- `src/ai/training/trainingWorker.js` : execution asynchrone de l'entrainement
- `src/ui/AiLabPanel.js` : controles, graphique, selection, import et export du pilote
- `scripts/run-scientific-validation.js` : protocole reproductible multi-graines et sauvegarde des resultats
- `src/physics/VehicleDynamics.js` : integration temporelle et orchestration du controleur
- `src/ui/HUD.js` : AI Lab, telemetrie et avertissement de sortie de piste
- `tests/` : tests des forces, capteurs, observations, tours, telemetrie et integration

## Pilotage

La vitesse desiree pointe vers la cible et est reduite en amont des virages selon la courbure. La force suit `steering = desiredVelocity - currentVelocity`, est limitee par `maxForce`, puis l'integration physique utilise `deltaTime` et des sous-pas stables. Le follower projette une position predite sur le segment le plus proche, avance le long des segments cycliques pour placer sa cible et gere le raccord dernier/premier segment. Les capteurs interrogent les segments de bord exportes par la geometrie de piste. La progression est projetee sur le chemin et cumulee avec son signe; un tour ne compte qu'apres un franchissement avant de la ligne et au moins 95% de longueur validee. Le reseau neuronal est entraine par neuro-evolution; TensorFlow.js n'est pas utilise.

## NeuroDrive F1 Ultimate Edition

La feuille de route des 40 fonctions, leurs critères d’acceptation et leur statut vérifié sont dans [`docs/ultimate-edition-roadmap.md`](docs/ultimate-edition-roadmap.md). Le lot 1 ajoute en course arcade un mode professeur avec visualisation des forces réellement calculées, réglages dynamiques du BehaviorManager, profils d’IA et défense de voie. Les équations d’entraînement et résultats historiques restent hors de ce moteur; détails et limites dans [`docs/ultimate-edition-lot1-steering-ai.md`](docs/ultimate-edition-lot1-steering-ai.md).

Le Neural Racing Lab documenté pour l'Ultimate Edition est décrit dans [docs/ultimate-edition-lot2-neural-research.md](docs/ultimate-edition-lot2-neural-research.md); cette extension distingue explicitement replays arcade, modèles historiques et données d'entraînement réellement enregistrées.

L'extension Ultimate lot 3 ajoute des mécaniques d'arcade optionnelles (tour de formation, boîte, DRS, ERS, pneus, stands et dégâts) sans toucher au moteur scientifique. Limites et contrôles : [docs/ultimate-edition-lot3-arcade-gameplay.md](docs/ultimate-edition-lot3-arcade-gameplay.md).


Ultimate Edition graphics and immersion, lot 4 (features 09-16), are documented in [docs/ultimate-edition-lot4-visual-immersion.md](docs/ultimate-edition-lot4-visual-immersion.md). Lighting, visual weather, bounded particles, race flags, animated crowd, TV cameras and photo capture are implemented in the arcade race session. Weather remains visual-only. TV camera has a dedicated control; the original four-camera cycle is preserved.

Ultimate Edition lot 5 adds local career storage and a keyboard tutorial. The exact feature scope and known partials are listed in [docs/ultimate-edition-lot5-career.md](docs/ultimate-edition-lot5-career.md); the 40-feature status matrix is in [docs/ultimate-edition-roadmap.md](docs/ultimate-edition-roadmap.md).


## Ultimate Edition LOT 5.1

Features 37–40 are described in [the LOT 5.1 report](docs/ultimate-edition-lot5-1.md): bounded sampled 3D race replays with interpolation and legacy import; a measured resumable cross-mode tutorial; a guided 180-second professor timeline; and an evidence map from course slides to code, tests, demonstrations and limits. These modes do not start training. Run npm.cmd test and npm.cmd run build for validation. Browser playback and manual walkthroughs remain on the documented checklist.