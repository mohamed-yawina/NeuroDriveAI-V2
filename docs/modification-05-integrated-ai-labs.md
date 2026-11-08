# Modification 05 — Laboratoires IA intégrés

## Architecture avant / après

Avant, les cartes de laboratoires ouvraient des applications pédagogiques distinctes : Steering Academy possédait son canvas de simulation propre, tandis que Neural Racing Lab présentait ses outils de recherche/headless et un visualiseur séparé. Le parcours principal passe maintenant par `RaceSession` et les composants de course déjà utilisés par F1 Racing : `SceneManager`, circuit, voitures Formula, caméra, HUD, mini-carte et nettoyage de session. Les anciennes applications restent accessibles depuis « Outils pédagogiques et poste de recherche détaillé ».

Le circuit d'expérience est sélectionnable dans le panneau Laboratoires IA. Les deux parcours intégrés exposent lecture/pause/reprise, ralentissement, sélection du pilote suivi et retour aux laboratoires. Les sessions de laboratoire n'enregistrent pas de replay/carrière arcade.

## Steering Lab

Le mode observe un `RaceController` réel dans la scène F1. Le panneau expose les contributions réellement calculées et les poids/configurations modifiables : Path Following, Obstacle Avoidance, Separation et Pursuit conditionnel. La télémétrie s'appuie sur la position de la voiture, sa vitesse, sa progression/projection sur le circuit, les collisions et sorties de piste comptabilisées par le monde de course. L'inspection des vecteurs et réglages plus détaillés reste accessible via le panneau Coach existant.

Les autres comportements disponibles dans l'atelier pédagogique historique (Seek, Flee, Arrive, Evade, Wander, Alignment, Cohesion, Leader Following et démonstrations dédiées) ne sont pas présentés comme des forces actives du pilote de course. Leur visualisation dans le même décor F1 reste à intégrer; l'atelier historique reste disponible.

## Neural Lab

Le mode charge les artefacts A/B/C existants, valide leur architecture `7-16-16-2` et leur provenance, puis les fait courir avec Steering AI dans la même scène arcade. L'adaptateur réutilise les cinq capteurs de piste normalisés, la vitesse et l'erreur de cap normalisées de `NeuralController`; les deux sorties sont interprétées par le contrôleur comme direction et commande longitudinale signée. Les activations affichées proviennent d'inférences réelles du réseau sélectionné.

L'adaptateur emploie la dynamique arcade (pas fixe 60 Hz et `GameVehicleDynamics`, dont la masse est fournie au contrôleur) : ce parcours est une visualisation/évaluation arcade, pas une reproduction de la validation Phase 8. Le protocole historique a notamment évalué à 30 Hz. Le panneau marque les circuits en fonction des métadonnées Phase 8 : `original`, `technical` et `fast-oval` étaient utilisés pour entraînement et validation; `phase8-chicane-test` est le test tenu à l'écart; les circuits utilisateurs et non documentés ne sont pas assimilés à ces catégories. La course ne modifie ni poids ni artefacts scientifiques et ne sauvegarde pas de nouveaux résultats dans les fichiers historiques.

## Fichiers concernés

- `src/main.js`, `src/ui/MainMenuSections.js` : routes principales vers les scènes partagées, sélecteur de circuit, sélection A/B/C et liens vers les outils historiques.
- `src/game/RaceSession.js`, `src/game/createRosterRaceWorld.js` : interface de labo dans la session existante, simulation ralentie, roster de contrôleurs et exclusion des sauvegardes de carrière.
- `src/neural-lab/IntegratedLab.js`, `src/neural-lab/ExperimentProtocol.js` : validation du protocole d'adaptation, provenance et dimensions observées; masse arcade fournie sans changement des équations du réseau.
- `src/style.css`, `src/game/race-session.css` : panneaux intégrés au style Racing Red et adaptation mobile.
- `tests/integrated-ai-labs.test.js`, `tests/main-menu-sections.test.js` : routage, classification des circuits, forces Steering réelles, contrat du réseau et validation des modèles.

## Validation et intégrité

Les tests ciblés et la compilation de production ont réussi. La compilation signale encore un chunk Three.js d'environ 509 kB, avertissement de taille sans mesure de FPS. Les tests navigateur, caméra, GPU, audio et comportement visuel sur matériel réel ne sont pas établis par ces résultats automatisés.

Les empreintes de `public/phase8-model-{a,b,c}.json` et des résultats scientifiques sont comparées au manifeste `docs/ultimate-edition-lot5-1-integrity.csv` après validation. Les poids A/B/C, les résultats Phase 4–8, le moteur scientifique et les entraînements n'ont pas été modifiés.

## Checklist Chrome

1. Depuis le menu, ouvrir Laboratoires IA et démarrer Steering Lab; vérifier que la scène, le circuit, les voitures et les caméras sont ceux de F1 Racing.
2. Modifier le circuit, suivre une voiture, ralentir, mettre en pause/reprendre et revenir au menu; recommencer pour vérifier l'absence de canvas ou de boucle en double.
3. Observer les contributions Steering actives et modifier/désactiver un poids via Coach; vérifier la télémétrie et le comportement dans la scène.
4. Ouvrir Neural Lab, sélectionner A/B/C et un circuit, démarrer; vérifier provenance, sept entrées, deux sorties et activations calculées, ainsi que le suivi caméra.
5. Revenir puis relancer; vérifier la sélection du circuit, les panneaux et l'absence d'erreur dans la console.
6. Essayer circuit utilisateur valide et circuits non classés; leur statut doit rester explicite et non scientifique.

## Limites

- Les modèles historiques sont adaptés au moteur arcade pour démonstration, avec des conditions différentes du moteur/protocole de recherche; les temps ou résultats arcade ne doivent pas être comparés aux statistiques de Phase 8.
- Les comportements réactifs non utilisés par le `RaceController` sont encore explorés dans l'atelier historique, pas dans une scène F1 intégrée.
- La comparaison démarre un roster commun, mais ne remplace pas une campagne répétée avec protocole d'équité/statistiques du Neural Racing Lab.
- Validation visuelle Chrome et essai matériel restent à effectuer si aucun navigateur automatisé n'est disponible.
