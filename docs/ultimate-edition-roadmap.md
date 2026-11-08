# NeuroDrive F1 Ultimate Edition — feuille de route

## Périmètre et protection des expériences

Les mécaniques compétitives vivent dans `src/game/` et ne doivent pas être importées par `src/physics/`, les environnements d'entraînement scientifiques ou les validateurs des phases 4 à 8. Les modèles A/B/C, résultats, graines, circuits de protocole et récompenses historiques restent en lecture seule. Les courses arcade et évaluations de nouveaux pilotes doivent être étiquetées séparément.

Le support pédagogique inspecté est le PowerPoint Michel Buffa d'octobre 2026 (62 diapositives). Les diapositives 11–13 distinguent sélection d'action, force de pilotage et locomotion; les diapositives 12, 14, 18–23 et 26–28 couvrent steering, Seek/Flee, Pursuit/Evade, Arrive et Wander; les diapositives 29–36 couvrent projection/path following et évitement; les diapositives 37–42 couvrent les forces de voisinage et Boids; les diapositives 43–49 traitent l'évolution et les réseaux; les diapositives 50–51 le suivi de leader. Les diapositives 52–62 regroupent des sujets de promotions distinctes, dont ml5.js obligatoire pour une consigne EMSI Marrakech. Cette exigence n'est pas présumée applicable à Casablanca G1. Le cours n'est pas une preuve de consigne de rendu propre à Casablanca G1.

Le wireframe PDF fait sept pages selon sa structure interne. Le poste ne dispose pas d'un moteur PDF/render ni d'un navigateur automatisé utilisable; son inspection visuelle page par page reste à effectuer sur une machine équipée. Le texte du README et de la documentation Phase 14.3 a été relu. Le projet a 133 tests avant le lot 1; l'état Git au début de cette tâche était `main`, sans commit, sans distant et avec les fichiers du projet non suivis.

## Découpage des lots et critères d'acceptation

Statuts : **terminé et testé** signifie logique, interface, test et documentation présents; **existant à vérifier** signifie une partie correspondante est déjà dans le dépôt mais doit être auditée pour le périmètre Ultimate; **à faire** signifie non vérifié/absent à ce stade. Une fonctionnalité n'est pas réputée terminée sur la seule présence d'une classe ou d'un bouton.

### Lot 1 — Advanced Steering AI (17–24)

| # | Fonction | État initial observé | Critère d'acceptation et preuve |
|---|---|---|---|
| 17 | Décisions IA en direct | Terminé et testé | Panneau suit une IA et présente une décision issue du planificateur/path follower courant; tests de diagnostic et navigation du panneau. |
| 18 | Vecteurs des forces | Terminé et testé | Vecteurs SVG du plan X/Z, forces individuelles/pondérées et résultante; chaque entrée correspond aux objets calculés et la résultante reste ≤ `maxForce`; tests du calcul et du rendu de données. |
| 19 | Dépassement intelligent | Existe dans `OvertakingPlanner` | Détection en projection de piste, vérification des deux voies, changement graduel et retour; scénarios sûrs/bloqués testés. |
| 20 | Défense adaptative | Terminé et testé | Réglage arcade optionnel mémorise un poursuivant et conserve un décalage si la voie est dégagée; tests du maintien de côté et reset de menace. |
| 21 | Gestion des virages | Existe dans `PathFollowing` | La courbure anticipée réduit progressivement la vitesse cible; test qu'un virage impose une cible inférieure à la ligne droite. |
| 22 | Personnalités IA | Terminé et testé | Profils prudent/équilibré/agressif changent vitesse, portée tactique et poids; maxSpeed/maxForce sont aussi réglables; reset et limites testés. |
| 23 | BehaviorManager dynamique | Terminé et testé | Course permet activation, poids, maxSpeed/maxForce et paramètres des quatre comportements; reset pédagogique; aucune priorité n'est annoncée car le calcul reste une somme pondérée plafonnée. |
| 24 | Mode professeur | Terminé et testé | Explications basées sur les mesures planificateur/follower et vues de forces; textes descriptifs, sans attribution d'intention cachée; contrôleurs non instrumentés signalés. |

