# Phase 11 — Formula 1 Racing Engine

## Architecture et séparation

Le moteur jouable est dans `src/game/` :

- `RaceWorld` construit la grille, pilote l'étape fixe, applique les collisions de jeu et met à jour les tours.
- `GameCar` contient l'état d'une voiture de course sans réseau entraîné.
- `GameVehicleDynamics` gère l'accélération, le freinage, la traînée, la vitesse maximale et le braquage du joueur.
- `RaceController` combine les comportements existants à l'aide de `BehaviorManager`.
- `OvertakingPlanner` détecte un adversaire devant, évalue les voies latérales, évite une voie occupée et fait revenir progressivement la voiture vers le centre.
- `RaceDirector`, `RaceTiming` et `RaceLeaderboard` gèrent départ, feux, temps, franchissement de ligne et classement.
- `RaceSession` connecte le menu, les vues Three.js, les contrôles, le HUD, les caméras et le nettoyage.

`src/physics/VehicleDynamics.js`, les réseaux A/B/C, les artefacts des phases 4 à 8 et leur protocole d'évaluation restent séparés. Les matériaux du modèle F1 acceptent un paramètre de couleur pour distinguer les voitures; le maillage et le moteur scientifique ne changent pas.

## Règles de pilotage

Les comportements partagés sont importés de `src/ai/behaviors/SteeringBehaviors.js` et réutilisent `BehaviorManager` et `PathFollowing` :

- Path Following projette la voiture sur les waypoints et calcule un point cible anticipé. Le contrôleur de course applique le décalage de voie à ce point, puis réutilise `seek` pour produire la force.
- Obstacle Avoidance reçoit les adversaires comme obstacles circulaires. Separation ajoute une force de répulsion de voisinage.
- Pursuit n'est activé que lorsqu'une voie de dépassement est jugée libre; sa cible virtuelle est placée devant l'adversaire et dans la voie choisie.
- `BehaviorManager` additionne les forces pondérées puis plafonne la résultante à `GameCar.maxForce`.

Les voitures sont des cercles en collision horizontale. Si deux rayons se chevauchent, `RaceWorld` répartit la correction entre elles et applique une impulsion avec restitution de 0,16 quand elles se rapprochent. Au bord, la voiture est replacée dans la largeur praticable et sa vitesse sortante est retirée. Cette réponse arcade sert au jeu; elle ne remplace pas les équations de la simulation scientifique.

Le dépassement s'active lorsqu'un concurrent est à moins de 26 m de progression devant, dans la même voie. Les deux décalages latéraux sont évalués; une voie avec un véhicule trop proche est refusée. Le déplacement latéral est limité à 4,2 m/s. Après avoir dépassé l'adversaire de 9 m, la cible s'efface et le décalage revient à zéro au même rythme.

## Départ et chronométrage

La grille utilise six voitures par défaut, espacées sur trois rangées et deux colonnes. Après lancement de la session, cinq feux rouges et un compte à rebours de trois secondes s'écoulent. La même transition `countdown → racing` libère toutes les voitures. Le premier franchissement avant de la ligne arme le chronomètre de tour; les passages suivants incrémentent les tours. Un passage hors de la largeur du circuit ne compte pas. Chaque voiture garde son meilleur tour. La course se termine lorsque toutes les voitures ont fini ou 90 secondes après l'arrivée du premier pilote.

Le classement compare d'abord les voitures à l'arrivée et leur temps d'arrivée, puis les tours complétés, la progression le long du circuit et le meilleur tour.

## Commandes et affichage

- Flèches ou WASD : accélération, freinage, braquage.
- Espace : pause / reprise.
- R : recommencer depuis la grille.
- C : alterner poursuite, bord de piste, cockpit et vue aérienne.
- 1–6 ou le menu déroulant : sélectionner la voiture suivie.
- Bouton **Retour au menu** : annuler la boucle d'animation, retirer les écouteurs, disposer le renderer Three.js et retirer l'interface de course.

Le HUD montre la vitesse, le tour, le meilleur temps, l'état du départ, le classement live et une mini-carte redessinée dix fois par seconde. La course charge six modèles `FormulaCar` avec des livrées distinctes.

## Critères vérifiés

Les tests `tests/phase11-race-engine.test.js` et `tests/phase11-race-navigation.test.js` vérifient : grille sans chevauchement, compte à rebours, collision voiture/voiture, limite de piste, classement, vitesse bornée, stabilité sur pas fixe, génération d'un dépassement sûr, refus si les deux voies sont occupées, retour progressif, force de BehaviorManager, ligne d'arrivée, fin de course, commandes physiques, caméras, redémarrage et nettoyage/navigation répétés.

Validation complète : `npm.cmd test`, puis `npm.cmd run build`. La vérification par navigateur reste nécessaire pour confirmer le rendu WebGL et la disposition du HUD sur l'appareil de démonstration.

## Limites connues

- La physique de collision est arcade et utilise des cercles; il n'y a ni modèle de pneumatiques, ni dégâts, ni stratégie de course avancée.
- Les cinq adversaires de la course sont des pilotes Steering Behaviors. Les réseaux historiques A/B/C restent accessibles dans Neural AI Lab et ne sont pas réentraînés ni convertis en paramètres de course.
- Les contrôles et vues sont implémentés, mais aucune validation visuelle par navigateur n'est déclarée dans ce livrable.
