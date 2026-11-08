# Modification 28 — audit académique final

## Résumé et périmètre

Cette livraison consolide les preuves locales, décrit les limites et prépare la documentation de soutenance. Elle n’ajoute aucune fonctionnalité de jeu et ne modifie aucun modèle, résultat ou protocole scientifique. Les changements Modification 27 déjà présents dans le worktree ont été préservés.

## Sources examinées

- Support local : `docs/professor-course/Steering behaviors Master Miage IA2.pptx`.
- Référence publique indiquée par le support : [dépôt SteeringBehavioursM2IA2_Casa_2026_2027](https://github.com/micbuffa/SteeringBehavioursM2IA2_Casa_2026_2027). La page du dépôt expose des dossiers d’exemples de comportements. Le contenu du README et des consignes détaillées n’a pas pu être récupéré pendant cet audit.
- Code et tests listés dans `docs/steering-behaviors-audit.md`, `docs/scientific-methodology.md` et les références ci-dessous.

Le PowerPoint contient les notions Seek/Flee, Pursuit/Evade, Arrive, Wander, Path Following, Obstacle Avoidance, comportements de voisinage/Boids, neuroévolution et Leader Following. Cela prouve qu’elles sont abordées comme contenu du cours, pas qu’elles constituent toutes des livrables obligatoires de Casablanca G1. Les diapositives de projets destinés à d’autres cohortes ne sont pas transférées à G1.

## Matrice de traçabilité

| Exigence / notion | Source | Preuve dans le projet | État | Action nécessaire |
|---|---|---|---|---|
| Cahier des charges officiel et barème Casablanca G1 | Aucun document officiel complet disponible localement; dépôt public lié depuis le support | Le support cite le dépôt, mais ses consignes détaillées n’ont pas été récupérées | Non vérifiable | Obtenir et faire confirmer le brief par l’enseignant avant toute revendication de conformité |
| Seek / Flee / Arrive | PPTX, slides 14–18 et 22–25 | `SteeringBehaviors.js`, `tests/steering-behaviors.test.js`, scénarios Academy | Partiellement vérifié comme notion de cours; obligation G1 non vérifiable | Vérification visuelle Chrome de la démonstration |
| Pursuit / Evade | PPTX, slides 19–21 | Classes génériques; Pursuit conditionnel en F1, Evade en Academy; tests steering | Partiellement vérifié comme notion; obligation G1 non vérifiable | Confirmer le brief officiel |
| Wander | PPTX, slides 26–28 | `WanderBehavior`, scénario Academy et tests | Partiellement vérifié; non actif en course F1 | Aucun ajout nécessaire pour le gameplay; obligation non vérifiable |
| Path Following | PPTX, slides 29–31 | `PathFollowing.js`, `RaceController.js`, tests avancés et course | Conforme vérifié au niveau de l’implémentation/test, pas à une exigence officielle | Démonstration Chrome à effectuer |
| Obstacle Avoidance | PPTX, slides 32–36 | Contrôleur course, Academy, tests steering/course | Conforme vérifié au niveau code/test, portée locale documentée | Démonstration Chrome à effectuer |
| Separation | PPTX, slides 37–39 | Comportement générique et course; tests | Conforme vérifié au niveau code/test | Vérifier les vecteurs live en Chrome |
| Alignment / Cohesion / Boids | PPTX, slides 37–42 | Classes et scénario Academy; tests. Pas enregistrés au RaceController F1 | Partiellement vérifié, démonstration pédagogique; obligation G1 non vérifiable | Confirmer si le brief exige une démo particulière |
| Leader Following | PPTX, slides 50–51 | Comportement générique/Academy; tests | Partiellement vérifié; pas actif en course F1 | Aucun changement sans demande vérifiée |
| BehaviorManager / combinaison pondérée | Notion démontrée par les modules et tests; demandes de projet sur slides d’autres promotions exclues | `BehaviorManager.js`, diagnostics, tests | Conforme vérifié comme fonctionnalité de projet; exigence officielle G1 non vérifiable | Ne pas déduire une obligation des consignes d’autres groupes |
| MLP 7→16→16→2 et modèle A/B/C | Artefacts et code du projet; PPTX décrit la neuroévolution mais ne confirme pas cette architecture précise | `NeuralNetwork.js`, artefacts JSON, tests et vues Neural Lab | Conforme vérifié comme implémentation du projet; prescription professorale non vérifiable | Démo live Chrome et brief officiel |
| Algorithmes génétiques / neuroévolution historiques | PPTX, slides 43–49; rapports d’expérience | Rapports scientifiques et scripts historiques | Partiellement vérifié par artefacts documentés; obligation G1 non vérifiable | Citer protocole/rapport associé, ne pas lancer d’entraînement pour la soutenance |
| Fitness et résultats expérimentaux | Rapports `scientific-validation`, phase 8 B/C, généralisation | Métriques et protocoles rapportés; artefacts conservés | Conforme vérifié en tant que rapports existants, conclusions limitées | Lire les limites et ne pas assimiler fitness et performance arcade |
| Généralisation | `docs/generalization-validation.md`, rapports B/C | Évaluations réservées documentées, avec échecs selon graine | Partiellement vérifié; échantillons/circuits limités | Présenter comme évaluation finie, jamais comme généralisation universelle |
| Démonstration Professeur de 180 s | `ProfessorDemo.js`, doc Mod 27 et tests | Timeline déclarée 180 s; tests de durée/navigation/pauses | Partiellement vérifié : code/tests, visuel non testé navigateur | Exécuter checklist Chrome avant soutenance |
| Conservation de 175 empreintes historiques | `docs/ultimate-edition-lot5-1-integrity.csv` | Vérification SHA-256 exécutée pour cette livraison | Conforme vérifié si le résultat final indique 175/175 | Refaire le contrôle après toute édition d’artefacts scientifiques |
| Captures d’écran et qualité visuelle | Aucun asset de capture constaté dans le dépôt | Aucun screenshot livré par cet audit | Hors périmètre documentaire / non vérifiable visuellement | Capturer uniquement après test réel Chrome |

Les statuts ci-dessus sont des états de preuve technique; « conforme vérifié » ne signifie pas « conformité officielle Casablanca G1 ».

## Audit technique et scientifique

- **Steering :** l’inventaire détaillé, formules, usages F1 vs Academy, tests et limites est dans `docs/steering-behaviors-audit.md`. F1 active Path Following, Obstacle Avoidance, Separation et Pursuit conditionnel. Les autres comportements cités restent des démonstrations génériques/Academy et ne sont pas déclarés actifs en F1.
- **Neural :** le code expose MLP 7→16→16→2, sept observations et deux commandes; le moteur arcade utilise un adaptateur distinct du moteur scientifique historique. Les modèles A/B/C ne sont pas modifiés.
- **Résultats :** les documents rapportent des mesures finies et leurs limites; phase 8 C indique 267/270 sur circuits connus et 60/90 sur le test réservé, avec une graine à 0/30. Ces données ne justifient ni une généralisation universelle ni une comparaison directe aux chronos arcade.
- **Architecture, état, rendu et persistance :** voir `docs/architecture-overview.md`. Les tests automatisés couvrent les modules selon leurs fixtures mais ne prouvent pas l’absence absolue de bugs ni la qualité GPU dans chaque navigateur.
- **Problèmes corrigés dans cette modification :** aucun bug d’exécution mineur reproductible n’a été établi durant l’audit documentaire. Le problème factuel démontrable était le README obsolète; il a été remis en cohérence avec l’interface et les scripts présents.

## Résultats de validation

- `npm.cmd test` : **330 tests réussis, 42 fichiers réussis**, durée rapportée 10,14 s.
- `npm.cmd run build` : **réussi**. Vite signale le chunk Three.js de **510,34 kB** au-dessus du seuil 500 kB; cet avertissement n’est pas une mesure de FPS.
- `git diff --check` : **réussi**, aucun problème d’espacement; Git affiche seulement des avis de conversion LF/CRLF pour quelques fichiers.
- SHA-256 : **175 entrées, 0 absente, 0 modifiée** par rapport au manifeste.
- Aucun entraînement dédié, commit ou push n’a été exécuté. La suite Vitest contient des tests déterministes de l’algorithme d’entraînement; ce sont des tests, pas un lancement de campagne d’entraînement.

## Limites et éléments ouverts

1. Les consignes officielles complètes et le barème Casablanca G1 ne sont pas vérifiés; l’approbation finale revient à l’enseignant.
2. Les visuels, transitions, audio, Turbo, HUD, navigation et Mode Professeur n’ont pas été parcourus dans Chrome pendant cet audit faute de navigateur automatisable détecté.
3. Aucun screenshot n’est fourni comme preuve visuelle.
4. Les tests headless ne mesurent ni FPS GPU, ni latence audio perceptible, ni compatibilité avec tous les matériels.
5. Les résultats scientifiques ont des ensembles finis de graines/circuits et des échecs documentés; les simulations arcade ont un adaptateur/dynamique différents.

## Checklist Chrome avant livraison

1. Démarrer l’application, inspecter la console et vérifier le chargement des modèles.
2. Parcourir menu, course rapide, Garage, Carrière et retour au menu.
3. Ouvrir Circuit Studio, charger un circuit valide puis lancer son test et revenir.
4. Steering Lab : sélectionner un contrôleur Steering, vérifier vecteurs réels et pause/reprise; sélectionner le joueur humain et confirmer l’absence de fausses forces.
5. Neural Lab : charger A, B et C et vérifier que pilote suivi, modèle, observations, activations et sorties sont associés à la même voiture.
6. Vérifier le libellé « comparaison arcade » et l’absence d’écriture de résultats dans carrière/l’historique scientifique.
7. Lancer le Mode Professeur, suivre les dix/onze étapes selon le code présent, vérifier navigation, pause, reprise, sortie et durée annoncée de 180 s.
8. Tester les tailles 1920×1080, 1366×768 et 1280×720; contrôler panneaux, HUD et caméra.
9. Vérifier REDLINE audible dans le menu uniquement et silencieuse dans toute session, y compris pause/labos.
10. Recharger le navigateur et vérifier paramètres/carrière/circuits sans créer de doublons de session.

## Verdict de livraison

- **Prêt techniquement :** oui pour la validation automatisée de cette livraison (tests, build, diff-check et empreintes passent); cela ne prouve pas l’absence totale de bugs.
- **Prêt pour démonstration :** préparation documentaire prête; exécution visuelle Chrome reste à faire.
- **Conformité académique confirmée :** non. Le support local prouve des notions enseignées, mais le brief officiel détaillé G1 n’est pas disponible/vérifié dans cette livraison. Aucune note n’est attribuée.