### Lot 2 — Neural AI Research (25–32)

| # | Fonction | État initial observé | Critère d'acceptation et preuve |
|---|---|---|---|
| 25 | Architecture du réseau | Terminée et testée | Diagramme SVG tire la taille des couches du modèle actif, affiche la provenance; import/configuration invalides rejetés; dimensions 7-16-16-2 contrôlées. |
| 26 | Activations | Terminée et testée | Callback opt-in montre les activations réellement calculées dans les deux adapters sans muter les paramètres; tests vérifient dimensions et sorties identiques. |
| 27 | Steering vs Neural contrôlé | Terminée et testée | Manches arcade appariées par circuit/physique, graines enregistrées et toutes positions tournées; comparaison tenue séparée des validations historiques. |
| 28 | Replay comparatif synchronisé | Terminée et testée | Relecture échantillonnée d'une manche enregistrée, comparaison simultanée de deux pilotes, timeline, pause, avance/recul et export versionné JSON; pas de promesse de re-simulation déterministe. |
| 29 | Courbes de fitness | Terminée et testée | Choix entre runs expérimentaux de la session et CSV historiques A/B/C; choix d'une graine ou moyenne; parseur testé avec schémas et citations source, absence de données affichée comme telle. |
| 30 | Généralisation | Terminée et testée | Option compare circuit connu, held-out et utilisateur; résultat porte sa catégorie et sa provenance, et l'évaluation n'entraîne ni n'adapte les poids. |
| 31 | Analyse d'échecs | Terminée et testée | Compteurs collision/sortie mesurés et projetés vers segments voisins à partir du replay; le rapport marque la cause inconnue, sans diagnostic causal. |
| 32 | Rapport scientifique exportable | Terminée et testée | Exports JSON et CSV versionnés contiennent résultats arcade, circuits, manches, seed, mesures, provenance/architecture, protocoles, historique expérimental observé et limites; validations rejettent le mélange avec l'historique. |

### Lot 3 — Advanced Gameplay (1–8)

| # | Fonction | État initial observé | Critère d'acceptation et preuve |
|---|---|---|---|
| 01 | Tour de formation | Terminée et testée | Tous les pilotes bouclent un tour autonome à vitesse limitée; la télémétrie formation est remise à zéro, la grille est reconstituée sans superposition, puis compte à rebours; délai de secours borné. |
| 02 | Boîte séquentielle | Terminée et testée | 8 rapports, régime et sélection auto/manuelle agissent sur accélération arcade; commande manuelle et impulsion sonore sont raccordées au HUD. |
| 03 | DRS | Terminée et testée | Zone droite dérivée de la géométrie réelle, demande seulement active avec rival à ≤1 s, réduction du drag, indication HUD et volet animé; tests zone/hors-zone. |
| 04 | ERS | Terminée et testée | Charge régénérée en freinant et dépensée au déploiement; le multiplicateur d'accélération est borné et le HUD montre la charge. |
| 05 | Gommes | Terminée et testée | Soft/Medium/Hard ont adhérence, usure/durabilité et fenêtre thermique distinctes; choix de la prochaine gomme aux stands. |
| 06 | Usure/température | Terminée et testée | Usure/température évoluent par pas fixe sous vitesse, freinage et braquage, puis modifient l'adhérence arcade; reset/réparation contrôlés. |
| 07 | Pit stop | Terminée et testée | Une voie arcade tracée relie entrée, boîte, sortie et merge; commande auto limitée à 12 m/s, arrêt de 3 s, changement de gomme, réparation et sortie. La voie est provisoire autour de la position d'entrée, non une infrastructure préconstruite du circuit. |
| 08 | Dégâts | Terminée et testée | Impacts véhicule/bordure augmentent un dommage plafonné qui réduit vitesse/adhérence; réparation accessible par service stand et indicateur HUD. |

### Lot 4 — Graphics and Immersion (9–16)

