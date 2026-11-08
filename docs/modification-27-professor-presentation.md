# Modification 27 — Mode Professeur et présentation finale

## Résumé

Le Mode Professeur réutilise les sessions F1 intégrées Steering Lab et Neural Lab. Il n’ajoute ni moteur de course, ni contrôleur, ni source de mesures. Le parcours conserve ses onze étapes et leur budget total de **180 secondes**. La chronologie est maintenant explicitement démarrée, peut être pilotée à la souris ou au clavier et met en pause la simulation F1 avec la présentation.

## Architecture et changements

- `ProfessorDemoTimeline` reste la source des étapes, de leur durée et de la progression.
- `ProfessorDemo` gère l’overlay, les commandes et un seul intervalle de chronométrage. Il s’arrête à la fermeture, retire ses écouteurs avec un `AbortController` et se met en pause quand la page perd le focus.
- `main.js` conserve la session lorsque deux étapes consécutives utilisent le même laboratoire. La session n’est remplacée qu’au passage Steering ↔ Neural ou au retour au menu. Les erreurs de transition sont signalées et la présentation est mise en pause.
- `RaceSession` expose l’étape courante dans l’en-tête du laboratoire et reçoit la pause/reprise du Mode Professeur.
- Le panneau de présentation est centré, compact, responsive et possède une zone défilante bornée pour les petits écrans. Le rendu visuel n’a pas été validé dans Chrome dans cet environnement.

### Parcours et durées

| Étape | Durée | Contenu et source affichée |
|---|---:|---|
| Introduction | 12 s | NeuroDrive F1 et séparation arcade/science |
| Perception et Path Following | 16 s | Projection et cible anticipée; cours, diapositives 11 et 29–31 |
| Obstacle Avoidance | 16 s | Force publiée par le contrôleur; cours, diapositives 32–36 |
| Separation | 16 s | Contribution calculée depuis les voisins; cours, diapositives 37–39 |
| BehaviorManager et résultante | 16 s | Forces pondérées et résultat exposé; cours, diapositives 12 et 31 |
| Comprendre les décisions de l’IA | 18 s | Mesures réelles du AI Telemetry Center |
| Architecture neuronale | 16 s | MLP historique 7→16→16→2 et provenance des modèles |
| Décision et action | 16 s | Observations, activations, sorties brutes, adaptation arcade |
| Comparaison Steering / Neural | 20 s | Tableau des véhicules de la même manche arcade |
| Généralisation et limites | 18 s | Métadonnées de circuits et limites de comparaison |
| Conclusion | 16 s | Résumé des deux approches |

Les 180 secondes décrivent le temps des étapes. Les pauses volontaires, la perte de focus et le chargement d’une nouvelle session prolongent la durée murale. Les étapes consécutives d’un même laboratoire ne rechargent pas la course.

## Contrôles

- **Démarrer**, **Précédent**, **Suivant**, **Pause/Reprendre**, **Recommencer**, **Ouvrir/Revenir au module** et **Quitter**.
- Clavier : `Espace` pause/reprise, `PageUp` étape précédente, `PageDown` étape suivante, `Échap` quitter. Les champs éditables gardent leurs touches; les raccourcis du Mode Professeur arrêtent la propagation pour éviter le double basculement de pause.
- Le bouton de retour du HUD de laboratoire ferme également la présentation et revient au menu.

## Sources des données et intégrité pédagogique

