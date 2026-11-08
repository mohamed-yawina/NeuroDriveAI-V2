# Phase 14 — NeuroDrive F1 Red Racing Edition

## Référence de conception

Référence consultée : `docs/design/NeuroDrive F1 3D Wireframes.pdf` (7 pages, 3840 × 2160, pages rendues depuis les images intégrées au PDF).

| Page | Écran et contenu du wireframe | Réalisation actuelle / écart |
|---|---|---|
| 1 | Accueil, navigation, showroom 3D manipulable, course rapide, raccourcis AI Lab | Showroom Three.js avec la FormulaCar existante, rotation automatique, drag, zoom, livrées, navigation, sélection circuit et accès aux laboratoires. Carrière et « continuer la saison » sont indisponibles. |
| 2 | Garage, livrées, caméra, améliorations aérodynamiques et mécaniques | Garage fonctionnel pour les couleurs et vues avant/arrière/côté/dessus/3⁄4. Pas de budget, d'ERS, d'usure, de pneus ou de pièces réglables : les systèmes correspondants n'existent pas dans la physique. |
| 3 | Sélection avec aperçu 3D, fiche longueur/virages/record, météo et niveau IA | Les trois circuits existants sont dessinés dans le showroom à partir de leurs vraies waypoints, rotation et zoom compris. Choix de 3/5/8 tours transmis au moteur. La fiche métrique détaillée, météo et niveaux IA ne sont pas simulés. |
| 4 | Grille, portique de feux, ordre, pneus/stratégie et météo | Grille de six voitures, compte à rebours et feux HUD conservés; Phase 14.1 ajoute le portique 3D synchronisé. Pneus, stratégie et météo restent indisponibles. |
| 5 | HUD vitesse, tours, chronos, classement, mini-carte, contrôles et télémétrie | HUD existant habillé en rouge, classement vivant, chronomètre, tour, meilleur tour, mini-carte, vitesse, caméra, pause/redémarrage, incidents individuels et circuit actif. Pas de rapports, DRS, pneus, ERS, écarts temporels ni radio. |
| 6 | Caméras et lecteur de replay | Caméras existantes (poursuite, piste, cockpit, aérienne) et sélection de voiture suivie. Aucun lecteur/replay/export de clip n'est affiché : l'enregistrement de trajectoire n'est pas implémenté. |
| 7 | Podium 3D, confettis, classement et statistiques | Podium 3D assemblé au terme de la course avec les voitures classées, blocs, confettis déterministes et classement final. Pas de progression de carrière, XP, budget, pénalités ou télémétrie historique par tour. |

Les écrans du wireframe sont une direction graphique. Les éléments dépendant d'une simulation inexistante sont signalés au lieu d'être simulés par l'interface.

## Modules ajoutés/modifiés

- `src/scene/MenuShowroom.js` : vue de showroom, éclairage et plateforme dédiés, commandes orbit/zoom et arrêt du rendu lorsque le menu est couvert.
- `src/scene/FormulaCar.js` : moyeux métalliques et rayons de roue visibles ; aucune donnée physique n'est liée à ces détails.
- `src/main.js` : menu principal, panneaux Garage/Circuits/Réglages, navigation des laboratoires, préférence de livrée, nombre de tours et branchement des choix au lancement de course.
- `src/game/AudioManager.js` : moteur procédural corrélé à la vitesse, ambiance, signaux d'interface/départ/freinage/collision/sortie/fin, volumes séparés, persistance, pause et nettoyage. Le contexte est créé au premier déverrouillage utilisateur puis réutilisé.
- `src/game/HapticsManager.js` : Gamepad `dual-rumble`/`pulse` et `navigator.vibrate`, auto-désactivation si aucune API n'est détectée, intensité, persistance et limitation de fréquence.
- `src/game/RaceSession.js` : volumes/audio session, événements de course, incidents affichés, tour configurable, classement final et podium Three.js.
- `src/scene/Track.js` : marqueurs décoratifs de trajectoire plus petits et rouge sombre.
- `src/scene/SceneManager.js`, `src/game/RaceCameras.js` et `src/game/RaceSession.js` : optimisation du décor statique, poursuite dépendante de la vitesse et secousse de collision limitée à la caméra.
- `src/style.css` : système Racing Red / carbone / blanc, menu showroom, panneaux, HUD responsive et adaptations visuelles des laboratoires.
- `tests/phase14-audio-haptics.test.js` : tests des contextes audio, pause, nettoyage, indisponibilité des API, Gamepad/mobile, désactivation et cadence.

La finition de jeu Phase 14.1, les optimisations et les limites de validation sont détaillées dans [`phase14.1-f1-racing-polish.md`](phase14.1-f1-racing-polish.md).

## Garanties de séparation

- Les modèles A/B/C, leurs poids, les résultats scientifiques, les circuits historiques et les scripts d'entraînement ne sont pas modifiés.
- Aucun entraînement n'est lancé.
- Les règles et équations du moteur de course restent inchangées. La livrée n'affecte que la couleur visuelle du pilote joueur.
- L'audio n'utilise que des oscillateurs et bruit procédural générés à l'exécution.
- L'haptique reste une capacité facultative du navigateur/matériel ; absence d'API entraîne désactivation. Collisions, sorties de piste et freinages brusques sont raccordés. Le moteur n'expose pas de contact de bordure ; aucun signal de vibration de bordure n'est donc inventé.
- La page de replay, les réglages météo, stratégie pneus/ERS/boîte et carrière restent indisponibles.

## Validation

Commandes exécutées après cette livraison :

```powershell
npm.cmd test
npm.cmd run build
```

Résultat : **115 tests passés** (18 fichiers), build Vite réussi. Le découpage dynamique du showroom réduit le bundle d'entrée à **14,39 kB**; Three.js est isolé dans un chunk de **496,68 kB**, sans avertissement de taille Vite.

Le menu/showroom, Garage, le circuit 3D, le HUD de course, pause/reprise, redémarrage, retour au menu et deux cycles menu → course → menu ont été manipulés dans Chrome headless. Les captures ont confirmé un seul renderer showroom restant après chaque retour (les deux canvas d'analyse déjà présents dans l'AI Lab restent montés). Après découpage dynamique, un rechargement puis lancement et retour menu ont également été vérifiés; aucune exception JavaScript n'a été relevée. Le déclenchement du panneau de fin a été exercé sur un état headless synthétique et la scène 3D podium dispose d'un test unitaire; la visibilité du podium pendant une course réelle reste une vérification manuelle recommandée. Les API Audio/Web Audio et haptique sont testées par mocks ; le son sur haut-parleurs et la vibration sur une manette/téléphone réel ne sont pas certifiés ici.

### Vérifications manuelles à compléter sur matériel réel

- Écouter moteur, ambiance, feux, collision, freinage et fin, ajuster chaque volume et confirmer silence après retour au menu.
- Tester collision, sortie et freinage sur un contrôleur compatible, puis confirmer l'option désactivée sans API; aucun événement bordure n'est encore fourni par le moteur.
- Vérifier les cinq angles de garage et le zoom/drag en tactile/souris, notamment sur mobile.
- Faire finir une course entière et vérifier le podium, le classement final et la nouvelle course.
- Vérifier les différences d'éclairage entre WebGL accéléré et rendu logiciel headless.
