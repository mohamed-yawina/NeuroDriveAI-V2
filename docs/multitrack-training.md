# Phase 7 - Multi-circuit training

## Protocole

Execution reproductible : `npm run train:multitrack`. Le script conserve les artefacts precedents et cree des fichiers `phase7-*` distincts. Il charge les trois meilleurs reseaux single-track de phase 4, puis entraine trois nouveaux reseaux avec les memes graines de reseau: 2026, 2027 et 2028. L'architecture reste 7-16-16-2.

Les parametres de l'experience executee sont 50 generations, 8 individus et 3 elites. A chaque generation, chaque individu est physiquement evalue une fois sur chacun des trois circuits; cela fait 24 episodes physiques par generation et 1 200 par graine, soit 3 600 episodes d'entrainement. Tous les candidats d'une generation reçoivent les memes conditions par circuit. La graine des scenarios est derivee de la graine d'entrainement, de la generation et de l'indice de circuit. Les generations changent les positions, les orientations et les vitesses; les vitesses initiales sont choisies parmi 0, 7, 14 et 21 m/s, et le cap est perturbe de +/-10 degres.

Les positions d'entrainement sont echantillonnees sur l'arc continu Catmull-Rom, et non sur les memes interpolations de segments de waypoints que l'entrainement de phase 4. L'ensemble de validation utilise la graine 731001; le test final verrouille utilise la graine 907001. Chacun compte 30 scenarios par circuit et par modele, avec perturbation de cap de +/-15 degres. Ni validation ni test ne participent au score genetique. Le test final n'a pas servi a choisir ou ajuster de parametres.

Les trois circuits sont l'original (491.16 m de polyligne, 0.01279 rad/m de courbure proxy moyenne), le circuit technique (415.70 m, 0.01528 rad/m) et l'ovale rapide (525.75 m, 0.01195 rad/m). Les frontieres, capteurs et dynamiques existants sont reutilises. Les vitesses, capteurs et erreurs d'orientation sont normalises par les memes maxima physiques sur les trois pistes; les sept entrees restent bornees dans [0,1] ou [-1,1].

## Fitness agregée

Les termes et coefficients de `RewardCalculator` n'ont pas ete modifies. La fitness de selection a ete ajoutee au-dessus des episodes physiques pour comparer les circuits a echelle coherente:

- Performance d'un circuit = 65% de la recompense existante, bonus fixe de tour retire, normalisee par 100 m; plus 35% d'un score physique sur 100 combinant progression normalisee (30%), tour valide (35%), allure normalisee (20%) et fraction du temps sur piste (15%).
- Fitness candidat = 40% de la performance moyenne des circuits + 40% de sa performance sur le circuit le plus faible + 20 fois son taux de circuits termines - 3 fois le nombre moyen de sorties par distance normalisee de circuit.

La fraction de progression est plafonnee a 1 pour qu'un long trajet avant un tour valide n'obtienne pas un bonus illimite. La recompense de tour retiree avant normalisation evite que le bonus fixe favorise une piste plus courte. Les coefficients sont des choix initiaux explicites de fitness, distincts des poids de recompense historiques; ils n'ont pas ete ajustes a partir du test final.

## Resultats d'entrainement observes

| Graine | Meilleure fitness (generation) | Fitness moyenne generation 50 | Taux moyen de circuits termines dans la population generation 50 |
|---:|---:|---:|---:|
| 2026 | 111.15 (50) | 68.11 | 16.7% |
| 2027 | 37.10 (49) | 17.35 | 0.0% |
| 2028 | 79.10 (48) | 58.67 | 20.8% |

Ces scores sont des fitness phase 7 et ne sont pas numeriquement comparables aux recompenses phase 4 (1107.80 en moyenne), car l'unite et l'agregation ont change. L'ecart fort entre graines est un resultat important: deux graines produisent quelques reussites dans la population finale, une n'en produit aucune.

## Test final independant: Steering (C), single-track phase 4 (A), multi-track phase 7 (B)

Chaque case est basee sur 30 scenarios appariees par circuit et graine. Les taux individuels ont des intervalles Wilson a 95%; le JSON contient aussi progressions, temps au tour conditionnels aux tours reussis, sorties, temps hors piste, temps bloque, recompenses, ecarts-types et differences appariees. Les scenarios sont exactement les memes pour A, B et C.

