# Phase 10 — Steering Academy et BehaviorManager

## Référence pédagogique

Support analysé : « Steering behaviors / comportements réactifs — Master 2 Miage IA2 », Michel Buffa, octobre 2026, 62 diapositives. Les numéros ci-dessous sont les numéros de diapositives PowerPoint.

Le modèle général est en trois étapes : sélectionner un objectif/comportement, calculer une force de direction, puis intégrer le déplacement (diapositives 10–13). La formule récurrente de la diapositive 12 est :

```text
force de direction = vitesse désirée - vitesse actuelle
```

Les diapositives 52–62 contiennent des sujets de projets associés à d’autres promotions. Elles servent à comprendre les exemples proposés, mais leurs obligations de rendu ne sont pas considérées automatiquement obligatoires pour ce projet.

## Correspondance avec le support

| Notion | Diapositives | Implémentation Phase 10 | Validation |
|---|---:|---|---|
| Seek | 12, 14–18 | `SeekBehavior` appelle le `seek` historique; vitesse désirée normalisée vers la cible puis soustraction de la vitesse actuelle | `tests/steering-behaviors.test.js` |
| Flee | 18, 20 | Calcule d’abord la vitesse désirée opposée à la cible, puis `vitesse désirée − vitesse actuelle`; ne retourne pas simplement la force Seek | Test de signe et de vitesse |
| Pursuit | 19–21 | Cible prédite `position + vitesse × horizon`; l’Academy règle l’horizon en frames de simulation à 60 Hz | Test de position prédite |
| Evade | 20–21 | Fuit la position prédite du poursuivant, en inversant la vitesse désirée | Test prédiction et direction |
| Arrive | 22–25 | Vitesse désirée `maxSpeed × min(1, distance / slowRadius)`; freinage vers zéro à la cible | Tests loin, proche et à la cible |
| Wander | 26–28 | Cercle projeté devant l’agent; point cible déplacé par un angle pseudo-aléatoire par pas de temps | Test de déterminisme avec flux aléatoire injecté |
| Projection scalaire / Path Following | 29–31 | Adaptateur vers `PathFollowing` existant, sans recopier la projection sur segment | Test d’intégration avec waypoint fermé |
| Obstacle Avoidance | 32–36 | Segment de détection dynamique, vecteur `ahead` et vecteur court `ahead2`, test d’intersection avec obstacles circulaires et vecteur d’évitement | Tests collision prédite et champ libre |
| Alignment | 37 | Moyenne des vitesses voisines comme vitesse désirée, puis force de direction classique | Test de suivi du cap moyen |
| Cohesion | 38 | Centre des positions voisines comme cible passée au Seek historique | Test de force vers le centre |
| Separation | 39, 41–42 | Somme des vecteurs unitaires opposés, de norme `1 / distance`, plafonnée à `maxForce` | Test de répulsion |
| Boids | 40–42 | Composition activable Separation + Alignment + Cohesion; voisinage visible dans le champ | Test des trois composantes et test manager |
| Leader Following | 50–51, 60–62 | Arrive derrière le leader; Evade dans sa zone avant; Separation entre suiveurs | Test des rôles follower/evading |
| BehaviorManager | 31, 60 | Collection par instance, poids, activation, suppression, forces brutes, pondérées et résultante plafonnée | Tests de toute l’API et de saturation |

Les réglages de Wander reprennent les paramètres cercle-distance, rayon, angle et vitesses décrits à la diapositive 28. Pursuit utilise une durée réglable bornée en frames comme l’exercice de la diapositive 20. L’évitement conserve les tests sur position actuelle et ahead raccourci de la diapositive 35; la distance d’inspection croît avec le rapport vitesse/maxSpeed.

## Formules et choix d’implémentation

Soient la position `p`, la vitesse `v`, la cible `q`, la vitesse maximale `S` et la force maximale `F`.

```text
Seek:     desired = normalize(q - p) × S
          steering = clampMagnitude(desired - v, F)

Flee:     desired = normalize(p - q) × S
          steering = clampMagnitude(desired - v, F)

Arrive:   desiredSpeed = S × min(1, distance(p, q) / slowRadius)
          desired = normalize(q - p) × desiredSpeed
          steering = clampMagnitude(desired - v, F)

Pursuit:  predicted = targetPosition + targetVelocity × predictionSeconds
          steering = Seek(p, predicted)

Evade:    predicted = targetPosition + targetVelocity × predictionSeconds
          steering = Flee(p, predicted)

Separation: sum(normalize(p - neighborPosition) / distance)
            puis plafonnement à F

Alignment: desired = normalize(mean(neighborVelocities)) × S
           steering = clampMagnitude(desired - v, F)

Cohesion:  steering = Seek(p, mean(neighborPositions))

Composition: raw = Σ(weight[i] × force[i])
             final = clampMagnitude(raw, maxForce)
```

Le plafonnement final correspond à la limite physique appliquée ensuite par `SteeringVehicle.update`. Le manager rend disponibles les contributions brutes, les contributions pondérées, la somme non plafonnée et la résultante plafonnée. Les comportements gardent leurs limites locales lorsqu’ils en ont une; il n’y a pas de normalisation cachée par la somme des poids.

`BehaviorManager` est une instance attachée à un groupe d’agents plutôt qu’une collection statique globale. Cela évite que deux scènes ou scénarios modifient les poids l’un de l’autre. Les méthodes demandées restent disponibles : `add`, `remove`, `activate`, `deactivate`, `changeWeight`, `getBehavior`, `getSteeringForce`.

## Steering Academy

Le mode est un laboratoire 2D vu du dessus, distinct de la scène de course Three.js. Il réutilise `THREE.Vector3`, le `SteeringVehicle` existant et le `PathFollowing` historique. Son intégrateur utilise un pas fixe de `1/60 s`; la physique des validations scientifiques n’est pas modifiée.

Fonctions disponibles :

- Sélection d’un scénario Seek, Flee, Arrive, Pursuit, Evade, Wander, évitement, Boids, Leader Following, Path Following ou combinaison.
- Activation simultanée de plusieurs comportements et modification individuelle des poids.
- Sliders `maxSpeed`, `maxForce`, slow radius, voisinage, prédiction, géométrie de Wander, portée d’évitement et zone avant du leader.
- Cible mobile reproductible pour Pursuit/Evade; cible contrôlée à la souris pour les scénarios interactifs.
- Ajout d’obstacles circulaires par clic dans le scénario d’évitement.
- Affichage de la cible, du voisinage, du chemin, des cercles d’obstacles, d’ahead/ahead2 et des vecteurs de force.
- Pause, redémarrage déterministe depuis la graine et retour au menu.

## Tests

`tests/steering-behaviors.test.js` vérifie chaque comportement, la délégation au Path Following existant, l’API du manager, les pondérations, les forces invalides et la saturation. `tests/phase9-navigation-cleanup.test.js` vérifie plusieurs cycles de navigation ainsi que l’arrêt de la frame, l’abandon des écouteurs et le nettoyage des éléments/resources de l’Academy.

Commandes de validation :

```powershell
npm.cmd test
npm.cmd run build
```

## Limites de cette phase

Cette Academy ne lance aucun entraînement et n’écrit aucun fichier sous `results/` ni `public/phase8-model-*.json`. Les modèles A/B/C restent utilisés uniquement dans Neural AI Lab / simulation selon leur format historique. La course multi-voitures complète n’est pas incluse dans cette phase; le BehaviorManager et ses comportements constituent sa base réutilisable.
