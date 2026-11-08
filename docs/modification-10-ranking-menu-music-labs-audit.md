# Modification 10 — classement, musique du menu et audit des laboratoires

Date de validation : 6 novembre 2026

## Résumé

La cause technique confirmée du classement anormal est le calcul de la grille de départ dans `RaceWorld.createGrid`. L’ancienne construction transmettait une distance absolue à `PathFollowing.pointAhead`, dont le contrat calcule une avance relative à la projection courante. Les rangées étaient donc décalées le long du circuit. Sur une piste fermée, cette géométrie pouvait faire franchir la ligne à une voiture partie derrière avant une voiture partie devant. Le classement n’était pas figé en P3 : il ordonnait correctement les positions et les franchissements que cette grille erronée produisait.

La grille utilise maintenant une interpolation directe à la distance de route demandée. Des courses headless déterministes avec le joueur en troisième place vérifient les arrivées P1, P2 et P3. Le classement final est capturé une fois puis partagé entre le HUD, l’écran de résultats, le podium et la sauvegarde. Les positions de grille sont conservées séparément.

Une trame musicale originale procédurale a été ajoutée au gestionnaire Web Audio existant. Elle emploie une séquence harmonique, un motif mélodique, une basse, des percussions synthétiques et une programmation à l’avance pour éviter le séquencement au rythme des callbacks de l’interface.

## A — Classement P3 persistant

### Reproduction et cause

Le test construit un circuit circulaire à 80 points, place le pilote humain en P3, applique des vitesses fixes par voiture et fait avancer chaque voiture par station de route à pas fixe de 50 ms. Il exécute le compte à rebours, les mises à jour de `RaceTiming`, les validations de tours et la finalisation de `RaceDirector`.

Avant correction, `createGrid` utilisait `pointAhead(0, 0, station)` pour placer une voiture à une station absolue. `pointAhead` repart de la projection courante et ajoute la longueur du segment courant : la valeur demandée était ainsi appliquée comme avance relative. Sur la reproduction circulaire antérieure à la correction, la voiture en P3 franchissait la ligne avant la voiture en P1 (environ 20,66 s contre 26,9 s dans le cas mesuré). Cette inversion suffit à expliquer un classement visuellement déroutant sans supposer un défaut du tri final.

### Correction et source de vérité

- `RaceWorld.createGrid` appelle maintenant `pointAtStation`, une interpolation directe entre les points de route à la station voulue, puis applique le décalage latéral de grille.
- `RaceTiming` continue de valider les tours sur un franchissement avant de la ligne, dans la largeur permise et après une distance de route suffisante. Un saut de projection trop grand n’ajoute pas la distance nécessaire à la validation.
- `RaceLeaderboard` classe d’abord les voitures arrivées selon leur temps réel de franchissement; les voitures non terminées sont ensuite départagées par tours et progression validée, avec une règle déterministe en cas d’égalité.
- `RaceSession` gèle le tableau quand la course passe à l’état terminé. Le même instantané alimente position affichée, écran de résultats, podium et sauvegarde. Le rang de grille est conservé dans `gridPosition` et présenté séparément dans l’historique.
- L’identité persistante de pilote est `driverId`; `carId` conserve l’identifiant de la voiture. Le laboratoire ne déclenche pas l’enregistrement de carrière.

### Résultats des scénarios

Le test `tests/race-ranking-session-integration.test.js` fait partir le joueur en P3 et vérifie les trois résultats :

| Résultat obtenu | Position affichée du pilote humain | Résultat sauvegardé |
|---|---:|---|
| Arrivée P1 | P1 | P1, grille P3, temps de franchissement réel |
| Arrivée P2 | P2 | P2, grille P3, temps de franchissement réel |
| Arrivée P3 | P3 | P3, grille P3, temps de franchissement réel |

Le même fichier couvre une prise de tête au dernier tour, une grille ordonnée avant la ligne, l’identité du pilote, le gel du classement après l’arrivée, les diagnostics d’événements et la cohérence des points du championnat. `tests/race-ranking-validation.test.js` couvre les scénarios antérieurs de validation du classement. Les tests d’intégration vérifient le service de présentation commun utilisé par la session et le stockage; ils ne remplacent pas un essai réel dans Chrome.

### Diagnostic de développement

Les diagnostics sont événementiels, pas produits à chaque frame. Pour les activer en mode Vite développement, depuis la console Chrome avant le lancement de la course :

```js
window.__NEURODRIVE_RACE_DIAGNOSTICS__ = true;
```

Les entrées `[NeuroDrive race diagnostic]` enregistrent notamment `driverId`, `carId`, `isHuman`, `gridPosition`, `completedLaps`, `validatedProgress`, `totalProgress`, `finishTime`, `liveRank`, `finalRank`, `displayedRank` et `raceState` aux changements d’état, rang, dépassement et événements de ligne. La valeur `displayedRank` est renseignée à la prochaine actualisation du HUD; un événement de ligne peut donc précéder l’échantillonnage HUD suivant.

## B — Musique originale du menu

