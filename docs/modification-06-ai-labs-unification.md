# Modification 06 — Refonte définitive des Laboratoires IA

## Cause de l'ancienne interface

Le menu Racing Red était créé et ajouté à `#app`, mais `index.html` fournissait déjà un second ensemble complet de DOM statique : viewport, HUD télémétrique, panneau « AI LAB », commandes d'entraînement et réglages de neuroévolution. La feuille de style de présentation ne masquait pas ces éléments; elle ne faisait que modifier leurs événements pointeur. Le menu recouvrait donc l'ancien laboratoire sans le remplacer, ce qui le rendait encore visible lorsque le menu disparaissait.

Un second chemin de navigation contribuait à cette confusion : une carte « AI LAB · outils historiques » appelait `launch({ lab: true })`, qui construisait `SimulationSession`. Des boutons cachés sous les outils historiques pouvaient aussi lancer `SteeringAcademy` ou `NeuralRacingLab` autonomes.

## Routes corrigées

Les deux entrées du menu sont désormais `steering-lab` et `neural-lab`, dispatchées par `bindMainMenuEntries` vers `createIntegratedLabEntryActions`. Ces callbacks appellent `launchSteeringLab` et `launchNeuralLab` dans `src/ui/IntegratedLabLaunch.js`. Les deux créent une session `RaceSession`; le mode Neural utilise aussi les pilotes et les règles du `RaceWorld` partagé.

La route legacy `lab: true`, le lien AI Lab historique et les liens directs aux ateliers autonomes ont été retirés du menu principal. Les chemins Tutoriel/Mode Professeur qui demandaient auparavant Neural Racing Lab redirigent maintenant vers le Neural Lab intégré. Le test Neural depuis Circuit Studio utilise également la session F1 intégrée.

Les modules historiques `SteeringAcademy`, `NeuralRacingLab`, `SimulationSession` et leurs données sont conservés dans le dépôt pour les tests, les références et la reproductibilité; ils ne sont plus liés par les cartes Laboratoires IA principales.

## Contenu des sessions

### Steering Lab

Le Steering Lab ouvre `RaceSession` avec `laboratory.type = 'steering'`. Il réutilise le circuit F1, `SceneManager`, les FormulaCar, les six voitures arcade, RaceWorld, RaceController, les caméras et la mini-carte. Le sélecteur suit une voiture réelle. Le panneau intégré affiche les contributions documentées du contrôleur de course, et le panneau Coach permet de changer les poids/activations réellement consommés par ces contrôleurs. Le ralenti agit sur l'accumulateur à pas fixe de RaceSession; pause, reprise, reset, caméras et retour restent les commandes de la session F1.

### Neural Lab

Le Neural Lab charge les artefacts historiques sélectionnés A/B/C et les valide par architecture et provenance. La sélection crée des contrôleurs distincts dans le `RaceWorld` arcade; les participants sélectionnés sont répartis sur six places avec des identités de voiture uniques. Steering AI demeure inclus pour comparaison. Le panneau expose les observations à sept dimensions, les sorties, les activations issues des inférences réelles, la progression et les compteurs de course.

L'adaptateur continue d'utiliser les observations/actions historiques, mais les réseaux agissent dans `GameVehicleDynamics` à 60 Hz; le protocole Phase 8 validait à 30 Hz dans le moteur scientifique. Les chiffres de cette session sont une démonstration arcade et ne sont pas comparables aux résultats scientifiques. Les résultats historiques, poids, graines et protocoles ne sont pas écrits. Les circuits non classés restent étiquetés comme tels; un circuit utilisateur passé par Circuit Studio peut être testé avec le même adaptateur arcade.

Les panneaux du laboratoire peuvent être repliés pour dégager la vue. Le viewport de départ est maintenant uniquement le viewport 3D F1; l'ancien HUD statique ne se trouve plus sous le menu.

## Fichiers modifiés

- `index.html` : document de démarrage réduit à l'application F1 et son viewport, retrait du HUD statique historique.
- `src/main.js` : seules les entrées Steering/Neural intégrées restent dans le menu; redirection Neural des outils Tutoriel/Professeur et Circuit Studio.
- `src/ui/MainMenuSections.js` : routes canoniques `steering-lab` et `neural-lab`; suppression de l'entrée legacy.
- `src/ui/IntegratedLabLaunch.js` : factories de lancement partagées et testables pour les sessions F1.
- `src/neural-lab/IntegratedLab.js` : grille de six places avec identités uniques, sans changer les cerveaux.
- `src/game/RaceSession.js`, `src/game/race-session.css` : panneau repliable et contrôles intégrés.
- `tests/main-menu-sections.test.js`, `tests/integrated-ai-labs.test.js` : routes, clics vers les factories de session, six places, modèles, contrôleurs et télémétrie réelle.

## Tests et protection scientifique

Les tests couvrent les entrées effectives (clic délégué → action → factory d'options RaceSession), les options du mode, le circuit sélectionné, la grille à six voitures, les contrôleurs Neural chargés, les activations/observations et la télémétrie de RaceWorld. Les suites Course rapide, championnat, tutoriel et les tests de nettoyage/navigation servent de non-régression.

Aucun modèle A/B/C, résultat historique, protocole ou moteur d'entraînement n'a été modifié et aucun entraînement n'a été lancé. Les fichiers scientifiques sont vérifiés à la fin contre le manifeste SHA-256 `docs/ultimate-edition-lot5-1-integrity.csv`.

## Validation Chrome

Si l'accès au navigateur demeure indisponible, effectuer cette checklist dans Chrome :

1. Recharger l'application et vérifier que seul le menu Racing Red apparaît, sans texte « NEURODRIVE AI — V2 — LABORATOIRE DE PILOTAGE AUTONOME » ni ancien panneau d'entraînement en arrière-plan.
2. Ouvrir Laboratoires IA → Steering Lab; vérifier la scène F1, six voitures, circuit, caméra et mini-carte. Suivre une IA, replier le panneau, modifier un poids Coach, ralentir, mettre en pause/reprendre, reset et revenir.
3. Ouvrir Laboratoires IA → Neural Lab; sélectionner A/B/C, vérifier six voitures, l'architecture, les entrées/sorties/activations, le suivi d'un pilote, pause/reset/caméra et l'avertissement arcade.
4. Tester un circuit standard et depuis Circuit Studio; revenir au menu et relancer chaque laboratoire afin de repérer un canvas ou listener en double.
5. Vérifier que les données carrière et résultats historiques sont inchangés; surveiller la console pour erreurs de navigation et de rendu.

Les validations navigateur ne sont pas considérées comme faites tant que ces actions ne sont pas vérifiées visuellement.

## Résultat d'exécution

- `npm.cmd test` : 31 fichiers, 206 tests réussis.
- `npm.cmd run build` : réussi. Vite signale le chunk Three.js d'environ 507,79 kB, sans mesure FPS associée.
- Manifeste scientifique : 175 entrées contrôlées, 0 manquante et 0 empreinte différente.
- Chrome : hôte navigateur indisponible dans cette session; checklist ci-dessus à réaliser manuellement.
- `git status` présente le dépôt comme fichiers non suivis dans cet environnement; aucun commit créé.
