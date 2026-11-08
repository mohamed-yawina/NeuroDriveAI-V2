# Modification 20 — Race Experience Pro

## Audit de l’existant

Le mode course possédait déjà une caméra `chase`, `cockpit`, `trackside` et `overview`, une caméra TV à plans fixes, une touche `C`, une sélection du pilote suivi avec les touches `1–6`, ainsi qu’un HUD fournissant vitesse, classement, tours, chrono, meilleur tour, mini-carte et état de course. Le FOV et le recul de poursuite variaient déjà avec la vitesse. Les contrôles clavier sont isolés dans `RaceSession`, sont neutralisés pendant la pause et leurs touches sont effacées à la perte de focus. `AudioManager` suit la voiture sélectionnée et sonde la vitesse/commandes de la simulation. REDLINE est déjà filtrée par l’état applicatif et n’est autorisée que dans les menus.

L’audit a identifié deux lacunes concrètes : aucune caméra capot ni regard arrière temporaire, et une petite zone morte dans l’interpolation du FOV, qui laissait parfois la caméra à plus de 0,4° de sa cible. Le HUD affichait également le chrono général et le meilleur tour mais pas le temps du tour courant.

## Changements réalisés

### Caméras

- Le cycle `C` est maintenant : poursuite → capot → cockpit → arrière → bord de piste → aérienne → poursuite.
- Le bouton `TV` reste indépendant. En quittant TV, il restaure la vue utilisée avant le plan TV.
- `B` active le regard arrière tant que la touche reste maintenue; son relâchement restaure la vue précédente. La pause et la perte de focus libèrent aussi ce regard.
- La vue capot place la caméra au-dessus du nez et vise loin devant. La vue arrière utilise la même caméra de jeu, sans rendu WebGL supplémentaire.
- Toutes les vues suivent la voiture choisie et interpolent la position. Le pas temporel d’interpolation est borné pour éviter un saut après une longue frame.
- Le FOV dynamique est progressif en poursuite et au capot. Le réglage existant « Effets visuels de vitesse et collision » désactive cet effet de FOV ainsi que les autres effets visuels déjà liés à ce réglage.
- La petite zone morte FOV est réduite afin que la caméra atteigne effectivement sa cible.
- Le sélecteur de caméra par défaut dans Réglages accepte maintenant « Capot »; les préférences antérieures restent valides.

La caméra utilise le plan de clipping existant de `SceneManager` (0,1 à 600 unités). Les vues de course restent au-dessus de la surface; elles n’effectuent pas de test de collision contre chaque élément décoratif. Une caméra intégralement libre avec évitement de décor n’a pas été ajoutée.

### HUD

- La position du joueur et le tour actuel sont regroupés dans la barre d’état supérieure, avec le drapeau, l’état de course et le chrono général.
- Le panneau latéral conserve la vitesse, le meilleur tour et les métriques déjà présentes.
- Le temps du tour courant est affiché depuis `GameCar.currentLapTime`, mis à jour par `RaceTiming`; aucun temps synthétique n’est utilisé.
- La mini-carte et le classement conservent leurs données de session. Des règles CSS améliorent la taille des libellés et l’espacement sur desktop, écrans bas et formats compacts.
- Les modes HUD complet, minimal et masqué restent disponibles.

### Commandes et audio

- `C` change la caméra; il n’était pas attribué à une commande de conduite.
- `B` est ajouté comme regard arrière temporaire. Les commandes existantes d’accélération, freinage, direction, pause, redémarrage, rapports, DRS, ERS et sélection du pilote restent inchangées.
- Les garde-fous de pause et de perte de focus ont été conservés et couvrent le relâchement de la vue arrière.
- L’AudioManager partagé reste l’unique système audio. Le moteur suit la voiture observée et ses valeurs de vitesse/commandes réelles.
- Aucun changement à REDLINE : les tests existants continuent de vérifier qu’elle ne joue pas en session, en pause ou dans les laboratoires.

## Fichiers modifiés

- `src/game/RaceCameras.js` — vue capot/arrière, suivi interpolé, FOV et allocation de vecteurs réutilisables par frame.
- `src/game/RaceSession.js` — libellés/init caméra, position et tour dans la barre supérieure, temps de tour courant, regard arrière B.
- `src/game/race-session.css` — hiérarchie et tailles responsive du HUD de course.
- `src/settings/GameSettings.js` — validation du choix de caméra capot.
- `src/main.js` — choix « Capot » dans les réglages existants.
- `tests/phase11-race-engine.test.js`, `tests/phase11-race-navigation.test.js`, `tests/race-session-dom-contract.test.js`, `tests/phase14-3-menu-settings.test.js` — couvertures caméra, regard arrière, paramètres et HUD.
- `docs/modification-20-race-experience-pro.md` — ce rapport.

## Validation

- Tests ciblés : **61 réussis** dans 5 fichiers.
- Suite complète `npm.cmd test` : **288 réussis dans 37 fichiers**.
- `npm.cmd run build` : **réussi**; Vite conserve son avertissement de chunk Three.js (~509 kB).
- Le test de caméra couvre la direction et le cadrage des vues, le FOV à basse/haute vitesse, la désactivation des effets, la vue TV, les circuits prédéfinis et un circuit généré valide.
- Les tests audio existants couvrent le cycle REDLINE menu/session/pause et ses transitions.
- Les tests de parcours contrôleur/focus/pause existants sont conservés.
- Les performances en FPS n’ont pas été mesurées dans un navigateur; aucune mesure de FPS n’est revendiquée.
- Manifeste d’intégrité SHA-256 : **175 entrées, 0 divergence**.
- Aucun entraînement, modèle ou résultat scientifique n’a été modifié intentionnellement.

## Checklist Chrome

Le rendu WebGL n’a pas été testé visuellement pendant cette tâche. Vérifier manuellement :

1. Lancer Course rapide sur un circuit prédéfini, puis sur un circuit personnalisé valide.
2. Presser `C` pour parcourir les vues; vérifier que chaque vue garde la voiture et la piste cadrées.
3. Maintenir `B`, vérifier la visibilité de la piste et des voitures derrière, puis relâcher `B` et confirmer le retour à la vue précédente.
4. Essayer le regard arrière en pause et après un changement de focus; vérifier qu’il ne reste pas bloqué.
5. Tester la caméra TV depuis poursuite et cockpit, puis vérifier le retour au mode précédent.
6. Vérifier que position et tour sont en haut, que vitesse/temps du tour/classement sont cohérents, et que la mini-carte ne recouvre pas les commandes.
7. Répéter aux résolutions 1920×1080, 1848×768, 1366×768 et 1280×720.
8. Désactiver les effets visuels et vérifier la disparition du changement de FOV et des secousses tout en conservant la conduite.
9. Vérifier l’audio moteur, puis confirmer que REDLINE reste muette pendant course, pause et sessions Steering/Neural.

## Limites

Le positionnement caméra est testé mathématiquement sur les circuits disponibles, mais l’absence de traversée de décor ne peut pas être garantie pour chaque caméra TV sans validation visuelle. Aucun rétroviseur à texture/caméra secondaire ni effet de motion blur n’a été ajouté. Les interactions réelles dans Chrome, l’écoute audio et les FPS restent à contrôler manuellement.
