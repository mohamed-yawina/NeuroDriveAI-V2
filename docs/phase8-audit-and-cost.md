# Phase 8 — Audit préalable et budget expérimental

Date de l'audit : 2026-11-01. Aucun entraînement B ou C n'a été lancé.

## Audit du protocole phase 7

- Les trois circuits reçoivent chacun une évaluation par individu et par génération. Avec trois graines, le protocole A existant représente 50 × 8 × 3 circuits × 3 graines = **3 600 épisodes physiques** (1 200 par graine). Les candidats partagent les mêmes scénarios au sein d'une génération; la formule change ensuite le scénario d'une génération à l'autre.
- La fitness agrège la performance moyenne, la performance du circuit le plus faible, le taux de réussite et les sorties de piste. Les poids consignés sont 0,4 / 0,4 / 20 / 3; ils n'ont pas été changés.
- La sélection utilise un tournoi de trois candidats tirés avec remise. Il n'y a pas de croisement : un parent est copié puis muté. A conserve trois élites sur huit (37,5 %). La mutation par défaut touche 8 % des 434 paramètres; cela représente en moyenne **34,72 paramètres mutés par enfant**, avec un sigma gaussien de 0,12.
- Les artefacts phase 7 conservent le meilleur réseau final et les métriques de fitness par génération, mais pas les membres des populations, les parents ni les poids du meilleur réseau génération par génération. La diversité génétique intra-run n'est donc pas reconstructible. La distance RMS des paramètres des meilleurs modèles entre graines est de 0,408 à 0,422; elle indique une différence entre exécutions, pas la diversité des populations.
- L'équilibre inter-circuits est égal en nombre d'épisodes (un par circuit et par candidat). En revanche, chaque génération utilise un seul scénario par circuit, partagé par tous les candidats : les évaluations sont appariées, mais la diversité des scénarios d'une génération est limitée.

## Observations et activations

Le script `scripts/audit-phase7-training.js` reconstruit les états de départ d'entraînement et de validation, sans exécuter d'épisode. Le résultat est dans `results/phase8-phase7-audit.json`.

- Les observations d'entrée respectent les plages déclarées : cinq capteurs entre 0 et 1, vitesse normalisée entre 0 et 1, erreur d'orientation entre -1 et 1. Sur les départs examinés, les moyennes des capteurs vont approximativement de 0,21 à 0,84; celle de la vitesse est de 0,31 à 0,34; celle de l'erreur d'orientation est proche de zéro.
- Pour les réseaux finaux des graines 2026, 2027 et 2028, aucun neurone caché ou de sortie n'a dépassé |activation| = 0,95 sur ces observations de départ. C'est un signal contre une saturation initiale massive, pas une mesure des activations pendant les trajectoires : les traces intra-épisode n'existent pas dans les artefacts historiques.
- Les scénarios d'entraînement et de validation restent distincts (graines 731001 pour la validation, 907001 pour le test final historique). Les résultats du test historique ne doivent pas servir au réglage de phase 8.

## Estimation de coût

Mesure de calibration : 30 épisodes, 40 500 pas au total, soit 6 806 pas/s et 0,198 s/épisode sur cette machine. Les 30 épisodes ont chacun atteint la limite de 45 s simulées. Les temps ci-dessous extrapolent ce débit à 1 350 pas maximum par épisode; ils sont des budgets de planification, pas des durées garanties. Les épisodes précocement terminés réduiront le coût réel.

| Configuration | Épisodes d'entraînement | Pas au pire | Temps estimé d'entraînement | Validation appariée (270 épisodes) |
| --- | ---: | ---: | ---: | ---: |
| A — 50 × 8 × 3 circuits × 3 graines | 3 600 | 4 860 000 | ~11 min 54 s si relancée; les résultats phase 7 existent déjà | ~54 s |
| B — 100 × 16 × 3 circuits × 3 graines | 14 400 | 19 440 000 | ~47 min 36 s | ~54 s |
| C — 250 × 16 × 3 circuits × 3 graines | 36 000 | 48 600 000 | ~1 h 59 min | ~54 s |

La validation a utilisé les mêmes 30 scénarios par circuit pour chaque réseau (3 réseaux/graines × 3 circuits × 30 = 270 épisodes par configuration). Les 90 épisodes Steering associés sont partagés. Un quatrième circuit inédit a été ajouté séparément dans `Phase8HeldOutTrack.js`; il est évalué par un test verrouillé après la validation principale, jamais utilisé pour le choix des paramètres.

Après autorisation, la configuration B a réellement pris **2 031,1 s** pour 14 400 épisodes (33 min 51,1 s), soit environ 29 % moins que l'estimation de pire cas de 2 856 s. Les épisodes précoces hors piste ou bloqués ont raccourci le temps moyen; cette mesure réelle remplace l'estimation pour B. C n'a pas été exécutée.

## Décision avant exécution

Les configurations B et C restent non exécutées en application de la consigne. La phase 7 fournit déjà le point de comparaison A; une relance A n'est nécessaire que si ses paramètres sont modifiés. Le panneau de comparaison, les nouveaux entraînements et le rapport final avec résultats mesurés restent à produire après la décision sur les entraînements longs.
