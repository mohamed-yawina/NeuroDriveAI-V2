# Questions possibles du professeur — réponses vérifiables

Les réponses décrivent le code et les artefacts présents; elles ne prétendent pas décrire un barème officiel de Casablanca G1.

1. **Qu’est-ce qu’un Steering Behavior ici ?** Une règle qui transforme l’état du véhicule et une cible ou un voisinage en force de direction. Les classes sont dans `src/ai/behaviors/SteeringBehaviors.js`.
2. **Comment Seek est-il calculé ?** Vitesse souhaitée vers la cible moins vitesse actuelle, puis force bornée par `maxForce` (`src/ai/SeekBehavior.js`).
3. **Quelle différence entre Seek et Path Following ?** Seek rejoint une cible; Path Following projette le véhicule sur un chemin et choisit un point anticipé, avec une adaptation à la courbure.
4. **Comment fonctionne Flee ?** Il choisit une vitesse souhaitée opposée à la cible, soustrait la vitesse actuelle et borne la force.
5. **Qu’est-ce qu’Arrive ?** Une variante de Seek dont la vitesse souhaitée diminue dans un rayon de ralentissement.
6. **Pursuit est-il toujours actif en course ?** Non. Le `RaceController` l’active conditionnellement quand `OvertakingPlanner` fournit une cible de poursuite.
7. **Comment fonctionne Evade ?** Il prédit une position de cible puis applique Flee vers l’extérieur de cette position prédite.
8. **Wander est-il utilisé par les pilotes F1 ?** Non dans le `RaceController` de course; il est démontré dans l’Academy.
9. **Comment Path Following choisit-il sa cible ?** Il projette sur les segments, calcule un lookahead et examine la courbure; le contrôleur arcade applique ensuite Seek vers sa cible de voie.
10. **Comment évite-t-on un obstacle ?** Un détecteur local teste le véhicule et des segments d’anticipation contre les obstacles, puis produit une force de dégagement. Ce n’est pas un planificateur global.
11. **Que fait Separation ?** Additionne des répulsions des voisins proches (pondération inverse au carré), puis borne la force.
12. **Alignment et Cohesion sont-ils actifs dans la course F1 ?** Ils existent dans les comportements génériques et les scénarios Academy, mais ne sont pas enregistrés comme forces du contrôleur de course F1.
13. **Que fait BehaviorManager ?** Il multiplie les forces actives par leurs poids, les additionne et borne la résultante. Il ne fait pas d’arbitrage par priorité.
14. **Quelle architecture neuronale est utilisée ?** Les artefacts A/B/C et le `NeuralNetwork` ont les dimensions 7→16→16→2.
15. **Quelles sont les sept observations ?** Cinq distances de capteurs normalisées, un ratio de vitesse et une erreur de cap normalisée (voir `src/ai/ObservationBuilder.js`).
16. **Quelles sont les sorties ?** La première commande le braquage; la seconde est une commande longitudinale signée accélération/freinage. Le contrôleur les borne et les adapte au moteur arcade.
17. **Quelle activation est appliquée ?** `Math.tanh` à chaque couche du MLP (`src/ai/neural/NeuralNetwork.js`).
18. **Les valeurs affichées sont-elles réelles ?** Le visualiseur reçoit les observations, activations et sorties du contrôleur associé à la voiture suivie; l’adaptateur arcade et le mouvement résultant sont affichés distinctement.
19. **Qu’est-ce que l’adaptateur arcade change ?** Il transforme les deux sorties bornées en commandes compatibles avec `GameVehicleDynamics`; il ne rend pas la dynamique arcade identique au moteur scientifique.
20. **Comment les modèles A/B/C sont-ils chargés ?** Comme artefacts historiques depuis `public/phase8-model-{a,b,c}.json`, via les adaptateurs du Neural Lab. Cette tâche ne les réentraîne ni ne les modifie.
21. **Le projet utilise-t-il la neuroévolution ?** Les rapports documentent des expériences historiques d’algorithmes génétiques/neuroévolution. Il faut citer le rapport d’expérience précis; la course live n’est pas un entraînement.
22. **Qu’est-ce que la fitness mesure ?** Cela dépend du protocole historique correspondant; elle ne doit pas être confondue avec le temps au tour ou le classement d’une partie arcade.
23. **Les modèles généralisent-ils à tout circuit ?** Non démontré. Les essais réservés sont limités et les rapports montrent des échecs; par exemple, le rapport C donne 60/90 sur le circuit réservé avec une graine à 0/30.
24. **Comment la simulation est-elle rendue ?** Three.js rend la scène WebGL; `RaceSession` coordonne monde, état, contrôles, HUD et cycle de vie. Le rendu frame et l’évolution simulation sont distincts des protocoles historiques.
25. **Comment les fuites de ressources sont-elles limitées ?** Les modules de session possèdent des routines de fermeture qui retirent écouteurs/animations et libèrent les ressources détenues; les tests d’intégration couvrent navigation et nettoyage, sans prouver l’absence absolue de fuite GPU dans tous les navigateurs.
26. **Quelles validations automatisées sont disponibles ?** Vitest couvre unités de comportements, réseau, progression et intégrations de session; `npm.cmd test` exécute la suite. Les tests headless ne certifient pas le rendu visuel ni les performances GPU.
27. **Pourquoi séparer moteur scientifique et arcade ?** Le premier préserve les conditions et unités documentées des expériences; l’arcade sert au jeu et à la visualisation intégrée. Mélanger leurs scores compromettrait l’interprétation.
28. **Les notions du PowerPoint sont-elles toutes obligatoires pour G1 ?** Le document local prouve leur présence dans le cours, pas leur caractère obligatoire. Les consignes officielles complètes n’ont pas été vérifiées.
29. **Les slides de projets d’autres promotions s’appliquent-elles à Casablanca G1 ?** Aucune preuve ne l’établit. Elles sont signalées comme exemples/exercices d’autres cohortes et non comme exigences G1.
30. **Les résultats démontrent-ils une supériorité d’une approche ?** Non. Une course arcade n’est pas une comparaison contrôlée; les résultats historiques doivent être lus avec leurs protocoles, graines, circuits et limites.

## Sources principales

- `src/ai/behaviors/SteeringBehaviors.js`, `src/ai/behaviors/BehaviorManager.js`, `src/game/RaceController.js`.
- `src/ai/ObservationBuilder.js`, `src/ai/NeuralController.js`, `src/ai/neural/NeuralNetwork.js`.
- `src/neural-lab/ExperimentProtocol.js`, `docs/scientific-validation.md`, `docs/phase8-configuration-b.md`, `docs/phase8-configuration-c.md`.
- `docs/professor-course/Steering behaviors Master Miage IA2.pptx`.
