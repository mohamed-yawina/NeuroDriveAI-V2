# Guide de démonstration finale — 5 minutes

## Préparation

- Lancer `npm.cmd run dev`, ouvrir l’URL Vite et vérifier la console avant la présentation.
- Précharger le jeu et les modèles A/B/C. Choisir un circuit prédéfini connu pour éviter le délai d’un circuit personnalisé.
- Déverrouiller l’audio par une interaction si la musique est souhaitée; la présentation reste compréhensible sans son.
- Garder ce guide ouvert hors de la fenêtre du jeu. Le Mode Professeur intégré dure 180 secondes; la démonstration de cinq minutes ci-dessous ajoute une courte course et des transitions manuelles.

## Déroulé minuté et actions

| Temps | Action dans l’interface | À expliquer |
|---|---|---|
| 0:00–0:45 | Menu principal, présenter les entrées Course rapide et Laboratoires IA. | Un seul environnement F1 réunit le gameplay et les démonstrations. Les sessions arcade ne remplacent pas les protocoles scientifiques historiques. |
| 0:45–1:30 | Lancer Course rapide, accélérer, tourner, changer une caméra, puis revenir au menu. Si le chargement prend trop de temps, montrer le HUD déjà lancé. | Le moteur de course partage voitures, circuit, progression et rendu; le contrôle humain relève du mode arcade. |
| 1:30–2:30 | Ouvrir Steering Lab. Suivre une voiture Steering AI; montrer Path Following, puis les forces d’évitement/séparation quand elles sont présentes. Sélectionner une autre voiture si la cible suivie est humaine. | Les vecteurs viennent des diagnostics du contrôleur. Pursuit est conditionnel. Une absence de force signifie que le contrôleur ne l’expose pas ou que la contribution est inactive. |
| 2:30–3:30 | Ouvrir Neural Lab. Montrer un modèle réellement chargé, les observations, activations et sorties; changer la voiture suivie. | Le MLP est 7→16→16→2. Distinguer sortie réseau, adaptation arcade et mouvement. Ne pas interpréter cette course comme une mesure historique. |
| 3:30–4:30 | Ouvrir Mode Professeur et démarrer la chronologie; avancer jusqu’à une étape télémétrie/décision, afficher mesures puis pause/reprise. | La chronologie guidée totalise 180 secondes. Le parcours de cinq minutes emploie des transitions manuelles; il ne prétend pas que toute la chronologie de 180 s a été jouée ici. |
| 4:30–5:00 | Revenir à l’écran comparatif ou conclusion et quitter proprement. | Steering explicite des contributions; Neural infère des commandes à partir d’observations. Pour conclure scientifiquement, il faut les mêmes protocoles et conditions. |

## Script oral court

« NeuroDriveAI associe un jeu F1 arcade à des outils d’observation pédagogique. Dans Steering Lab, la voiture projette son état sur le chemin et combine des contributions calculées, comme le suivi de piste, l’évitement d’obstacles et la séparation. Le panneau ne doit montrer que les forces réellement publiées par le contrôleur.

Dans Neural Lab, un MLP historique reçoit sept observations, calcule deux couches cachées de seize neurones, puis deux sorties. Nous séparons les sorties brutes, leur adaptation au gameplay arcade et le mouvement observé. Les modèles A, B et C sont chargés sans entraînement pendant la démonstration.

La comparaison affichée est une observation arcade, pas une expérience contrôlée. Les résultats historiques restent dans leurs rapports et leurs protocoles. Le support de cours présente plusieurs de ces notions, mais les consignes officielles complètes de Casablanca G1 n’ont pas pu être vérifiées; je ne revendique donc pas de conformité officielle sur cette seule base. »

## Différences à souligner

- Steering : contributions explicites, inspectables et pondérées; les diagnostics expliquent une décision locale.
- Neural : calcul inférentiel appris; les sorties sont interprétables via les observations et activations, mais ne constituent pas une explication causale complète.
- La course arcade a une dynamique et un adaptateur distincts du moteur scientifique. Les chronos de cette démonstration ne se comparent pas aux résultats historiques.

## Plan de secours

- **WebGL échoue** : ne pas improviser une validation visuelle. Présenter les diagrammes et le code dans les documents d’architecture et de méthodologie; préciser que la démo navigateur n’est pas disponible.
- **Audio/autoplay échoue** : continuer sans audio; l’interaction et les valeurs restent la preuve de la démonstration.
- **Modèle ou course ne charge pas** : revenir au menu, utiliser le Mode Professeur préchargé; si celui-ci échoue aussi, montrer les tests et rapports, sans présenter des valeurs de remplacement comme mesures live.
- **Temps dépassé** : sauter les étapes de course ordinaire et passer directement à Steering Lab puis Neural Lab. Ne pas prétendre avoir complété le parcours intégré de 180 secondes.

## Contrôle final avant soutenance

Tester une fois le parcours complet en Chrome, confirmer que le modèle sélectionné et la voiture suivie correspondent, que le panneau ne montre pas de forces humaines fictives, que pause/reprise fonctionne, et que la console ne contient pas d’erreur. Les captures d’écran doivent être prises par l’équipe pendant cette vérification; aucune capture n’est fournie dans le dépôt actuellement.
