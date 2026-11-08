# Phase 14.3 — Apex Edition

## P0 — Diagnostic et correction du lancement

Le bouton `AI LAB` appelait `launch({ lab: true })`. La session historique lisait ensuite `#menu-pilot` et `#menu-model`, sélecteurs supprimés du menu Racing Red; l’accès `.value` sur le résultat nul déclenchait l’erreur affichée. Le projet conserve un vrai sélecteur `#pilot-select` dans l’interface AI Lab intégrée, ainsi que le choix A/B/C désormais disponible dans Réglages.

Les factories de menu prennent maintenant les options à partir de contrôles présents : `#menu-track`, `#menu-laps` et `#pilot-select`. Le modèle AI Lab par défaut est A, artefact historique réel, et le réglage permet de choisir A/B/C. La course de menu utilise une factory dédiée avec valeurs de repli explicites si un contrôle de course manque; la navigation reste gérée par `SessionNavigation`. Circuit Studio utilise également ce modèle sélectionné pour sa préparation Neural.

Tests de non-régression : sélecteurs supprimés absents, lancement Race et AI Lab par `SessionNavigation`, nettoyage au retour, choix garage → circuits → course. La reproduction dans le navigateur n’a pas été possible dans cet environnement, voir les limites ci-dessous.

## Menu, showroom et garage

- L’auto-orbite déplace maintenant la caméra autour d’une monoplace fixe, donnant l’angle trois-quarts avant initial et un tour complet. Le glisser horizontal commande l’orbite; le zoom est borné à une distance de 8,5 à 20 unités.
- Le showroom reçoit un arrière-plan paddock/garage procédural, des éclairages de remplissage, une plateforme et un sol détaillé. Les ressources de l’ancienne voiture sont libérées quand la livrée change.
- Les vues avant, arrière, côté, dessus et trois-quarts restent disponibles; le bouton « Réinitialiser la caméra » restaure le trois-quarts avant.
- Les livrées continuent d’être sauvegardées et transmises à la monoplace du joueur. Le CTA du garage conduit maintenant d’abord à la sélection du circuit.
- Les mentions « Phase 14 », « Glisser / tourner » et « Molette / zoom » ont été retirées de l’interface visible. L’aide de manipulation est dans un panneau repliable des Réglages.

## Réglages connectés

- Audio : activation, volumes séparés et restauration passent par `AudioManager`.
- Graphismes : basse/moyenne/haute ajuste le pixel ratio et la résolution d’ombre; le contrôle Ombres active/désactive les shadow maps; Densité du décor change le nombre d’instances d’arbres, reliefs, barrières, vibreurs et tribunes. Ces réglages sont persistés et lus lors de la création des scènes. Le showroom les applique immédiatement.
- Effets : active/désactive le vignettage de vitesse et la secousse de collision de la course.
- Caméra : la vue par défaut s’applique à la poursuite de course; Sensibilité orbitale et Vitesse du zoom règlent le showroom.
- Commandes : les touches course sont listées. La reconfiguration des touches n’est pas proposée.
- Haptique : l’option s’active si une API compatible est détectée; l’impulsion de test requiert un clic volontaire. L’intensité et l’état sont restaurables.
- « Restaurer les paramètres par défaut » remet les valeurs audio, haptique, visuelles, caméra, modèle et livrée, et réapplique la qualité au showroom.

## Circuits

- L’asphalte utilise une texture de grain procédurale déterministe avec coordonnées UV; les dimensions de piste et les limites physiques restent les mêmes.
- Les panneaux 150/100/50 sont placés avant le point d’apex visuel de plus forte courbure détecté sur la trajectoire Catmull–Rom, aux distances d’arc indiquées, de chaque côté de la piste.
- Bordures, barrières et tribunes restent instanciées. Les feux 3D suivent le compte à rebours. Le même rendu s’applique aux pistes utilisateur compatibles.
- Ces éléments sont visuels; ni les waypoints, ni la largeur, ni les limites, ni les équations de physique n’ont été changés.

## Validation

- `npm.cmd test` : **133 tests réussis**, 21 fichiers. Couverture ajoutée pour le lancement, les transitions du garage, le showroom, la persistance des réglages, les commandes clavier, les trois circuits, les marqueurs de freinage et le nettoyage des ressources.
- `npm.cmd run build` : réussi. Vite signale toutefois `three.module` à **500,36 kB** (125,55 kB gzip), soit 0,36 kB au-dessus du seuil de 500 kB. Le seuil n’a pas été relevé pour faire disparaître l’avertissement.
- Les 172 JSON/CSV de résultats gardent la même empreinte agrégée SHA-256 avant/après les validations : `1D857FC6DB69E981BC03D0D2D82051E4076544C12C15F400999A81F7CA6B8BA0`. Les modèles A/B/C conservent les mêmes empreintes documentées dans [`phase14.2-validation-stabilisation.md`](phase14.2-validation-stabilisation.md), graines 2026/2027/2028 et architecture 7-16-16-2.
- Aucun entraînement de production n’a été lancé. `npm test` exécute néanmoins les tests déterministes courts déjà présents sur le `GeneticTrainer`.
- Le service Vite local a démarré; l’outil navigateur a échoué à deux reprises avec `browser access host is unavailable`. Aucun clic réel dans Chrome, aucune inspection visuelle et aucune mesure FPS ne sont revendiqués.
- Audio/haptique sont couverts par les tests à APIs simulées; pas de test sur haut-parleurs, téléphone ni manette.

## Checklist manuelle soutenance

1. Vérifier le menu Racing Red, l’angle trois-quarts avant, l’auto-orbite, le drag 360° et le zoom aux limites.
2. Ouvrir le garage; tester les cinq vues, chaque livrée, le reset caméra et la persistance après retour menu/redémarrage/course.
3. Tester les Réglages un par un : qualité, ombres, densité, effets, caméras, audio par canal, haptique si matériel présent, modèle par défaut et restauration globale.
4. Depuis le garage, choisir un circuit puis lancer. Essayer les trois circuits, vérifier feux HUD/portique, clavier, incidents, classement, tours et podium.
5. Revenir au menu et répéter deux cycles; vérifier l’absence de canvas, écouteurs, sons ou ressources résiduels.
6. Tester Steering Academy, Circuit Studio et Neural Racing Lab puis retour menu; ne lancer aucune commande d’entraînement.
7. Sur la machine de soutenance, mesurer FPS sur showroom, chaque circuit en course à six voitures, vue aérienne et podium, 60 s par scène après échauffement. Aucun chiffre de performance n’est fourni avant cette mesure.
