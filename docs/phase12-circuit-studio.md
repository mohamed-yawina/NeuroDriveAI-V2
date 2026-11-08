# Phase 12 — Circuit Studio

## Format utilisateur `neurodriveai.circuit` v1

Les fichiers utilisateur sont des documents JSON versionnés indépendants des circuits et résultats scientifiques :

```json
{
  "schema": "neurodriveai.circuit",
  "version": 1,
  "id": "generated-2026-medium",
  "name": "Circuit medium · 2026",
  "controlPoints": [{ "x": 90, "z": 0 }],
  "width": 19,
  "closed": true,
  "startLine": { "controlPointIndex": 2, "direction": "forward" },
  "metadata": { "source": "circuit-studio", "generator": "radial-v1", "seed": 2026, "difficulty": "medium" }
}
```

`width` est la largeur totale en mètres. Les coordonnées sont horizontales (`x/z`); l'adaptateur attribue `y=0.08` comme les waypoints actuels. La ligne de départ nomme un point; l'adaptateur fait tourner la liste pour que ce point devienne `waypoints[0]`, conformément à `RaceWorld`, `RaceTiming` et au portique actuel. Les limites sont régénérées depuis le spline Catmull-Rom fermé avec `width / 2`.

## Validation géométrique

La structure JSON n'est qu'un premier contrôle. `validateCircuit` vérifie :

- boucle fermée et 10 à 64 points de contrôle;
- coordonnées `x/z` finies et bornées à ±5000 m;
- largeur comprise entre 12 et 26 m;
- longueur de chaque corde de 6 à 140 m et ligne de départ référencée;
- rayon de virage estimé sur les triplets d'au moins 6 m et changement de cap d'au plus 147,6°;
- intersections de la courbe Catmull-Rom échantillonnée et chevauchement des bandes de sections distinctes;
- six emplacements de grille sans chevauchement ni sortie de largeur praticable. La vérification reprend les trois rangées, l'écartement latéral de 5,4 m et les rayons de collision du moteur F1.

Le validateur affiche les premiers problèmes et expose longueur, rayon minimal, angles, état de grille et nombre de points. Un circuit géométriquement invalide ne peut pas être sauvegardé, exporté ou testé.

## Générateur déterministe

`generateCircuit(seed, difficulty)` utilise un PRNG entier 32 bits, des perturbations harmoniques radiales et des profils Easy, Medium et Hard. Les mêmes graine et difficulté produisent le même JSON. Le générateur cherche un point de départ dont la grille passe la validation; si aucun point n'est sûr, il renvoie une erreur plutôt qu'une piste non validée. Chaque résultat repasse par le validateur géométrique complet.

## Éditeur, import et bibliothèque

Le menu ouvre **Circuit Studio**. On peut glisser les points, activer l'insertion sur un segment, sélectionner/supprimer un point, ouvrir ou fermer la boucle, ajuster largeur et ligne de départ, annuler/rétablir jusqu'à 50 actions et réinitialiser. Les commandes clavier sont `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`, `Delete` et `Escape`.

L'export produit un fichier JSON `.ndcircuit.json`; l'import vérifie schéma, version et géométrie avant d'afficher le circuit. La bibliothèque locale utilise uniquement la clé `neurodriveai.user-circuits.v1` du `localStorage`. Elle ne lit et n'écrit aucun fichier de `results/` ou modèle historique. Les erreurs de JSON, de version et de stockage sont présentées dans le panneau.

## Compatibilité des modes

- **Tester Steering** passe le même `trackDefinition` à `SimulationSession` et `VehicleDynamics`.
- **Tester F1 Racing** le passe à `RaceSession` et construit la grille réelle de six voitures.
- **Préparer Neural** lance la simulation individuelle avec le modèle historique choisi dans le menu; aucun réseau n'est entraîné ni modifié.
- **Path Following Academy** adapte les mêmes waypoints à l'espace du canevas Academy et ne change pas ses scénarios ni son moteur.

`Track` lit maintenant une demi-largeur fournie par le circuit. Sans cette donnée, les circuits historiques conservent les dimensions 8,2 m, et les éléments du portique historique gardent leur géométrie précédente.

## Tests et limites

`tests/circuit-studio.test.js` couvre génération répétable, géométrie, intersections/corridor, largeur, grille, JSON versionné, stockage, adaptation F1/Steering/Neural/Academy et non-régression des circuits de généralisation. `tests/circuit-studio-navigation.test.js` couvre la sortie et le nettoyage de l'éditeur via `SessionNavigation`.

La validation automatisée ne confirme pas l'apparence des interactions dans un navigateur. L'éditeur et les vues doivent encore recevoir une vérification visuelle sur l'écran de démonstration. Le générateur crée des routes de course synthétiques; ce ne sont pas des tracés de circuits réels homologués.
