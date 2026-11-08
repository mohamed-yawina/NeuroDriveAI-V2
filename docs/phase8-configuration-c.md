# Phase 8 — Configuration C : entraînement et validation terminés

## Protocole

Configuration C conserve le protocole multi-circuits de phase 7 et utilise 250 générations, 16 individus, 6 élites, les graines 2026/2027/2028 et les circuits `original`, `technical` et `fast-oval`. L’architecture est 7-16-16-2; mutation 0,08, sigma 0,12, tournoi de trois, sans croisement. Chaque candidat est évalué sur les trois circuits avec les scénarios appariés de la génération, selon la formule de graine consignée dans les résultats. La fonction de récompense, la fitness, la physique et les paramètres n’ont pas été modifiés.

La validation indépendante utilise la graine 731001, 30 scénarios par réseau et par circuit, un pas de 1/30 s et une limite de 60 s par épisode. A, B, C et Steering partagent les mêmes scénarios par circuit. Les réseaux sont gelés pendant l’évaluation. Le circuit `phase8-chicane-test` reste réservé au test final; ses résultats n’ont servi ni à l’entraînement ni au choix du modèle.

## Reprise déterministe de la graine 2028

Le checkpoint initial à la génération 94 ne contenait ni la population complète ni l’état interne du générateur aléatoire; il ne permettait donc pas une continuation directe. La reprise a reconstruit le trainer avec la graine 2028 et les paramètres d’origine, puis a rejoué les générations 1 à 94. Les 94 lignes historiques ont été comparées champ par champ. Le meilleur réseau, sa fitness 121,8424, sa génération de découverte 90, les 1 504 évaluations de candidats, les 4 512 épisodes physiques ainsi que l’ordre et les conditions initiales des 4 512 appels de scénarios correspondaient exactement. La continuation a alors repris à la génération 95.

Les graines 2026 et 2027 n’ont pas été relancées. Le rejeu et la continuation ont été enregistrés dans un nouveau dossier de résultats; les artefacts partiels d’origine, l’archive de l’interruption à 57 générations et la sauvegarde préreprise restent conservés. Les checkpoints complets versionnés comprennent la population, l’état RNG, le meilleur réseau, les compteurs, l’historique et les paramètres; ils sont écrits atomiquement tous les cinq paliers. Les empreintes des artefacts historiques A/B n’ont pas changé.

## Résultats d’entraînement

Chaque graine C représente 4 000 évaluations de candidats et 12 000 épisodes physiques (trois circuits par candidat). Les temps ci-dessous proviennent des champs enregistrés lors des entraînements; la valeur 2028 inclut la reconstruction exacte des 94 générations et la continuation.

| Graine | Meilleure fitness (génération) | Moyenne de fitness, génération 250 | Épisodes physiques | Temps enregistré |
|---:|---:|---:|---:|---:|
| 2026 | 130,28 (232) | 107,79 | 12 000 | 26 223,4 s |
| 2027 | 130,89 (128) | 123,59 | 12 000 | 1 622,4 s |
| 2028 | 130,90 (174) | 118,04 | 12 000 | 29 684,2 s |
| **Moyenne C** | **130,69 ± 0,36** | **116,47 ± 8,02** | **36 000** | — |

Le compteur mural de la reprise 2028 a inclus une suspension de la machine pendant la nuit du 2 au 3 novembre; il ne représente donc pas le temps CPU actif. Le temps CPU final n’a pas été capturé après la sortie du processus. Les temps muraux des graines ne doivent pas être comparés comme mesures de performance matérielle sans cette réserve.

## Validation indépendante A/B/C

Chaque configuration comprend 90 épisodes par circuit (30 par graine). Les temps au tour sont calculés uniquement sur les épisodes réussis. Les écarts-types entre graines sont descriptifs (n=3).

| Circuit | Steering | A : tours / 90 | B : tours / 90 | C : tours / 90 | C : progression moyenne | C : temps au tour réussi | C : sorties moyennes / épisode | C : récompense moyenne |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Original | 30/30 | 41/90 | 88/90 | **90/90** | 705,25 m | 21,30 s | 0,00 | 890,50 |
| Technique | 30/30 | 38/90 | 69/90 | **87/90** | 574,40 m | 20,45 s | 0,09 | 751,27 |
| Fast oval | 30/30 | 39/90 | 86/90 | **90/90** | 753,99 m | 22,25 s | 0,00 | 939,77 |

Détail des tours C par graine : original 30/30, 30/30, 30/30; technique 29/30, 28/30, 30/30; fast oval 30/30 pour les trois graines. Sur les circuits connus, C termine 267/270 essais (98,9 %), B 243/270 (90,0 %) et A 118/270 (43,7 %). Steering termine 90/90 sur ces scénarios. Ces comparaisons restent conditionnelles aux trois graines et aux scénarios évalués.

## Test final sur le circuit inédit

Le test reprend exactement les 30 scénarios déjà utilisés pour A/B sur `phase8-chicane-test`; aucun poids n’a changé pendant l’évaluation.

| Contrôleur / modèle | Tours terminés | Progression moyenne | Temps au tour réussi | Sorties / épisode | Temps hors piste / épisode |
|---|---:|---:|---:|---:|---:|
| Steering | 30/30 | 707,4 m | 23,38 s | 4,00 | 5,64 s |
| A, trois graines | 33/90 | 426,5 m | 35,01 s | 0,94 | 2,11 s |
| B, trois graines | 57/90 | 580,3 m | 30,10 s | 0,72 | 1,49 s |
| C, trois graines | **60/90** | 575,2 m | 23,08 s* | 0,68 | 2,05 s |

Détail C : graine 2026 = 0/30 (311,2 m de progression moyenne); graine 2027 = 30/30 (707,2 m); graine 2028 = 30/30 (707,2 m). *Temps moyen conditionnel aux 60 épisodes réussis. La réussite totale C est meilleure que celle de A et proche de B dans cet échantillon, mais l’échec complet de la graine 2026 montre une variabilité intergraines marquée. Ce résultat inédit n’a pas servi à choisir les modèles et ne prouve pas une généralisation universelle.

## Artefacts

Les résultats complets, modèles gelés, checkpoints et exports sont dans [`results/phase8-c-recovered-resume-20261102-2231/`](../results/phase8-c-recovered-resume-20261102-2231/). Les artefacts C partiels préexistants restent dans `results/phase8-c/` et ne doivent pas être confondus avec le jeu achevé.

- `training.json`, `generation-statistics.csv` : trois entraînements et statistiques par génération.
- `models/seed-2026.json`, `seed-2027.json`, `seed-2028.json` : meilleurs réseaux de C.
- `replay-validation.json`, `completion-manifest.json` : preuve du rejeu exact et de l’achèvement.
- `validation-all.json`, `validation-all.csv` : épisodes détaillés de validation A/B/C et Steering.
- `comparison-a-b-c.json` : agrégats par circuit, configuration et graine.
- `generation-statistics-a-b-c.csv/.json` et `generation-circuit-statistics-a-b-c.csv` : comparaisons d’entraînement.
- `held-out-final-a-b-c.json/.csv` : test inédit apparié A/B/C et Steering.

La validation comporte 30 scénarios par réseau et circuit, et seulement trois graines. Les scénarios au sein d’un circuit et les mesures d’un même réseau sur plusieurs circuits ne sont pas indépendants; les écarts-types intergraines sont descriptifs. Les résultats ne permettent pas d’affirmer une généralisation à d’autres circuits ou conditions.