`AudioManager` reste l’unique graphe audio partagé. Une séquence procédurale originale ajoute une progression harmonique de quatre mesures, un motif mélodique, une basse rythmique, des coups de grosse caisse et de caisse claire filtrés, ainsi que des charlestons. Les tempos et accords changent selon le menu, garage, championnat, tutoriel, laboratoires et podium. Un ordonnanceur Web Audio avec anticipation de 120 ms programme les notes; un seul ordonnanceur est actif, et les sources courtes sont suivies puis nettoyées à leur fin.

La lecture attend le déverrouillage autorisé par interaction utilisateur et respecte les gains Master/Musique, le mode muet, la pause, le départ en course et le retour au menu. Les changements d’écran utilisent les rampes de gain déjà en place. Aucun fichier musical tiers ou morceau commercial n’a été ajouté.

Les tests simulés vérifient le séquenceur, l’absence de timer dupliqué lors des transitions d’onglets, l’arrêt en course, le redémarrage au menu et le nettoyage à la destruction. **La qualité artistique, l’équilibre subjectif et l’absence de clic audible n’ont pas été évalués par écoute sur Chrome ou matériel audio réel.** La composition est une pièce synthétique procédurale; sa qualité sonore réelle doit être écoutée avant de la qualifier de thème final.

## C — Audit pédagogique et technique des laboratoires

### Architecture et intégrité

Les deux laboratoires intégrés s’appuient sur `RaceSession`, `RaceWorld`, les voitures `GameCar`/`FormulaCar`, les pistes et caméras du jeu. Ils n’ouvrent pas un moteur scientifique séparé. Les résultats arcade restent distincts du protocole historique et les courses laboratoire ne sont pas écrites dans la carrière.

Neural Lab charge les fichiers A/B/C via `loadHistoricalBrain`, vérifie provenance et architecture `[7,16,16,2]`, puis crée un `HistoricalBrainAdapter` par affectation de pilote. Chaque adaptateur possède ses propres capteurs, constructeur d’observations et contrôleur. Le panneau lit les observations, commandes et activations du contrôleur de la voiture suivie, et non un tableau global partagé.

Les sept entrées historiques exposées par l’adaptateur sont cinq distances de capteurs normalisées, la vitesse normalisée et l’erreur d’orientation normalisée par π. Les deux commandes observées sont la direction et la commande longitudinale signée. Le contrôleur convertit ces commandes en force pour `GameVehicleDynamics` arcade. Cela change la dynamique, les unités d’action et le déroulement des épisodes par rapport au moteur historique : les courses intégrées sont des démonstrations arcade, pas une réplication des mesures scientifiques.

Steering Lab choisit initialement une voiture disposant d’un `RaceController` Steering. Le moteur de course calcule Path Following, Obstacle Avoidance, Separation et Pursuit conditionnel; la sortie de force et les contributions du `BehaviorManager` sont publiées par le contrôleur. Si l’utilisateur choisit le pilote humain, le panneau signale qu’aucune force IA n’est calculée et propose de suivre une voiture Steering AI. Les comportements généraux comme Flee, Arrive, Evade, Wander, Alignment ou Cohesion existent dans les composants pédagogiques, mais ils ne sont pas prétendus actifs dans ce contrôleur F1.

### Matrice de correspondance au cours

Références ci-dessous : support local `docs/professor-course/Steering behaviors Master Miage IA2.pptx`, numéros de diapositives PowerPoint. « Démonstration historique » désigne un outil conservé mais non accessible par les cartes principales des laboratoires intégrés.

| Notion | Référence du cours | Implémentation réelle / preuve | Limite et statut |
|---|---|---|---|
| Modèle réactif et force Steering | 10–13 | `BehaviorManager`, `SteeringBehaviors.js`; tests `steering-behaviors.test.js` | Le cours présente le modèle; couverture pratique vérifiée. |
| Seek | 14–18 | `SeekBehavior`, formule vitesse désirée moins vitesse actuelle; tests unitaires steering | Disponible dans l’Academy et les composants, pas actif comme force distincte du contrôleur F1. |
| Flee | 17–18 | Comportement autonome et tests unitaires | Démonstration pédagogique conservée; non utilisé dans la course F1. |
| Pursuit | 19–21 | `RaceController` active Pursuit seulement selon le plan de dépassement; tests `integrated-ai-labs.test.js`, contrôles RaceController | Conditionnel, n’est pas toujours actif. |
| Evade | 20–21 | Comportement autonome et tests unitaires | Pas utilisé par le contrôleur de course actuel. |
| Arrive | 22–25 | Comportement autonome avec ralentissement près de la cible; tests steering | Pas utilisé par le contrôleur de course actuel. |
| Wander | 26–28 | Comportement autonome à source aléatoire injectable; tests de déterminisme | Pas utilisé par le contrôleur de course actuel. |
| Projection scalaire / Path Following | 29–31 | `PathFollowing`; tests `path-following-advanced.test.js`, `phase11-race-engine.test.js` | Utilisé en course Steering. |
| Obstacle Avoidance | 32–36 | `RaceController` et tests de comportements/intégration | Utilisé en course Steering; dépend de la géométrie et des obstacles arcade. |
| Alignment / Cohesion / Separation / Boids | 37–42 | Composants autonomes et tests unitaires | Separation fait partie du contrôleur F1; Alignment/Cohesion/Boids restent démonstratifs, non activés en course. |
| Leader Following | 50–51 | Comportement et tests Phase 10 | Disponible en laboratoire pédagogique historique; pas revendiqué dans le contrôleur de course intégré. |
| Réseau neuronal | 43–49 | `HistoricalBrainAdapter`, `ObservationBuilder`, `NeuralController`; tests `integrated-ai-labs.test.js`, `neural-racing-lab.test.js` | Cerveaux historiques affichés via adaptateur arcade; ce n’est pas une mesure de performance historique. |
| Algorithme génétique / neuroévolution | 43–49 | Trainer et résultats phases 4–8 documentés dans `docs/phase8-configuration-c.md` et `docs/phase13-neural-racing-lab.md`; tests training et intégrité | L’entraînement historique n’est pas lancé par cette modification. |
| Fonction de fitness | 43–49 | Trainer scientifique historique et fichiers de protocole Phase 8; tests `training.test.js` | Les scores arcade ne sont pas la fitness historique. |
| Généralisation | 43–49 et protocole Phase 8 | Pistes de validation/held-out documentées; `tests/phase8-heldout.test.js`, `tests/generalization.test.js` | Le mode arcade ne remplace pas le test held-out historique. |

