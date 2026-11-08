# Modification 09 — classement et audio

## Classement : diagnostic et correction

La source de vérité de progression est désormais `RaceTiming` : il valide le franchissement de la ligne dans le bon sens et dans la largeur de piste, exige au moins 90 % de la longueur de parcours entre deux passages, rejette les sauts de projection incompatibles avec le déplacement physique, et conserve les tours validés ainsi que la distance parcourue depuis la ligne. Le classement en direct utilise cette progression; les pilotes déjà arrivés restent classés selon leur temps de franchissement mesuré.

Le défaut reproductible était un défaut de classement en direct à la ligne de départ. Les voitures encore sur la grille ont une projection brute proche de la fin du circuit. Lorsqu'une voiture franchissait la ligne, sa projection revenait près de zéro : le tri sur cette projection brute pouvait alors placer les voitures sur la grille devant elle. `RaceTiming` publie maintenant une progression continue relative à la grille avant le départ, puis fondée sur les tours validés et la distance post-franchissement. La progression post-ligne de la première frame est conservée. `RaceLeaderboard` départage les arrivées par leur temps réel et utilise un ordre stable par identifiant en cas d'égalité exacte.

L'audit n'a pas confirmé de défaut dans le tri final des pilotes ayant terminé : celui-ci utilisait déjà `finishTime`. Il est conservé, rendu explicitement stable aux égalités et présenté dans l'écran de résultats avec les pilotes non terminés séparés. Pour les pilotes encore en course, les tours en retard apparaissent comme un écart en tours; les temps d'arrivée ne sont pas fabriqués. Les circuits personnalisés suivent la même projection le long de leur chemin validé. Les sessions Steering Lab et Neural Lab utilisent ce classement arcade, mais la fin d'une session laboratoire ne sauvegarde pas une course ni des points de championnat.

## Scénarios de classement

`tests/race-ranking-validation.test.js` couvre 12 cas déterministes : franchissement depuis la grille, joueur troisième, dépassement avant la ligne, arrivées dans la même frame ordonnées par temps interpolé, retard d'un tour, saut de projection invalide, circuit généré personnalisé, stabilité après arrivée, égalité déterministe, abandon sans temps d'arrivée inventé, cohérence avec les points carrière et champs de compatibilité.

## Audio

Le projet réutilise un seul `AudioManager` global; aucun gestionnaire parallèle n'a été ajouté. Le graphe Web Audio persistant expose les canaux Master, moteur, effets, ambiance, musique et interface. L'audio est initialisé après interaction utilisateur et reste facultatif lorsque Web Audio est absent ou refusé par le navigateur. Les préférences sont conservées dans `localStorage` sous `neurodrive-audio`.

Le moteur procédural réagit à la vitesse, aux commandes, au régime disponible et à la proximité d'une voiture. La voiture suivie par la caméra fournit le moteur entendu. Les effets sont liés aux transitions réelles observées pendant la simulation : départ, changement de rapport, DRS, ERS, tour, dernier tour, arrivée, stands, collision, sortie de piste et victoire; les effets répétitifs ont des délais de réarmement. Une ambiance de circuit est synthétisée à faible niveau. La musique de menu, garage, écrans de modes et podium est une séquence harmonique générée par oscillateurs Web Audio, sans fichier commercial ou asset tiers.

Les réglages audio comprennent activation, Master, moteur, effets, ambiance, musique et interface. Pause, sortie de session, retour au menu et destruction arrêtent ou suspendent les sources selon le cycle de session. Les tests audio vérifient l'absence d'API, l'unicité des contextes par gestionnaire, les volumes persistants, les délais d'événement, le suivi du moteur, la pause et le nettoyage.

## Fichiers concernés

- `src/game/RaceTiming.js` — progression validée et continue.
- `src/game/RaceLeaderboard.js` — ordre des arrivées stable et classement live.
- `src/game/RaceMinimap.js` — progression et écarts en mètres/tours.
- `src/game/RaceWorld.js` — progression validée exposée dans la télémétrie.
- `src/game/RaceSession.js` — affichage du classement, résultats, événements audio et voiture audio suivie.
- `src/game/AudioManager.js` — graph Web Audio partagé, musique/ambiance procédurales, catégories et événements.
- `src/main.js` — commandes UI audio, scènes et volumes, notamment musique.
- `tests/race-ranking-validation.test.js`, `tests/phase14-audio-haptics.test.js` — régressions de classement et audio.

## Validation et limites

- `npm.cmd test` : 33 fichiers, 230 tests réussis.
- `npm.cmd run build` : réussi. Vite signale le chunk Three.js de 507,79 kB minifié (127,44 kB gzip); c'est un avertissement de taille, pas une mesure de FPS.
- Manifeste `docs/ultimate-edition-lot5-1-integrity.csv` : 175 entrées vérifiées, 0 manquante, 0 empreinte modifiée.
- Aucun entraînement, poids de modèle, résultat scientifique ou protocole n'a été modifié intentionnellement.
- La validation réelle dans Chrome n'a pas été réalisée dans cette session : l'accès navigateur n'est pas disponible. Les tests audio sont automatisés et utilisent une API simulée; ils ne prouvent pas le rendu sonore sur matériel réel.

### Checklist manuelle Chrome

1. Lancer une course et vérifier la position avant/après le premier franchissement de la ligne, puis lors d'un dépassement.
2. Vérifier que le classement final ne change pas une fois chaque voiture arrivée; vérifier un abandon et un pilote doublé.
3. Refaire les vérifications sur un circuit personnalisé fermé et valide.
4. Autoriser l'audio après interaction, écouter le moteur en poursuite puis en changeant de voiture suivie, et tester les événements de départ, rapport, collision, tour et arrivée.
5. Modifier chaque volume et l'activation audio dans Réglages, recharger la page et vérifier leur persistance.
6. Mettre en pause, reprendre, revenir au menu puis relancer une course; vérifier qu'aucun son ne continue depuis la session précédente.

