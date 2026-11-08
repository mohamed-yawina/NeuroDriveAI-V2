# Modification 17 — Circuit Studio Simple & Smart

## Résumé

Circuit Studio distingue maintenant les brouillons éditables des circuits réellement jouables. Un brouillon ouvert ou géométriquement invalide peut être sauvegardé et repris; il n'est jamais placé dans la bibliothèque que Course rapide et les laboratoires utilisent. Le lancement reste protégé par la validation géométrique du moteur.

## Validateur

Le contrôle de proximité estimait auparavant la distance le long de la piste par `écart d'indices × longueur totale / nombre d'échantillons`. Cette estimation supposait un espacement uniforme en longueur. Or la spline Catmull–Rom est échantillonnée uniformément en paramètre et ses échantillons n'ont pas tous la même longueur. Les paires proches de la fermeture ou situées sur une portion de courbure variable pouvaient donc être mal classées.

`CircuitValidator.js` calcule maintenant les distances cumulées réelles des segments échantillonnés et la distance cyclique entre leurs milieux. La détection des intersections de la ligne centrale et le contrôle de chevauchement des bandes de piste restent actifs. Les cinq modèles sont toujours passés dans le validateur géométrique réel avant d'être proposés. Les tests couvrent les modèles valides, une boucle fermée ordinaire et le rejet d'une auto-intersection. Le tracé exact de la capture signalée n'était pas fourni : la cause algorithmique est corrigée, mais la capture particulière n'a pas pu être rejouée.

## Création, correction et sauvegarde

- La page d'accueil conserve les trois parcours simples : choisir un modèle, dessiner, ou ouvrir Mes circuits.
- En dessin libre, cliquer sur le premier point après avoir posé au moins dix points ferme la boucle. Le bouton de fermeture reste disponible.
- **Sauvegarder** accepte les circuits incomplets et les écrit dans `neurodriveai.circuit-drafts.v1`, une clé séparée.
- Les brouillons apparaissent dans Mes circuits avec l'action Reprendre. Ils ne sont pas retournés par `CircuitLibrary.list()`, donc les sélecteurs de jeu ne peuvent pas les lancer.
- **Jouer / Tester F1** reste désactivé ou refusé tant que le circuit échoue à la validation.
- **Améliorer mon circuit** calcule une proposition conservatrice par lissage léger et fermeture de boucle. La proposition doit passer le validateur réel. Une comparaison avant/après est affichée; seule l'action explicite « Appliquer la correction » change le dessin. L'opération est annulable. Si aucune proposition sûre ne valide, le dessin n'est pas modifié et l'éditeur explique pourquoi.

## Intégration et protection

La validation et la conversion vers `TrackDefinition` restent celles de `CircuitFormat.js`; les modèles et les circuits utilisateurs jouables continuent donc d'alimenter le même `RaceWorld`. Aucun circuit prédéfini de remplacement n'est ajouté. Les circuits et résultats scientifiques historiques, les poids A/B/C et les protocoles n'ont pas été modifiés intentionnellement.

Fichiers principaux de cette modification :

- `src/circuits/CircuitValidator.js`
- `src/circuits/CircuitLibrary.js`
- `src/circuits/CircuitStudio.js`
- `src/circuits/CircuitImprovement.js`
- `src/style.css`
- `tests/circuit-studio.test.js`

Le dépôt comportait déjà des changements non commités des modifications 14 à 16 au début de ce travail. Ils ont été conservés; l'état Git n'est donc pas propre et la liste complète des fichiers modifiés inclut ces travaux antérieurs.

## Validation exécutée

- `npm.cmd test` : **267 tests réussis**, 35 fichiers de test.
- `npm.cmd run build` : réussi. Vite signale toujours le chunk Three.js de 509 kB au-dessus du seuil de 500 kB; la compilation aboutit.
- Manifeste SHA-256 `docs/ultimate-edition-lot5-1-integrity.csv` : **175/175 empreintes conformes**, aucune différence.
- Le test de simulation existant sauvegarde un circuit libre, le recharge, construit le `RaceWorld` exact, place six voitures et vérifie que les IA terminent trois tours.
- Aucun entraînement neuronal n'a été lancé.

## Limites et vérification manuelle Chrome

Chrome n'a pas été piloté dans cette session. La validation visuelle du flux de dessin et de la fenêtre d'aperçu de correction reste à faire. Vérifier :

1. Ouvrir Circuit Studio → Dessiner mon circuit; placer dix points puis cliquer sur le premier ou sur Fermer la boucle.
2. Sauvegarder un brouillon ouvert; revenir à Mes circuits et le reprendre. Vérifier qu'il n'apparaît pas dans Course rapide ni les laboratoires.
3. Choisir un modèle, cliquer sur Améliorer mon circuit, comparer les deux aperçus, annuler puis vérifier que le tracé est inchangé; refaire et appliquer, puis utiliser Annuler.
4. Corriger tout message bloquant, sauvegarder comme circuit jouable, puis le sélectionner dans Course rapide et vérifier la piste et la mini-carte.
5. Tester un vrai croisement pour confirmer qu'il reste bloqué.

Le lissage automatique n'est volontairement pas garanti de réparer chaque type d'erreur : il ne s'applique que si une proposition passe intégralement le validateur. Les erreurs de largeur, de grille ou d'intersection nécessitent parfois une correction manuelle.
