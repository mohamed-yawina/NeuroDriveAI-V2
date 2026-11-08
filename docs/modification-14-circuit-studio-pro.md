# Modification 14 — Circuit Studio Pro

Validation du 8 novembre 2026.

## Résultat

Le circuit sauvegardé dans Circuit Studio peut maintenant être résolu depuis la bibliothèque locale puis chargé dans Course rapide, Steering Lab ou Neural Lab comme `TrackDefinition`. Le mode « Tester F1 Racing » construit une vraie `RaceSession`/`RaceWorld`, place les six voitures, utilise les contrôleurs et la progression de course existants, et ne sauvegarde pas le résultat dans la carrière. Le retour au Studio restaure la définition en cours.

Le critère géométrique central est vérifié par simulation headless : le circuit utilisateur enregistré reste la piste du `Track` et du `RaceWorld`, les six voitures sont placées sans chevauchement, et les cinq IA terminent trois tours sur le circuit déterministe testé. L’application Chrome et l’aperçu WebGL n’ont pas pu être ouverts dans cet environnement; aucune validation visuelle n’est revendiquée.

## 1. Audit et architecture

Avant cette modification, le Studio éditait des points X/Z avec une spline fermée Catmull–Rom centripète dans son canvas 2D. `CircuitFormat.circuitToTrackDefinition()` passait les seuls points de contrôle à la simulation. La scène `Track` dessinait ensuite une spline lissée à 700 segments, alors que `RaceTiming`, Path Following et les limites de piste projetaient les voitures sur les points bruts. Cela pouvait faire diverger la route jouable de la ligne dessinée, surtout aux virages serrés. Le test Circuit Studio transmettait déjà une définition à `RaceSession`, mais les sélecteurs principaux ne proposaient pas la bibliothèque sauvegardée.

La définition JSON v1 reste la source éditable et persistée. Elle contient `schema`, `version`, identifiant, nom, points X/Z, boucle, largeur, ligne de départ et métadonnées. La conversion runtime ajoute les points de contrôle ordonnés à la ligne de départ et un centre de piste échantillonné. Les valeurs d’altitude, de banking, de barrières personnalisées et d’obstacles ne font pas partie du format fonctionnel : aucun réglage correspondant n’est affiché.

Le centre de piste de course est créé par `sampleClosedTrackPath()` avec une spline Catmull–Rom fermée centripète et 240 échantillons à espacement d’arc. Ces waypoints alimentent le `Track`, le `RaceWorld`, la projection de `RaceTiming`, la trajectoire des contrôleurs, la minimap et le calcul de limites. Les bordures runtime sont générées depuis ces mêmes waypoints et la largeur du circuit. La scène utilise toujours la classe `Track` principale; le Studio ne possède pas de moteur physique ou de générateur de piste parallèle.

## 2. Fidélité géométrique

Le Studio conserve son édition 2D des points et possède maintenant un aperçu 3D facultatif, créé à la demande avec `SceneManager` et la même classe `Track` que la course. La vue prend en charge l’orbite à la souris, le zoom à la molette, le panoramique avec Maj+glisser ou bouton droit, la vue aérienne et le recentrage. Les changements valides reconstruisent le `Track`; un changement invalide ne remplace pas le dernier aperçu valide. Le cycle d’animation et les ressources de scène sont arrêtés/libérés à la fermeture.

Le test géométrique compare la spline d’édition, la polyligne runtime de 240 points et la spline reconstruite par le rendu `Track` sur un circuit déterministe. L’écart maximal mesuré dans le test est inférieur à **0,08 m**. C’est la tolérance de fidélité de l’approximation, pas une affirmation que les sommets du mesh sont identiques à ceux du canvas. Les points de contrôle d’origine sont aussi préservés sur la définition runtime pour les marqueurs de scène.

## 3. Validation des circuits