| # | Fonction | État initial observé | Critère d'acceptation et preuve |
|---|---|---|---|
| 09 | Jour/nuit | Éclairage statique existant | Presets jour/coucher/nuit agissent sur lumière et ciel, passage progressif testable. |
| 10 | Météo | À faire | Sec/pluie/humide transitionnent; état de surface ne touche que la physique arcade et est visible. |
| 11 | Reflets/éclairage | Matériaux Three.js existants | Paramètres rendus dépendent des presets; fallback performance et nettoyage testés. |
| 12 | Particules | À faire | Pools bornés de fumée/poussière/eau réagissent aux événements réels et disposent au nettoyage. |
| 13 | Drapeaux | À faire | Vert, jaune, bleu, damier déclenchés par conditions documentées et appliquent des règles/actions définies. |
| 14 | Public/ambiance | Tribunes et audio de base existants | Animation et réponse audio reliées à proximité/événement; densité optionnelle n'affecte pas simulation. |
| 15 | Caméras TV | Modes de caméra course existants | Caméras placées aux pistes et sélection sur action réelle, transitions/reset testés. |
| 16 | Mode photo | Caméras libres non vérifiées | Entrée/sortie, orbit/zoom, HUD masquable, capture image réelle et restauration d'état. |

### Lot 5 — Professional Game Edition (33–40)

| # | Fonction | État initial observé | Critère d'acceptation et preuve |
|---|---|---|---|
| 33 | Championnat | À faire | Calendrier multi-pistes, attribution de points configurée, persistance versionnée et classement recalculable depuis les manches. |
| 34 | Profil pilote | Livrée/préférences déjà persistées | Nom/profil local, livrée et préférences restaurés; aucune inscription requise. |
| 35 | Historique | À faire | Chaque course terminée stocke date/config/télémétrie et peut être relue sans muter le résultat initial. |
| 36 | Records | À faire | Records séparés circuit/mode, règle de validation affichée, sauvegarde atomique et test d'amélioration. |
| 37 | Replay complet | À faire | Format versionné, cap de stockage, timeline, véhicule/caméra et événements; replay issu d'une course enregistrée. |
| 38 | Tutoriel | À faire | Étapes contrôlent les actions (accélérer/freiner/tourner/caméra/IA); progression validée par événements d'entrée réels. |
| 39 | Démonstration professeur | À faire | Parcours guidé de 3 minutes, séquence steering/forces/course/réseau/évolution/généralisation et données sourcées. |
| 40 | Rapport de conformité | Documentation seulement | Écran relie notions, diapositives, code, tests et démonstrations; distingue prouvé, absent et consignes d'autres groupes. |

## Ordre d'exécution

1. Terminer et valider le lot 1. Tests de RaceController, forces, défense, profiles, contrôles live, navigation et nettoyage; `npm.cmd test`, `npm.cmd run build`, documentation.
2. Lot 2 terminé et testé. Les courbes historiques sont lues depuis les CSV existants (A/B/C) et non recalculées; replay borné exporte les poses arcade enregistrées.
3. Lot 3 terminé et testé dans les seules classes de jeu `GameCar`/`GameVehicleDynamics`/`RaceWorld`; l'option peut rester désactivée et n'est jamais importée par la physique scientifique.
4. Réaliser le lot 4 avec budgets de particules/ombres/décors et tests sans effets.
5. Réaliser le lot 5 sur des primitives de persistance versionnées, sans compte distant.
6. Après chaque lot : vérifier les routes et les nettoyages, tests, build, doc et empreintes des fichiers protégés. Faire un contrôle Chrome/FPS seulement si un navigateur/matériel est effectivement accessible.

## État de cette livraison

Les lots 1 (fonctionnalités 17–24), 2 (25–32) et 3 (1–8) sont implémentés et testés par `npm.cmd test` et `npm.cmd run build`. Les lots 4–5 restent planifiés; les statuts « à faire » et « existant à vérifier » ne sont pas des promesses d'implémentation. Aucun entraînement long ou test de production n'est autorisé par cette feuille de route.

## Ultimate Edition LOT 4 status update (2026-11-05)

Features 09-16 are implemented in the arcade race presentation and documented in `docs/ultimate-edition-lot4-visual-immersion.md`. The complete test suite exposed a camera-cycle regression because TV camera was added to the existing four-mode cycle. It is corrected: the legacy chase/trackside/cockpit/overview cycle remains intact, and TV mode has a dedicated HUD action. LOT 4 passed the full project test suite and production build. LOT 5 is in progress; see the LOT 5 status update below.