### Ce qui est établi pour Casablanca G1

Le support de cours référence le dépôt `SteeringBehavioursM2IA2_Casa_2026_2027` à la diapositive 8; un clone local existe. Il contient des supports et exemples, dont un sous-projet NeuroDrive distinct. Les diapositives 52–55 identifient explicitement des sujets « Projets Master IA2 Nice 2025–2026 »; les diapositives suivantes mentionnent d’autres promotions et établissements. Elles ne constituent donc pas, à elles seules, une liste prouvée d’exigences de Casablanca G1. Aucun énoncé local explicite de projet G1 prouvant que chaque comportement ou fonctionnalité est obligatoire n’a été confirmé dans cet audit. Le rapport établit la correspondance pédagogique et ses limites, pas une conformité officielle de groupe.

## Fichiers modifiés

- `src/game/RaceWorld.js` — interpolation correcte des positions de grille.
- `src/game/RaceTiming.js`, `src/game/GameCar.js` — événements de ligne et identité/position de grille persistantes.
- `src/game/RaceSession.js`, `src/game/RacePresentation.js`, `src/game/RaceDiagnostics.js`, `src/game/CareerStore.js`, `src/ui/CareerPanel.js`, `src/game/createRosterRaceWorld.js` — classement partagé/final, diagnostics et conservation de la position de grille.
- `src/game/AudioManager.js` — séquence musicale procédurale et gestion de son cycle de vie dans le graphe existant.
- `tests/race-ranking-session-integration.test.js`, `tests/phase14-audio-haptics.test.js` — scénarios P3 et cycle de vie du thème musical.
- `docs/modification-10-ranking-menu-music-labs-audit.md` — ce rapport.

## Validation

- `npm.cmd test` : **238 tests réussis**, 34 fichiers de test.
- `npm.cmd run build` : **réussi**. Vite signale un chunk Three.js de 507,79 kB au-dessus de son seuil de 500 kB; c’est un avertissement de taille du bundle, pas une mesure de FPS.
- Manifeste `docs/ultimate-edition-lot5-1-integrity.csv` : **175/175 empreintes SHA-256 vérifiées**, aucune entrée manquante ou modifiée.
- Aucun entraînement n’a été lancé; aucun poids, protocole ou résultat scientifique historique n’a été modifié.
- Aucun test visuel Chrome ni écoute audio réelle n’a été effectué dans cette validation. La reproduction du classement est une simulation headless déterministe.

## Checklist Chrome à effectuer

1. Ouvrir une course rapide sur un circuit circulaire/fermé, activer la console de diagnostic avant lancement, et confirmer que les distances de grille progressent proprement derrière la ligne.
2. Partir en P3, dépasser deux voitures et terminer. Vérifier le classement live, le P final, le podium et l’historique de carrière; répéter pour terminer P2/P3.
3. Vérifier un dépassement à l’approche de la ligne, une arrivée rapprochée et un pilote doublé; confirmer que le classement ne bouge plus après son gel final.
4. Écouter le menu après le premier clic, naviguer entre menu/garage/championnat/laboratoires, lancer puis quitter une course; vérifier le fondu, le volume Musique, le mode muet et l’absence de doublon.
5. Écouter au casque ou sur haut-parleurs à volume modéré et vérifier l’absence de clic/saturation sur la boucle musicale.
6. Dans Steering Lab, vérifier qu’une IA est suivie initialement, qu’un contrôleur humain est correctement signalé et que le bouton propose un pilote Steering IA.
7. Dans Neural Lab, sélectionner A, B et C successivement et vérifier les observations/activations de la voiture suivie, la provenance et la mention de non-comparabilité arcade.

