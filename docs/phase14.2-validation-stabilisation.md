# Phase 14.2 — Validation et stabilisation

## Bilan d’audit

Les transitions de session utilisent `SessionNavigation`: lancement protégé contre les doublons, remise au menu même en cas d’échec et attente du nettoyage avant réactivation. `RaceSession.dispose()` annule l’animation, retire les écouteurs, arrête l’haptique, coupe/suspend l’audio et libère la scène Three.js. Steering Academy et Neural Racing Lab possèdent également un nettoyage de session; Circuit Studio réutilise la navigation dédiée. Les tests de navigation et de destruction déjà présents couvrent les cycles répétés et le Worker du laboratoire.

Le moteur vérifie feux/départ, contrôles joueur, collisions, tours, classement et fin de course dans `phase11-race-engine.test.js`; les tests des étapes précédentes couvrent la navigation des labs, Circuit Studio et les interfaces des modèles expérimentaux/historiques. Ces validations sont automatisées/headless, pas une observation navigateur.

## Défauts observés et corrigés

1. `MenuShowroom.setColor()` supprimait les matériaux de l’ancienne monoplace, mais laissait ses géométries Three.js allouées. Il utilise maintenant `releaseSceneResources()`, qui déduplique et libère géométries, matériaux et textures. Un test espion valide le nettoyage de chaque ressource unique.
2. Les effets audio ponctuels pouvaient rester suspendus lors du retour au menu et reprendre au prochain déverrouillage du contexte. `AudioManager.stopSession()` arrête et déconnecte maintenant les oscillateurs d’événement en attente avant de suspendre le contexte réutilisable. Un test vérifie l’arrêt des effets et la remise à zéro de leur registre.

Aucun autre défaut démontré n’a nécessité une modification.

## Résultats des validations

- `npm.cmd test` : **120 tests passés**, 19 fichiers.
- `npm.cmd run build` : réussi, 57 modules transformés, aucun avertissement Vite. Bundle d’entrée : 14,39 kB; chunk Three.js : 499,99 kB (125,44 kB gzip).
- Les 172 fichiers JSON/CSV de `results/` ont été hachés avant les validations finales et revérifiés après : empreinte agrégée SHA-256 identique (`1D857FC6DB69E981BC03D0D2D82051E4076544C12C15F400999A81F7CA6B8BA0`).
- Les trois modèles servis exposent les configurations A/B/C, graines 2026/2027/2028 et architecture 7-16-16-2. Empreintes SHA-256 constatées : A `61E92247781B62E898284F6389C7E0F4127498B0BEC014B2DDAFBC80533ED9ED`; B `B56B6A505473C9488C338328C572E1202E3177141E0E8D18F5ECA06FD115918C`; C `B640686C1897D2EB9983D562458FE06F301ACA3F51D820FC4DCABD078DCF5C88`. Le dépôt ne contient pas d’historique Git commité permettant de comparer à une empreinte antérieure. Les sources modifiées ne touchent ni `VehicleDynamics`, ni `RewardCalculator`, ni les données sous `results/`.
- Aucun entraînement n’a été lancé. Les tests de généralisation vérifient également que les poids restent inchangés pendant leur évaluation.
- Le contrôle navigateur n’a pas pu être exécuté : l’inventaire Chrome n’est pas exposé par l’environnement (`browser access host is unavailable`). Aucun FPS n’a donc été mesuré. Le nombre réduit d’objets d’environnement et la libération des ressources sont vérifiés par code/tests, mais ne constituent pas un benchmark mémoire GPU ou FPS.
- Audio : comportement logique testé par mocks Web Audio. Haptique : compatibilité, désactivation et cadence testées avec APIs simulées. Aucun essai sur haut-parleurs, manette ou téléphone n’a été effectué.

## Checklist de test manuel Chrome et matériel

1. Menu → showroom : faire tourner/zoomer la voiture, choisir chacune des livrées, passer dans Garage puis Circuits; vérifier l’absence de canvas empilés après plusieurs allers-retours.
2. Lancer un tour de 3 tours avec le clavier : vérifier les cinq feux du HUD et du portique, accélération/freinage/direction, affichage du classement et de la mini-carte.
3. Provoquer une collision et une sortie de piste; contrôler compteur, retour caméra, son, haptique et limitation des impulsions. Vérifier pause/reprise et redémarrage.
4. Laisser finir la course : contrôler tours, vainqueur, classement, podium, son de fin, puis retour au menu; répéter deux cycles et surveiller les canvas et l’audio résiduels.
5. Ouvrir Steering Academy, Circuit Studio et Neural Racing Lab; essayer leurs parcours prévus et revenir au menu. N’actionner aucune commande d’entraînement.
6. Sur le matériel cible, écouter les volumes séparés et tester l’audio activé/désactivé; tester la manette ou la vibration mobile si disponible.
7. Mesurer les FPS au même poste et à la même résolution, après échauffement, dans showroom, circuit/course avec six voitures, vue aérienne et podium; noter moyenne et minima sur au moins 60 secondes par scène.

Cette checklist est à exécuter avant la soutenance; elle n’est pas présentée comme déjà validée.