## LOT 5 status update (2026-11-05)

The local career foundation now implements and tests local profile persistence, championship scoring from recorded races, completed-race history, local best-lap records and bounded sampled arcade replay persistence/export/playback. A keyboard tutorial is connected to observed keydown actions. Features 37-40 are not fully complete: replay is 2 Hz pose sampling rather than complete replay fidelity; tutorial coverage is limited; the professor demonstration is a manual presenter checklist rather than a timed automated sequence; and the compliance view is an indicative map, not a group-specific academic ruling. See `docs/ultimate-edition-lot5-career.md`.

## Matrice finale de statut (2026-11-05)

Cette matrice supersède les statuts initiaux de la feuille de route ci-dessus. « Implémenté/testé » désigne logique, UI, tests automatisés et documentation; cela ne signifie pas validation visuelle navigateur.

| # | Fonction | Statut actuel | Preuve / limite |
|---:|---|---|---|
| 01 | Tour de formation | Implémenté/testé | RaceDirector, grille et tests du lot 3. |
| 02 | Boîte de vitesses | Implémenté/testé | Mécanique arcade auto/manuelle, HUD/audio et tests du lot 3. |
| 03 | DRS | Implémenté/testé | Zones géométriques, condition d'écart, effet arcade et tests. |
| 04 | ERS | Implémenté/testé | Recharge/déploiement arcade, HUD et tests. |
| 05 | Gommes | Implémenté/testé | Trois composés, choix au stand et tests. |
| 06 | Usure/température | Implémenté/testé | Évolution au pas fixe et impact d'adhérence arcade. |
| 07 | Pit stop | Implémenté/testé | Itinéraire provisoire, service et fusion sûre; limites documentées. |
| 08 | Dégâts | Implémenté/testé | Impacts mesurés, pénalité arcade et réparation stand. |
| 09 | Jour/nuit | Implémenté/testé | Transitions jour/coucher/nuit et intégration lumière/ciel. |
| 10 | Météo | Implémenté, visuel uniquement | Sec/humide/pluie; aucune adhérence météo ajoutée. |
| 11 | Reflets/éclairage | Implémenté/testé | Matériau d'asphalte et éclairage/fog adaptés aux presets. |
| 12 | Particules | Implémenté/testé | Pools bornés événements/pluie, nettoyage GPU. |
| 13 | Drapeaux | Implémenté/testé | Jaune/bleu/damier issus de compteurs et règles observées; vert normal. |
| 14 | Public/ambiance | Implémenté/testé | Foule instanciée animée et tonalité procédurale. |
| 15 | Caméras TV | Implémenté/testé | Positions fixes, coupes temporisées sur leader; pas de détection d'action cinématique. |
| 16 | Mode photo | Implémenté/testé | Orbite/zoom, HUD masquable et capture canvas; navigateur non vérifié. |
| 17 | Décisions IA | Implémenté/testé | Décision observée sur contrôleurs steering instrumentés. |
| 18 | Forces Steering | Implémenté/testé | Forces réelles pondérées et résultante bornée. |
| 19 | Dépassement intelligent | Implémenté/testé | Planificateur arcade et scénarios voie libre/bloquée. |
| 20 | Défense adaptative | Implémenté/testé | Défense conditionnelle du contrôleur arcade. |
| 21 | Gestion des virages | Implémenté/testé | Anticipation de courbure via PathFollowing. |
| 22 | Personnalités IA | Implémenté/testé | Profils modifiant des paramètres actifs. |
| 23 | BehaviorManager dynamique | Implémenté/testé | Réglages live sans priorité fictive. |
| 24 | Mode professeur | Implémenté/testé | Explications dérivées des calculs instrumentés. |
| 25 | Architecture réseau | Implémenté/testé | Inspecteur du modèle actif et provenance. |
| 26 | Activations | Implémenté/testé | Activations réelles, visualisation opt-in. |
| 27 | Steering vs Neural | Implémenté/testé | Protocole apparié arcade, seeds/positions consignées. |
| 28 | Replay comparatif | Implémenté/testé | Replay de poses échantillonnées; pas de resimulation déterministe. |
| 29 | Courbes fitness | Implémenté/testé | CSV historiques/sessions, aucune donnée synthétique. |
| 30 | Généralisation | Implémenté/testé | Connus/held-out/utilisateur séparés des résultats scientifiques. |
| 31 | Analyse échecs | Implémenté/testé | Incidents mesurés, cause non inférée. |
| 32 | Rapport scientifique | Implémenté/testé | Exports JSON/CSV versionnés et provenance. |
| 33 | Championnat | Implémenté/testé | 3 manches locales et points depuis courses enregistrées. |
| 34 | Profil pilote | Implémenté/testé | Nom/livrée/préférences locales sans compte. |
| 35 | Historique courses | Implémenté/testé | Classement et métriques à la fin d'une course arcade. |
| 36 | Records | Implémenté/testé | Meilleurs tours locaux par circuit/mode depuis historique sauvegardé. |
| 37 | Replay complet | Partiel | Replay de poses 2 Hz, 1800 images max, deux replays conservés; pas de caméra/résimulation ni capture chaque frame. |
| 38 | Tutoriel interactif | Partiel | Accélérer/freiner/direction/caméra/pause détectés; mécaniques arcade et IA non enseignées. |
| 39 | Démonstration professeur | Partiel | Guide manuel avec objectif 3 min; aucun déroulé automatique synchronisé. |
| 40 | Rapport conformité | Partiel | Écran de correspondance et limites; aucune conclusion officielle Casablanca G1. |