- Steering : vecteurs, poids et résultante viennent des données de décision publiées par le `RaceController` observé et des visualisations `RaceLabVisuals`. Les forces restent absentes pour le pilotage humain ou un contrôleur qui ne les expose pas.
- Neural : observations, activations et sorties viennent du contrôleur réellement associé à la voiture suivie. L’adaptation arcade et le mouvement observé sont distingués. Les modèles A/B/C ne sont ni réécrits ni entraînés.
- Télémétrie et comparaison : les valeurs sont collectées par `AITelemetryCenter` dans la session affichée. Le texte indique qu’une manche arcade ne reproduit pas le protocole scientifique historique.
- Le PowerPoint local attribue les comportements réactifs aux diapositives 10–13, Path Following aux diapositives 29–31, l’évitement aux diapositives 32–36 et Separation aux diapositives 37–39. Les diapositives 43–49 traitent de neuroévolution; elles ne documentent pas l’architecture MLP 7–16–16–2. Les diapositives 52 et suivantes comprennent des sujets d’autres promotions. Elles ne sont donc pas présentées comme des exigences Casablanca G1.
- Le dépôt GitHub Casablanca G1 référencé par la diapositive 8 est public et sa page expose les dossiers Seek, Pursue/Evade, Arrival, Wander, Path Following, Obstacle Avoidance et Boids. Les fichiers README/consignes n’ont pas pu être récupérés lors de cette vérification; aucune conformité officielle ou liste exhaustive d’exigences G1 n’est affirmée. [Dépôt du cours Casablanca G1](https://github.com/micbuffa/SteeringBehavioursM2IA2_Casa_2026_2027).

## Tests et validation

Tests ciblés ajoutés dans `tests/professor-demo.test.js` : budget de durée, démarrage, navigation, pause synchronisée, reprise, raccourcis et champs éditables, perte de focus, redémarrage, nettoyage, réutilisation des sessions et erreurs de transition. `tests/ultimate-lot5-1.test.js` continue à couvrir la chronologie existante.

Validation exécutée : `npm.cmd test` — **330 tests réussis sur 42 fichiers**; `npm.cmd run build` — réussi. Vite signale le chunk Three.js de **510,34 kB** au-dessus de son seuil de 500 kB, avertissement déjà lié au bundle du jeu. Contrôle SHA-256 du manifeste : **175 entrées, 0 absente, 0 modifiée**. Aucun entraînement, commit ou push n’a été effectué. Chrome, Edge et Playwright ne sont pas installés/détectés dans cet environnement; le contrôle visuel reste manuel.

## Script oral — environ trois minutes

> Bonjour. NeuroDrive F1 rassemble la course arcade et les laboratoires d’intelligence artificielle dans le même environnement 3D. Les résultats de cette démonstration restent séparés des expériences historiques.
>
> Une voiture autonome observe sa position par rapport à la piste. Avec Path Following, elle projette cette position sur le chemin et vise un point situé plus loin pour anticiper. La télémétrie indique la voiture suivie, sa vitesse, sa progression et son écart au tracé. Les valeurs et les vecteurs affichés proviennent du contrôleur sélectionné; ils ne sont pas dessinés à titre illustratif.
>
> Obstacle Avoidance calcule une contribution quand un obstacle est détecté devant la voiture. Separation calcule une force à partir des véhicules voisins. Nous pouvons sélectionner une autre voiture pour voir ses propres mesures. Le BehaviorManager combine les contributions actives avec leurs poids. La résultante est limitée par le contrôleur avant d’influencer la direction. Pursuit n’intervient que lorsqu’un dépassement l’active; il n’est pas présenté comme une force permanente.
>
> Dans Neural Lab, nous suivons une voiture équipée d’un des modèles historiques A, B ou C. L’architecture est de sept entrées, deux couches cachées de seize neurones, puis deux sorties. Les entrées sont les observations calculées pour cette voiture; les couleurs et activations du graphe correspondent à l’inférence réelle. Les deux sorties brutes sont affichées séparément des commandes après adaptation arcade et du mouvement effectivement observé. Nous pouvons changer de voiture pour inspecter un autre contrôleur de la même manche.
>
> Le tableau compare Steering et Neural dans une même manche pour observer vitesse, progression, tours, incidents et statut d’arrivée lorsqu’ils sont disponibles. Les voitures peuvent se trouver à des positions différentes et avoir vécu des incidents différents. Cette comparaison décrit la partie en cours; ce n’est pas un protocole contrôlé, une fitness d’entraînement ou une preuve de supériorité.
>
> Enfin, Path Following et l’évitement sont présentés dans le support de comportements réactifs. Le document montre aussi des exemples de neuroévolution; il ne confirme pas que toutes ces notions, ou l’architecture neuronale précise de ce projet, sont des obligations de Casablanca G1. Certaines diapositives décrivent explicitement des projets d’autres promotions. Nous ne les reprenons pas comme consignes de cette promotion.
>
> Cette démonstration montre donc deux manières de produire une action : combiner des forces explicites ou appliquer un modèle neuronal à ses observations. Les commandes, les activations et l’état de la voiture sont observables dans le jeu. Les résultats historiques restent intacts et séparés. Pour établir une conclusion scientifique, il faudrait respecter le protocole, les conditions et les mesures de l’expérience historique plutôt que déduire un résultat à partir de cette course arcade.

## Checklist Chrome

1. Ouvrir Carrière locale → Mode Professeur; vérifier l’état « prêt » avant démarrage.
2. Cliquer Démarrer, attendre l’étape Path Following et vérifier l’ouverture du Steering Lab.
3. Vérifier que les étapes Path, Obstacle, Separation, BehaviorManager et Télémétrie gardent le même état de course et que les mesures/vecteurs suivent la voiture sélectionnée.
4. Tester pause, reprise, précédent/suivant, `Espace`, `PageUp`, `PageDown` et `Échap`; confirmer qu’une seule pause est appliquée.
5. Vérifier le passage au Neural Lab, sélectionner A, B et C dans la voiture suivie et comparer les valeurs propres à chaque voiture.
6. Vérifier la mention de comparaison arcade, puis le retour menu à l’étape conclusion et à Quitter.
7. Répéter aux résolutions 1920×1080, 1366×768 et 1280×720; vérifier qu’aucun panneau ne masque les commandes ni ne déborde.
8. Masquer l’onglet ou changer de fenêtre pendant la course; confirmer la pause, puis revenir et reprendre.
9. Recommencer deux fois; contrôler la console, le nombre de sessions et la musique REDLINE (menus seulement).