| Circuit | Controleur / graine | Tours termines (IC Wilson 95%) | Progression signee moyenne (SD) | Temps au tour moyen (n reussites) | Sorties moyennes | Temps hors piste moyen | Recompense moyenne |
|---|---|---:|---:|---:|---:|---:|---:|
| Original | Steering | 30/30 (100%, 88.6-100%) | 721.11 m (143.23) | 23.45 s (30) | 1.60 | 0.78 s | 897.96 |
| Original | A: single 2026 | 29/30 (96.7%, 83.3-99.4%) | 707.74 m (178.80) | 23.71 s (29) | 0.07 | 0.14 s | 884.46 |
| Original | B: multi 2026 | 28/30 (93.3%, 78.7-98.2%) | 718.62 m (140.02) | 31.98 s (28) | 0 | 0 s | 895.36 |
| Original | A: single 2027 | 30/30 (100%, 88.6-100%) | 720.75 m (143.25) | 24.28 s (30) | 0 | 0 s | 906.46 |
| Original | B: multi 2027 | 0/30 (0%, 0-11.4%) | 238.13 m (131.69) | - | 0.83 | 2.97 s | 222.47 |
| Original | A: single 2028 | 30/30 (100%, 88.6-100%) | 721.36 m (143.18) | 24.11 s (30) | 0 | 0 s | 906.32 |
| Original | B: multi 2028 | 13/30 (43.3%, 27.4-60.8%) | 600.52 m (220.08) | 40.93 s (13) | 0.10 | 0.36 s | 670.48 |
| Technique | Steering | 30/30 (100%, 88.6-100%) | 607.77 m (121.29) | 20.10 s (30) | 4.13 | 5.39 s | 755.40 |
| Technique | A: single 2026 / 2027 / 2028 | 0/30 each (0-11.4%) | 231.17 / 247.43 / 173.33 m | - | 1.00 / 1.07 / 1.00 | 3.57 / 3.61 / 3.57 s | 216.05 / 228.85 / 158.61 |
| Technique | B: multi 2026 | 26/30 (86.7%, 70.3-94.7%) | 550.77 m (206.60) | 29.33 s (26) | 0.17 | 0.52 s | 710.30 |
| Technique | B: multi 2027 | 0/30 (0%, 0-11.4%) | 175.61 m (108.86) | - | 0.87 | 2.99 s | 158.55 |
| Technique | B: multi 2028 | 13/30 (43.3%, 27.4-60.8%) | 428.44 m (279.10) | 36.63 s (13) | 0.30 | 1.07 s | 490.24 |
| Ovale rapide | Steering | 30/30 (100%, 88.6-100%) | 770.08 m (154.70) | 24.55 s (30) | 2.13 | 2.36 s | 940.20 |
| Ovale rapide | A: single 2026 / 2027 / 2028 | 0/30 each (0-11.4%) | 366.13 / 370.80 / 315.89 m | - | 1.07 / 1.00 / 1.00 | 3.63 / 3.57 / 3.57 s | 352.18 / 358.68 / 302.87 |
| Ovale rapide | B: multi 2026 | 25/30 (83.3%, 66.4-92.7%) | 762.07 m (143.02) | 33.52 s (25) | 0 | 0 s | 921.22 |
| Ovale rapide | B: multi 2027 | 0/30 (0%, 0-11.4%) | 228.26 m (124.58) | - | 0.90 | 3.21 s | 211.47 |
| Ovale rapide | B: multi 2028 | 14/30 (46.7%, 30.2-63.9%) | 639.04 m (218.25) | 41.44 s (14) | 0.07 | 0.24 s | 707.93 |

Agreges sur les trois graines, les taux A sont 89/90 tours sur l'original et 0/90 sur chacune des variantes. Les taux B sont 41/90 sur l'original, 39/90 sur la piste technique et 39/90 sur l'ovale; Steering est a 90/90 sur chaque circuit. Ces agregats sont descriptifs: les trois reseaux issus des graines ne sont pas des observations independantes d'une population de reseaux, donc aucun IC naif a n=90 n'est rapporte. Le seed 2027 est a 0/30 sur chaque circuit et tire fortement les moyennes vers le bas.

## Comparaison avec les phases precedentes et limites

La phase 6 evaluait les anciens poids sur un autre jeu de scenarios: 85/90 sur le circuit original et 0/90 sur chaque variante. Le test final phase 7, graine scenario 907001, donne 89/90 et 0/90 pour les memes anciens reseaux. Ces valeurs ne sont pas une amelioration ou une regression mesurable directement: les scenarios independants sont differents. Dans les deux protocoles, les anciens reseaux restent specialises sur le circuit original.

Le multi-circuit produit une generalisation partielle et dependante de la graine: le reseau 2026 termine 26/30 tours techniques et 25/30 ovales, tandis que le reseau 2028 en termine 13/30 et 14/30, et que le reseau 2027 n'en termine aucun. Le temps au tour est souvent plus long que Steering et la variabilite entre graines est importante. La generalisation n'est donc pas resolue.

Validation et test modifient conjointement circuit, position, cap et vitesse; ils ne permettent pas d'attribuer causalement les echecs a une seule variable. Trente scenarios par reseau et circuit donnent des IC larges; les trois circuits sont des cas fixes, pas un echantillon de toutes les pistes. Les multiples mesures ne sont pas corrigees pour comparaisons multiples. Le jeu final est distinct de l'entrainement et de la validation et n'a pas ete utilise pour choisir les parametres. Voir les donnees brutes et differences appariees dans `results/phase7-multitrack-test.json` et les lignes d'episodes dans `results/phase7-multitrack-test.csv`.

## Artefacts et commandes

- `results/phase7-multitrack-training.json` et `phase7-multitrack-generation-statistics.csv`: generations, fitness, compteurs physiques et trois reseaux multi-circuits.
- `results/phase7-multitrack-validation.json` et `.csv`: evaluation independante, graine 731001.
- `results/phase7-multitrack-test.json` et `.csv`: test final verrouille, graine 907001.

Les fichiers phase 4 et phase 6 n'ont pas ete remplaces. Les repetitions peuvent etre lancees avec `npm run train:multitrack -- --generations=50 --population=8 --seeds=2026,2027,2028`; les graines de validation et de test peuvent etre specifiees avec `--validation-seed` et `--test-seed`.