## Validation finale effectuée

- `npm.cmd test`: 169 tests réussis, 26 fichiers.
- `npm.cmd run build`: réussi. Vite signale toujours le chunk Three.js de 502.78 kB minifié.
- Les fichiers publics A/B/C gardent leurs empreintes SHA-256 de référence (publiées dans `docs/ultimate-edition-lot5-career.md`).
- Aucun entraînement n'a été lancé et aucun résultat scientifique n'a été écrit.
- Validation Chrome, FPS et essai matériel audio/haptique non effectués: le workflow `node_repl` requis par le skill Computer Use n'est pas disponible dans les outils de cette session.

## LOT 5.1 status update — 2026-11-05

This update supersedes the earlier partial entries for features 37–40 in the matrix above. Features 01–36 retain the previously validated statuses in the 40-feature matrix. The detailed proof, pedagogical table and manual checklist are in [`ultimate-edition-lot5-1.md`](ultimate-edition-lot5-1.md).

| # | Feature | LOT 5.1 status | Evidence and limits |
|---:|---|---|---|
| 37 | Replay professional | Implemented and unit-tested | Version 2 sampled pose recording, bounded/decimated storage, interpolation, timeline, speed, camera/follow-car selection, events, JSON import/export, v1 compatibility, explicit non-reconstruction of missing data. Browser playback and long-session memory behavior remain manual checks. |
| 38 | Interactive tutorial | Implemented and unit-tested | 18 persisted steps across race, Steering Academy, Circuit Studio and Neural Racing Lab. Gates require non-zero input, observed mechanic/telemetry change, validated circuit save or real network inspection. Progress can resume or reset. Full browser walkthrough remains manual. |
| 39 | Professor demo | Implemented and unit-tested | Eight-step 180-second timeline, next/previous, pause/resume, exit and automated routes to Academy, arcade race with coach, Neural Racing Lab and AI Lab. Comparison execution and interpretation require presenter action; no training or results are fabricated. Browser transition timing remains manual. |
| 40 | Pedagogical conformance | Implemented and unit-tested | In-app table maps course notions to slides, source/functions, tests, demos and limitations. Slides tied to other cohorts are labelled and excluded as Casablanca G1 requirements. No official conformity claim is made. |

LOT 5.1 verification: `npm.cmd test` passes 179 tests across 27 files; `npm.cmd run build` succeeds. No training was run. The prior SHA-256 baseline for the 172 result files is recorded in Phase 14.2/14.3; the three public A/B/C hashes are checked against that baseline in the LOT 5.1 report. Browser visual validation was unavailable, so the manual checklist remains outstanding.