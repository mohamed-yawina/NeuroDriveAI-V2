# Modification 11 — REDLINE et laboratoires IA interactifs

Date : 6 novembre 2026

## Résumé de validation

Cette modification ajoute une piste originale locale intitulée **NEURODRIVE — REDLINE**, une vue tridimensionnelle des forces réellement calculées par le `RaceController`, un diagramme neuronal lié aux poids/activations réels, une comparaison par pilote dans la même manche, et une chronologie Professeur recentrée sur les sessions F1 intégrées.

La piste a été rendue et intégrée, mais sa qualité artistique n’a pas été écoutée dans un navigateur ou sur du matériel audio. Je ne la qualifie donc pas de thème professionnel validé. Le WAV a été vérifié techniquement et peut être joué par les navigateurs courants.

## A — Musique

### Composition livrée

- Fichier : [`public/audio/neurodrive-redline.wav`](../public/audio/neurodrive-redline.wav)
- 132 BPM, stéréo PCM 44,1 kHz, 16 bits, durée 58,18 s, taille 10 263 320 octets.
- Composition générée hors ligne par [`scripts/generate-redline-theme.mjs`](../scripts/generate-redline-theme.mjs), sans samples tiers : intro clairsemée de quatre mesures, progression D mineur, basse, motif mélodique, kick, snare, hats, pause/breakdown, variation de reprise et fondu croisé de boucle.
- Crête mesurée : −1,11 dBFS; RMS : −17,13 dBFS. Le générateur limite le signal sous 0 dBFS.
- Empreinte du fichier : `E1073A8522FA4BD9530935462AE3A53387FFB05E0F13A9153A303476B9FC7E34`.

FFmpeg est installé comme lien WinGet, mais son exécutable cible est en dehors du périmètre accessible du workspace et l’exécution a été refusée par le sandbox. La piste est donc conservée en WAV non compressé, lisible par Chrome; aucun OGG/MP3 n’a été créé. Les instructions de régénération sont dans [`public/audio/README.md`](../public/audio/README.md).

### Intégration

`AudioManager` conserve un seul `AudioContext` et un seul bus musique. Après l’interaction qui déverrouille l’audio, l’élément média local passe par `MediaElementAudioSourceNode → musicGain → master`. La piste boucle nativement; le fondu se fait au gain Web Audio. Elle continue entre menu, garage, circuits, championnat, tutoriel et laboratoires; elle s’atténue au départ en course et reprend au retour/menu podium. Le volume musique, master et mode muet réutilisent les réglages persistés. Pause suspend et reprend le contexte et le média. La destruction déconnecte la source, libère l’élément et arrête les effets.

Autoplay : la lecture n’est demandée qu’après `unlock()` appelé par les interactions du menu/session. Si le navigateur refuse `play()`, le gestionnaire garde les effets disponibles et journalise l’attente d’un geste utilisateur.

Les tests audio utilisent des doubles Web Audio/média; ils valident l’URL, la boucle, les transitions, le fondu avant pause, la reprise, le volume, l’unicité du contexte et le nettoyage. **Ils ne valident ni le mix à l’écoute, ni le rendu des haut-parleurs, ni l’absence subjective de clic à la jonction.**

## B — Steering Lab

- Le mode garde `RaceSession`, `RaceWorld`, les mêmes voitures, circuit, caméra, mini-carte et dynamique arcade.
- Un `RaceLabVisuals` Three.js ajoute des `ArrowHelper` au monde existant : Path Following, Obstacle Avoidance, Separation, Pursuit, résultante, vitesse et direction vers la cible du Path Follower. Les quatre premières flèches de force sont dessinées à partir des contributions pondérées présentes dans `car.debugForces`; Pursuit est absent tant que le contrôleur ne le calcule pas. Aucun vecteur n’est synthétisé pour un pilote humain.
- Une case active/désactive ces flèches et une légende associe les couleurs. Les flèches sont actualisées au pas fixe de simulation, et les diagnostics textuels à environ 10 Hz.
- Le panneau Professeur existant conserve les vrais contrôles d’activation/poids/paramètres et de vitesse max/force max; sa remise à zéro appelle `RaceController.resetConfiguration()`.
- Par défaut, le sélecteur suit un pilote Steering AI. Si le joueur humain est choisi, le message précise qu’aucune force IA n’est produite et propose de revenir à une voiture Steering.
- Le ralenti, pause, caméra et choix de voiture restent ceux de la session F1.

## C — Neural Lab et comparaison