`CircuitValidator` conserve les règles bloquantes existantes : nombre de points, coordonnées finies et bornées, segments dégénérés ou trop longs, largeur 12–26 m, fermeture, rayon de courbure, virages brusques, auto-intersections, chevauchement de portions et sécurité de la grille de six voitures. Les messages indiquent maintenant les numéros de segments, points ou échantillons lorsqu’ils sont connus. Les rapports exposent `issues` avec sévérités `error` et `warning`; la vue du Studio affiche les erreurs bloquantes et avertissements. Le résumé indique longueur, virages estimés, rayon minimum et grille.

Les obstacles/blocages personnalisés ne peuvent pas être spécifiés dans le schéma v1 et ne sont donc pas simulés ni déclarés validés. Les éléments de décor et barrières restent ceux générés par `Track` autour du tracé, sans collisions supplémentaires.

## 4. Bibliothèque et persistance

La clé de stockage dédiée `neurodriveai.user-circuits.v1` est préservée. Les anciennes entrées v1 sans date restent lisibles; les nouvelles sauvegardes portent un `modifiedAt`. Le sélecteur de bibliothèque affiche nom, longueur calculée et date disponible. Les fonctions existantes de sauvegarde, chargement, import JSON et export JSON restent en place. L’édition du nom suivie de Sauvegarder permet le renommage. Des actions Dupliquer et Supprimer avec confirmation ont été ajoutées. La suppression du fichier stocké ne détruit pas le tracé encore ouvert dans l’éditeur.

Les circuits personnalisés valides apparaissent dans les sélecteurs Course rapide et des deux laboratoires IA, y compris après une sauvegarde dans Circuit Studio et après rechargement de l’application. Aucun circuit non sélectionné n’est choisi silencieusement : un identifiant absent produit une erreur explicite. Le championnat n’a pas été modifié; son calendrier sauvegardé reste limité à ses circuits programmés.

## 5. Test du circuit et intégration

« Tester F1 Racing » ferme proprement l’éditeur, puis construit une `RaceSession` avec le snapshot validé et sa définition runtime. Il utilise les six voitures, les contrôleurs arcade, les limites, le chronométrage, les tours et le HUD existants. Le test désactive explicitement la persistance de carrière/championnat. Au retour, l’éditeur est recréé avec le snapshot testé.

Le bouton « Tester Steering » ouvre le Steering Lab intégré au jeu avec cette même définition. Le test Neural transmet aussi cette définition au Neural Lab. Course rapide et les laboratoires résolvent les identifiants `user:<id>` depuis la bibliothèque. Un circuit supprimé ou un identifiant invalide ne peut pas retomber sur `original` ou un autre circuit.

La simulation headless de fidélité utilise `generateCircuit(610, 'easy')`, sauvegarde la définition en mémoire, la charge par le sélecteur `user:<id>`, construit le `Track` et le `RaceWorld`, vérifie les six positions de grille et lance trois tours. Les cinq adversaires terminent avec des temps d’arrivée finis. La même définition runtime alimente le rendu Track, la course et ses calculs de progression. Ce test ne constitue pas un essai visuel Chrome.

## 6. Tests ajoutés ou renforcés

- Tolérance spline éditeur ↔ polyligne runtime ↔ spline Track (< 0,08 m).
- Identité, largeur, points de contrôle et ligne de départ de la définition versionnée.
- Résolution bibliothèque utilisateur sans remplacement de circuit.
- Session de course sur circuit sauvegardé, grille de six voitures, non-superposition et trois tours IA.
- Sélection d’un circuit utilisateur par les fonctions de lancement Steering et Neural.
- Refus d’un identifiant inconnu par `RaceSession` avant toute modification du DOM.
- Persistance carrière désactivée pour les tests Circuit Studio.
- Duplication, suppression et compatibilité avec une entrée v1 sans `modifiedAt`.
- Snapshot exact transmis par le bouton de test.
- Nettoyage/navigation Circuit Studio existants.

## 7. Fichiers modifiés

