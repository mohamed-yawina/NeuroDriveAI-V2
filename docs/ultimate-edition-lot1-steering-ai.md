# Ultimate Edition — lot 1 : Steering AI en course

## Portée

Le lot 1 enrichit exclusivement le moteur arcade de `src/game/`. Il réutilise `BehaviorManager`, `PathFollowing`, `ObstacleAvoidanceBehavior`, `SeparationBehavior`, `PursuitBehavior` et `OvertakingPlanner`. Aucun module de physique/entraînement scientifique n'est modifié. Les contributions sont des forces de steering arcade sans unité physique affichée.

## Mesures et décision

À chaque calcul, `RaceController` conserve les contributions effectivement émises par le BehaviorManager. La somme des contributions pondérées est plafonnée à `maxForce`, comme dans le manager existant. `RaceCoach` transforme les vecteurs X/Z conservés en segments SVG et expose les valeurs de composantes, leur norme, le poids effectif et la résultante plafonnée. Une force désactivée est explicitement montrée inactive; ses composantes ne sont pas reconstruites.

Le follower publie l'index du segment projeté, la distance latérale à la trajectoire, la courbure anticipée et sa vitesse cible calculée. La phrase de diagnostic est dérivée de l'état du planificateur (voie libre/occupée, dépassement, retour ou défense) ou de ces mesures. Elle décrit l'état observé; elle ne prétend pas connaître une intention neuronale.

Le dépassement déjà présent choisit une voie dégagée, fait évoluer le décalage latéral par pas, active Pursuit vers sa cible et revient vers la trajectoire lorsque l'adversaire est dégagé. La défense arcade optionnelle mémorise le poursuivant et son côté tant qu'il reste dans une fenêtre de distance. Elle abandonne la défense quand il passe ou s'éloigne, et ne se décale pas si la voie candidate est occupée. La validation est géométrique dans la projection de la trajectoire, pas une certification de tactique de course professionnelle.

## Personnalités et réglage à chaud

Le panneau sélectionne uniquement les voitures dont le contrôleur expose le diagnostic arcade `RaceController`. Les profils prudent/équilibré/agressif changent la vitesse maximale arcade, les poids des comportements et la distance de déclenchement tactique. Les sliders maxSpeed/maxForce et les curseurs d'anticipation, portée d'évitement, rayon de voisinage et horizon de Pursuit affectent le contrôleur observé. Ils ne sont pas appliqués aux réseaux A/B/C historiques ou à leur évaluation scientifique. La défense est désactivée par défaut. Le panneau permet d'activer/désactiver Path Following, Obstacle Avoidance, Separation et Pursuit, et de régler leurs poids. « Réinitialiser les réglages Steering » restaure les paramètres arcade du contrôleur.

Le BehaviorManager actuel réalise une combinaison additive pondérée avec saturation finale. Il ne possède pas de notion de priorité stricte; aucune priorité n'est donc affichée ni simulée.

## Correspondance avec le cours

| Cours | Application arcade | Validation |
|---|---|---|
| Diapositives 11–13 : sélection, steering, locomotion séparés | Controller calcule les forces; GameVehicleDynamics les intègre; Scene/voiture rend l'état | Non-régression moteur de course, pas fixe |
| Diapositive 12 : force = vitesse désirée − vitesse actuelle | Réutilisée par Seek/Path Following et comportements existants | Tests steering et bornes `maxForce` |
| Diapositives 29–31 : projection scalaire et cible en avance | PathFollowing expose projection, segment, distance, courbure et vitesse cible | Tests de PathFollowing existants + snapshot du mode professeur |
| Diapositives 32–36 : éviter un obstacle avec ahead dynamique et test court | ObstacleAvoidanceBehavior existant; curseur arcade agit sur sa portée | Tests de steering existants, composante réelle affichée |
| Diapositives 37–40 : séparation, alignement, cohésion/Boids | La course utilise Path Following, évitement et Separation; le lot n'ajoute pas les autres forces aux contrôleurs de course | Force Separation affichée avec son vrai poids; Academy conserve ses autres comportements |
| Diapositives 50–51 : rester derrière, éviter la zone avant, separation | Défense tactique utilise une voie latérale sûre et un état verrouillé par adversaire; le suivi de leader de l'Academy reste distinct | Tests de maintien de côté et reset de menace |
| Diapositive 60 : gestion dynamique add/remove/activate/weight | Panneau arcade change activation/poids; les comportements et leur calcul existants sont réutilisés | Tests de modifications live et remise à zéro |

## Tests ajoutés

`tests/ultimate-lot1-race-coach.test.js` vérifie les contributions et vecteurs calculés, saturation, maxSpeed/maxForce, réglage dynamique, validation des paramètres, remise à zéro, profils, défense sans zigzag, diagnostics sourcés et ouverture/fermeture du panneau. `tests/phase11-race-engine.test.js` continue de couvrir l'équité de voie, les collisions, la stabilité à pas fixe et les courses IA.

## Limites de cette étape

- Les profils ont des paramètres de gameplay et ne constituent pas des personnalités apprises.
- La priorité stricte n'existe pas dans le manager additif actuel.
- La défense est une règle de voie simplifiée et son niveau est un réglage de démonstration.
- Les courses d'assignation Neural qui n'exposent pas de `RaceController` désactivent le panneau de forces au lieu d'inventer leurs diagnostics.
- Un navigateur visuel n'est pas disponible sur ce poste; le layout responsive et l'ergonomie doivent encore être contrôlés manuellement dans Chrome.