- Le panneau affiche le cerveau actif de la **voiture suivie**, séparément de la liste des modèles chargés et des autres pilotes.
- Le canvas dessine l’architecture historique 7–16–16–2 à partir des poids du réseau chargé; les nœuds utilisent les activations réellement publiées par cette inférence. Les sept observations, deux commandes réelles, vitesse, écart route, progression, collisions et sorties restent lisibles en valeurs numériques.
- Le canvas n’est redessiné qu’à l’actualisation du panneau (environ 10 Hz), et pas si le panneau est réduit. Un pilote Steering ou un contrôleur sans activations réseau affiche une indication d’indisponibilité plutôt qu’une animation inventée.
- Une table présente les voitures de la même `RaceWorld` : provenance du contrôleur, vitesse, progression validée en mètres, tours, collisions/sorties, statut et temps réel d’arrivée lorsqu’existant. Le composant indique explicitement que c’est une comparaison de jeu arcade, pas une mesure historique.
- Les entrées A/B/C restent les artefacts historiques; l’adaptateur vers `GameVehicleDynamics` arcade demeure non équivalent au moteur scientifique. Aucun résultat de ces manches n’est ajouté au championnat.

## D — Démonstration Professeur

Le parcours reste une chronologie de 180 secondes, mais comporte maintenant dix étapes : introduction, Path Following, Obstacle Avoidance, Separation, BehaviorManager et résultante, architecture neuronale, décisions A/B/C, comparaison arcade, généralisation/limites et conclusion.

Les étapes Steering naviguent vers la session F1 Steering Lab; les étapes neuronales vers la session F1 Neural Lab avec A/B/C chargés. Précédent/suivant, pause/reprise et sortie restent disponibles. Il n’y a pas de statistiques préremplies, ni d’entraînement lancé. Les étapes d’introduction/conclusion restent dans le menu et exposent leur notion et les diapositives concernées.

Les références du cours restent des repères de contenu. Les sujets de projet destinés à d’autres promotions ne sont pas présentés comme des obligations Casablanca G1.

## Fichiers ajoutés ou modifiés

- Ajout : `public/audio/neurodrive-redline.wav`, `public/audio/README.md`, `scripts/generate-redline-theme.mjs`, `src/game/RaceLabVisuals.js`, `tests/race-lab-visuals.test.js`, ce rapport.
- Modifiés : `src/game/AudioManager.js`, `src/game/RaceSession.js`, `src/game/race-session.css`, `src/game/ProfessorDemo.js`, `src/ui/IntegratedLabLaunch.js`, `src/main.js`, `tests/phase14-audio-haptics.test.js`, `tests/integrated-ai-labs.test.js`, `tests/ultimate-lot5-1.test.js`.

## Tests, build et protection scientifique

- `npm.cmd test` : **241 tests réussis**, 35 fichiers.
- `npm.cmd run build` : **réussi**. Vite affiche l’avertissement de bundle Three.js de 509 kB (au-dessus de son seuil de 500 kB); ce n’est pas une mesure de FPS.
- Manifeste historique : **175/175 empreintes SHA-256 conformes**, aucun fichier manquant ou modifié.
- Aucun entraînement n’a été exécuté; poids A/B/C, résultats, graines et protocoles historiques non modifiés.
- Le contrôle Chrome n’a pas pu démarrer : le Computer Use helper a retourné `Computer Use native pipe is unavailable: failed to connect native pipe: Le fichier spécifié est introuvable` à deux reprises. Aucun rendu visuel ni écoute audio réelle n’a donc été effectué.

## Vérifications Chrome à réaliser

1. Après un clic utilisateur, vérifier la piste au menu, garage, championnat et laboratoires; modifier volume musique/master, muet, entrer en course, puis revenir au menu.
2. Écouter au casque la piste à plusieurs volumes, vérifier la lisibilité mélodique, la dynamique, les graves, le niveau global et plusieurs passages de boucle. Ce contrôle d’écoute est requis avant d’approuver la qualité artistique.
3. Dans Steering Lab, suivre une IA, activer/désactiver les vecteurs; vérifier les flèches dans le monde 3D et modifier un poids/paramètre dans le panneau Professeur. Choisir ensuite la voiture humaine et vérifier le message d’absence de forces.
4. Dans Neural Lab, suivre successivement une voiture Steering et les voitures A/B/C; vérifier que modèle, observations, activations et commandes correspondent au pilote sélectionné.
5. Contrôler la table de comparaison en course, le ralenti/pause/reprise, caméra et retour au menu; confirmer qu’aucun point de championnat n’est écrit.
6. Lancer le Mode Professeur; vérifier dix étapes, les transitions entre les deux sessions F1, précédent/suivant, pause/reprise et sortie. Vérifier les références de diapositives et la mention de non-comparabilité arcade.