- `src/circuits/CircuitFormat.js` — définition runtime versionnée et échantillonnage de route.
- `src/circuits/CircuitLibrary.js` — date de modification et duplication.
- `src/circuits/CircuitStudio.js` — aperçu 3D orbitable, recentrage, messages de validation, stats et actions de bibliothèque; reprise du circuit initial.
- `src/circuits/CircuitValidator.js` — détails de localisation, sévérités et estimation de virages.
- `src/circuits/TrackSelection.js` — résolution stricte des circuits intégrés et utilisateurs.
- `src/scene/trackGeometry.js` — échantillonnage fermé canonique.
- `src/scene/Track.js` — conservation des points de contrôle et marqueurs aux points originaux.
- `src/game/RaceSession.js` — rejet des circuits inconnus et option de non-persistance.
- `src/ai/PathFollowing.js` — projection segmentaire sans allocations vectorielles par segment, formule conservée.
- `src/ui/IntegratedLabLaunch.js` — résolution d’un circuit utilisateur dans les deux laboratoires.
- `src/main.js` — bibliothèque dans les sélecteurs, lancement custom strict, test/retour éditeur.
- `src/style.css` — présentation du viewport 3D et des messages de validation.
- `tests/circuit-studio.test.js`, `tests/integrated-ai-labs.test.js` — couverture décrite ci-dessus.
- `docs/modification-14-circuit-studio-pro.md` — ce rapport.

## 8. Validation finale

- `npm.cmd test` : **35 fichiers, 256 tests réussis**.
- `npm.cmd run build` : réussi. Vite signale toujours le chunk Three.js minifié de 509 kB au-dessus du seuil de 500 kB.
- Manifeste scientifique : **175 fichiers vérifiés, 175 empreintes SHA-256 concordantes**.
- Aucun modèle, résultat, protocole ou manifeste scientifique n’a été modifié.
- Aucun entraînement n’a été lancé.
- Le test navigateur a échoué à s’initialiser : le navigateur et le canal natif Computer Use étaient indisponibles dans l’environnement. L’aperçu WebGL n’est donc pas déclaré visuellement validé.

## 9. Checklist Chrome manuelle

1. Ouvrir Circuit Studio, créer ou déplacer des points, ajuster la largeur, puis vérifier la validation et le résumé.
2. Basculer entre l’édition 2D et l’aperçu 3D; tester orbite, zoom, panoramique, vue aérienne et recentrage.
3. Sauvegarder, recharger la page, sélectionner le circuit dans Course rapide et confirmer son nom et sa minimap.
4. Lancer « Tester F1 Racing »; vérifier six voitures sur la piste créée, le départ, les tours, le classement et le retour au même circuit dans l’éditeur.
5. Vérifier que le test ne crée pas de résultat carrière/championnat.
6. Lancer le circuit sauvegardé dans Steering Lab puis Neural Lab; confirmer la même piste, sa largeur, sa ligne de départ et sa minimap.
7. Tester import, export, renommage, duplication, suppression confirmée et conservation du circuit ouvert après suppression.
8. Tester une piste invalide (segment dégénéré, croisement, largeur/grille impossible); confirmer un message situé et l’impossibilité de la lancer.
9. Répéter édition → test → éditeur plusieurs fois et vérifier l’absence de canvas ou de session en double.

## Limites restantes

- Le format v1 est planaire X/Z : altitude, banking et sens inverse ne sont pas éditables.
- Les barrières et décorations personnalisées ne sont pas persistées; le moteur les génère autour du tracé. Elles ne changent pas la physique ni les collisions.
- La vue 3D est une prévisualisation orbitale de la piste réelle; les points restent édités dans le canvas 2D.
- La validation IA est headless et déterministe pour le circuit de test spécifié; elle ne prouve pas que toute géométrie valide sera facile à conduire.
- Le parcours visuel complet dans Chrome reste à faire manuellement; aucune mesure FPS ni inspection mémoire n’a été obtenue.
