# Modification 26.7 — F1 Hyper Realism, Driver Creator & Turbo

## Périmètre et état Git

Travail effectué sur `feature/f1-ultimate-realism`, à partir du snapshot `806c437e19fb387500a17e5bb2a385d8f9305164`. Aucun commit ni push n'a été créé.

Les changements non commités et fichiers ajoutés des Modifications 26.5 et 26.6 étaient déjà présents au début de cette tâche (`FormulaCar`, `RaceSession`, `AudioManager`, `main`, showroom, scène, piste et `SceneryPlacement`, entre autres). Ils ont été conservés. La présente modification les étend sans rétablir ni remplacer ces travaux.

## Voitures et pilote

Les quatre silhouettes `APEX`, `VELOCITY`, `TITAN` et `PHANTOM` existaient déjà comme variantes esthétiques dans le travail 26.5. Cette modification les conserve et enrichit la construction procédurale du pilote : cou, bras, gants, jambes et bottes s'ajoutent au torse et au casque. Le sélecteur du Garage inclut une palette inclusive de cinq teintes de peau, sauvegardée dans les préférences locales et transmise à la voiture humaine en course. Les formes de collision et la physique des variantes n'ont pas changé.

Les roues avant prennent maintenant l'angle de braquage réellement reçu par le pas de physique du joueur ; les quatre roues continuent de tourner selon la vitesse. Il s'agit d'une animation visuelle qui ne modifie pas la direction simulée.

## Vitesse et Turbo arcade

`ArcadeTurbo` est un petit état de gameplay branché sur l'entrée humaine de `RaceSession` et sur `GameVehicleDynamics.stepPlayer` :

- `Shift` maintenu demande le turbo. Il ne s'active qu'en course, avec accélérateur, au-dessus de 4 m/s et avec de l'énergie disponible.
- Réservoir de 100 unités ; consommation de 24 unités/s ; recharge de 9 unités/s lorsque le système est autorisé et hors boost.
- Le plafond de vitesse du joueur en course arcade est majoré de 10 %. Le turbo ajoute temporairement 6 % à ce plafond et 22 % à l'accélération commandée. La limite évolue à 8 m/s², ce qui évite une coupure brutale au relâchement.
- Pas d'énergie négative ; pause, formation, arrêt, stands, fin de session, perte de focus, laboratoires et courses roster bloquent le boost. Le redémarrage réinitialise la jauge.
- La jauge Racing Red affiche `READY`, `ACTIVE` ou `RECHARGE` et rappelle `SHIFT`.

La modification est arcade et rend le joueur plus rapide que la référence IA : c'est un avantage de gameplay annoncé dans la fiche du Garage, pas un équilibrage compétitif symétrique. Les contrôleurs IA gardent leur limite habituelle. Les expériences Steering/Neural et les sessions avec affectations de pilotes sont explicitement exclues.

## Audio

L'`AudioManager` central existant est réutilisé, sans créer de nouvel `AudioContext`. La fréquence du moteur dépend toujours de la vitesse et du RPM déjà simulé ; les sons de freinage et de glissement préexistants restent pilotés par les entrées et le glissement. Cette modification ajoute une couche de souffle à haute vitesse depuis la source de bruit déjà partagée, ainsi qu'une tonalité filtrée à faible niveau et un événement au déclenchement du turbo.

Pause, arrêt de session, désactivation audio et fin du boost coupent la couche turbo. REDLINE conserve son garde-fou d'état menu et ne joue pas en course ni dans les laboratoires. Aucun son sous licence commerciale n'a été ajouté. Aucun capteur de contact vibreur fiable n'est exposé ici : aucun son de vibreur n'est donc simulé.

## Fichiers de cette modification

- `src/game/ArcadeTurbo.js` — état borné du turbo et porte d'accès aux sessions arcade.
- `src/game/GameVehicleDynamics.js` — multiplicateurs optionnels d'entrée humaine et évolution douce du plafond de vitesse.
- `src/game/RaceControls.js` — lecture de Shift uniquement lorsque le mode autorise le turbo.
- `src/game/RaceSession.js` — cycle de vie, HUD, audio, pause, reset et désactivation des laboratoires.
- `src/game/AudioManager.js` — couches turbo et vent à grande vitesse dans le graphe audio existant.
- `src/scene/FormulaCar.js` — pilote procédural détaillé et braquage visuel des roues avant.
- `src/main.js` — choix/persistance de la teinte de peau et indication de vitesse arcade.
- `src/style.css` — jauge compacte responsive.
- `tests/modification-26-7-turbo-driver.test.js` — tests dédiés du modèle, du pilote, des contrôles, du turbo, de la vitesse et de l'audio.

Les modifications 26.5/26.6 préexistantes ne sont pas listées comme nouvellement réalisées ici.

## Validation

Les tests ciblés ont validé les variantes esthétiques, les pièces du pilote, l'animation de braquage, les portes Shift/course/laboratoire, la consommation/recharge, les plafonds de vitesse et les couches audio procédurales : **30 tests sur 5 fichiers réussis**. La suite complète `npm.cmd test` réussit : **321 tests sur 41 fichiers**. `npm.cmd run build` réussit ; Vite conserve son avertissement connu pour le chunk Three.js (**510,34 kB**). Le manifeste SHA-256 compte **175 entrées, 0 fichier manquant et 0 divergence**. `git diff --check` ne signale pas d'erreur de patch.

Aucun entraînement n'a été lancé. La suite inclut des tests unitaires déterministes du trainer existant, mais pas de campagne de production.

Aucun navigateur Chrome ou outil de contrôle WebGL n'était disponible dans cette session : l'apparence du nouveau pilote, la sensation sonore à l'écoute, le comportement manuel du Turbo et les FPS restent à vérifier dans le navigateur. Les tests audio sont simulés ; ils vérifient les nœuds et leur cycle de vie, pas la qualité acoustique subjective.

Le rendu reste procédural et stylisé, plutôt qu'un modèle photoréaliste haute résolution. Les quatre silhouettes préexistantes ont été conservées, et non recréées. Le son moteur est synthétisé par Web Audio ; qualité/équilibre sonore réels restent à écouter. Le Turbo et le bonus de vitesse sont des mécaniques arcade qui avantagent le joueur par rapport aux IA ; ils ne s'appliquent pas aux laboratoires IA.

## Checklist Chrome

1. Ouvrir Garage, parcourir les quatre voitures et les vues caméra ; changer avatar, teinte de peau, casque et combinaison, puis recharger la page.
2. Lancer Course rapide : vérifier que le joueur et son apparence concordent avec le Garage, puis accélérer et maintenir Shift au-dessus de 14 km/h.
3. Confirmer la consommation, les états `ACTIVE`/`RECHARGE`, l'arrêt au relâchement, puis la recharge. Tester à l'arrêt, en formation, en pause, aux stands, après perte de focus et après redémarrage.
4. Comparer le plafond de vitesse de base et boosté sans inférer de FPS depuis le HUD.
5. Vérifier que Steering Lab, Neural Lab et les sessions roster n'affichent ni n'activent le Turbo.
6. Vérifier le son moteur, le souffle rapide et le Turbo avec audio activé/désactivé ; confirmer que REDLINE ne joue qu'au menu.
7. Tester la lisibilité du HUD en `1366×768` et `1920×1080`, notamment sur écran étroit.
