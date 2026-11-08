# Modification 18 — Garage & Circuit Experience Pro

## Audit initial

- Le Garage utilisait déjà `MenuShowroom`, une scène Three.js dédiée aux menus, le modèle `FormulaCar`, les préréglages de caméra et le réglage de livrée principale.
- La couleur principale était transmise aux sessions de course; le profil local fournissait le nom du joueur. Le modèle n'expose qu'une voiture et toutes les voitures de course partagent la même dynamique arcade.
- La page Circuits avait trois cartes statiques. Les circuits utilisateurs valides étaient disponibles via la bibliothèque et les sélecteurs de course/laboratoires, mais pas dans ces cartes. L'aperçu passait déjà par `MenuShowroom.setCircuit()` et `Track`.
- `RaceSession` accepte une définition de circuit explicite; `TrackSelection.resolveTrackSelection()` résout les circuits utilisateur sans remplacement silencieux. `CareerStore` ne prend en charge que les trois circuits prédéfinis dans le calendrier de championnat, ce format reste donc inchangé.

## Garage

Le showroom partagé et ses contrôles de caméra existants ont été conservés. La voiture accepte maintenant une couleur secondaire et un numéro visuel en segments 3D. Les champs Garage permettent de changer la couleur principale, la couleur secondaire, le nom et le numéro (0–99), puis de réinitialiser ces valeurs.

La configuration est conservée dans le profil local CareerStore et les préférences existantes. `RaceSession` applique couleur, nom, accent et numéro au véhicule humain. Les autres voitures gardent leur livrée et ne reçoivent pas le numéro du joueur. La dynamique n'est pas modifiée.

La fiche affiche les valeurs par défaut réellement déclarées par `GameVehicleDynamics` : vitesse maximale 58 m/s (209 km/h), accélération 24 m/s², freinage 36 m/s² et taux de braquage 1,8 rad/s. Elle précise que ces paramètres sont partagés par les six voitures et que les mécaniques arcade peuvent les moduler.

## Galerie des circuits et préparation de course

Les cartes sont maintenant générées à partir des définitions runtime : aperçu SVG depuis les waypoints réellement chargés, longueur mesurée sur la boucle et estimation des virages depuis les points de contrôle disponibles. Les trois circuits prédéfinis et tous les circuits personnalisés valides de la bibliothèque apparaissent. Les brouillons Circuit Studio restent exclus.

La sélection d'une carte met à jour les sélecteurs Course rapide et Laboratoires IA, puis envoie la même définition à l'aperçu 3D. Une piste personnalisée passe par `resolveTrackSelection()`; un identifiant absent produit une erreur au lieu de charger un circuit de secours. La page affiche voiture/pilote, circuit, tours et six concurrents avant « Lancer la course ». Le choix du nombre de tours est synchronisé avec le réglage déjà consommé par Course rapide.

L'aperçu utilise `MenuShowroom.setCircuit()` et `Track`, pas une `RaceSession` supplémentaire. Les personnalisations ne changent ni waypoints, ni frontières de piste, ni physique. Le championnat conserve son calendrier et son schéma de sauvegarde existants; les circuits utilisateurs ne lui sont pas ajoutés.

## Fichiers principaux

- `src/main.js` — contrôles Garage, persistance du profil, galerie dynamique et préparation de course.
- `src/scene/MenuShowroom.js` et `src/scene/FormulaCar.js` — livrées, accents et numéro sur la voiture visuelle.
- `src/game/RaceSession.js` — transfert de personnalisation au véhicule joueur.
- `src/ui/TrackGallery.js` — mesures et aperçu tracé à partir des waypoints runtime.
- `src/style.css` — styles Garage et galerie.
- `tests/garage-circuit-experience.test.js` — tests ciblés.

## Validation

- `npm.cmd test` : **272 tests réussis**, 36 fichiers.
- `npm.cmd run build` : réussi. L'avertissement Vite existant concernant `three.module` (509 kB) demeure.
- Manifeste `docs/ultimate-edition-lot5-1-integrity.csv` : **175/175 empreintes SHA-256 vérifiées**, aucune différence.
- Aucun entraînement n'a été lancé; aucun modèle, poids, protocole ou résultat historique n'a été modifié intentionnellement.
- Tests Chrome/Edge non exécutés : aucun exécutable navigateur n'est disponible dans l'environnement courant. Le rendu visuel réel reste donc à contrôler.

## Checklist manuelle Chrome

1. Ouvrir Garage; essayer les quatre vues, zoom/orbite, couleurs, nom et numéros 0, 7 et 42; actualiser puis vérifier leur persistance et le bouton de réinitialisation.
2. Aller à Circuits; comparer chaque aperçu à la piste 3D, à la ligne de départ et au sens de circulation.
3. Sauvegarder un circuit valide dans Circuit Studio puis revenir : vérifier son apparition dans la galerie et l'absence des brouillons.
4. Sélectionner ce circuit, choisir 3/5/8 tours et lancer. Confirmer le nom, la mini-carte, la géométrie runtime et les six voitures.
5. Répéter avec Steering Lab et Neural Lab; vérifier que le sélecteur et la piste affichée correspondent.
6. Retourner au menu puis relancer une course; vérifier qu'aucun canvas showroom ou session n'est dupliqué et que REDLINE suit toujours la règle « menus uniquement ».

## Limites restantes

- Une seule forme de monoplace est implémentée; aucune sélection de châssis n'est proposée.
- Les nombres sur la voiture sont des graphismes segmentés, pas une police de texture photographique.
- Les chiffres de performance décrivent les paramètres de base du moteur arcade, non des performances distinctes par voiture.
- Les circuits personnalisés restent hors championnat, dont le calendrier sauvegardé est limité aux circuits prédéfinis.
- La vérification visuelle et la sensation de lisibilité des cartes attendent un essai réel dans Chrome.
