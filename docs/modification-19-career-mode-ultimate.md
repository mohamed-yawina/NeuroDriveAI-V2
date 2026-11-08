# Modification 19 — F1 Career Mode Ultimate

## Résumé

La Carrière locale s’appuie toujours sur `CareerStore`, le calendrier séquentiel et les résultats de `RaceSession`. L’interface expose maintenant les statistiques de saison, le prochain Grand Prix, un écran de préparation, les miniatures des circuits réels et un classement avec les résultats par manche. Les courses restent les sessions arcade F1 existantes.

## Architecture réutilisée

- `CareerStore` reste la source de vérité locale : profil, courses, archives de saisons, calendrier, points, replays et records.
- `RaceSession` / `RaceWorld` assurent la grille de six voitures, la physique, le chronométrage et les résultats finaux.
- `CareerPanel` présente le tableau de bord, le calendrier, la préparation du Grand Prix et le classement.
- `CircuitLibrary`, `TrackSelection` et `TrackGallery` fournissent les circuits personnalisés validés et leurs aperçus issus des coordonnées réelles.
- Le profil carrière partage le nom, le numéro et la livrée du Garage. La session lit ces mêmes préférences pour le pilote humain.

## Fonctionnalités réalisées

- Tableau de bord avec pilote, numéro, livrée, position, points, victoires, podiums et manches disputées. Ces valeurs sont calculées à partir des résultats de la saison active.
- Calendrier de jusqu’à trois Grands Prix, avec miniature générée à partir de la géométrie, distance calculée, nombre indicatif de virages et état de la manche.
- Étape **Préparer le GP** affichant le circuit, la géométrie, la voiture personnalisée, les six voitures, le nombre de tours et les options de saison avant le lancement.
- Classement des pilotes avec points, victoires, podiums, courses et place obtenue à chaque Grand Prix.
- Barème conservé : 25 / 18 / 15 / 12 / 10 / 8 pour les six premières places. Seuls les pilotes classés marquent.
- Départage déterministe existant conservé : points, victoires, podiums, puis nom en ordre français.
- Champion de saison affiché après la dernière manche à partir du classement calculé.
- Les circuits personnalisés valides peuvent entrer dans un calendrier. Une copie runtime de leurs waypoints et de leur largeur est enregistrée dans la saison ; modifier ou supprimer ensuite l’original ne change donc pas le tracé programmé.
- La nouvelle saison demande confirmation lorsqu’une saison active existe et conserve celle-ci dans l’archive. Les saisons précédentes ne sont pas remplacées automatiquement.
- Si la sauvegarde est illisible ou utilise un format inconnu, le panneau affiche un avertissement. Avant une nouvelle écriture, le blob est copié dans `neurodrive-ultimate-career-v1-recovery` (ou une variante numérotée) afin de préserver les données récupérables.
- Les résultats d’un championnat portent maintenant l’identifiant de saison, l’identifiant de manche et un marqueur de course terminée. Le Store refuse une course rapide, une manche inachevée, une manche hors calendrier ou un doublon pour attribuer des points.
- Les résultats de laboratoire restent exclus : `RaceSession.saveCareerRace` ne persiste pas les sessions `laboratory` ou `persistResults: false`.
- Les fonctions historiques d’historique local, records, replay, tutoriel, démonstration professeur et conformité restent accessibles dans une section repliable.

## Sauvegarde et compatibilité

Le format de carrière reste en version 1 avec des champs additionnels facultatifs (`trackDefinitions`, `seasonId`, `roundTrackId`, `raceCompleted`). Les saisons et courses existantes continuent d’être lues. Les anciennes manches intégrées sans snapshot utilisent leur circuit intégré connu ; un circuit personnalisé dont la copie manque est signalé et n’est pas remplacé silencieusement.

Un parcours de carrière utilise la même clé locale que le reste du jeu. Le score n’est enregistré qu’à la fin de la session RaceWorld, et `CareerStore` refuse le second enregistrement de la même manche. Les abandons ne déclenchent pas l’écran de fin normal et ne gagnent donc pas de points.

## Tests exécutés

- `npm.cmd test` : **277 tests réussis**, 36 fichiers.
- Scénario RaceWorld déterministe : le joueur part de P3, termine P1, son résultat est enregistré, la carrière est rechargée depuis le stockage simulé et les 25 points sont conservés ; la manche ne peut pas être ajoutée une seconde fois.
- Tests du barème, des égalités, du calendrier, des DNF, des doublons, des courses rapides non scorables, des manches inachevées, des snapshots de circuit personnalisé et de la récupération d’une sauvegarde corrompue.
- `npm.cmd run build` : réussi. Vite conserve son avertissement connu sur le chunk Three.js de 509 kB.
- Manifeste scientifique : **175/175 SHA-256 concordants**, aucune entrée manquante ou modifiée.
- Aucun entraînement exécuté ; modèles A/B/C et résultats historiques préservés.

## Limites et validation manuelle

Chrome n’était pas disponible dans l’environnement de validation ; le parcours visuel complet n’est donc pas déclaré vérifié. À vérifier manuellement :

1. Ouvrir **Carrière locale** et créer une saison ; tester un à trois circuits et chaque nombre de tours proposé.
2. Modifier nom, numéro et couleur, puis contrôler leur reprise dans le Garage et sur la voiture du joueur en course.
3. Préparer le prochain GP, vérifier le tracé et les paramètres, puis lancer la course.
4. Terminer une course et contrôler l’écran final, les points, le résultat par GP et le déblocage de la manche suivante.
5. Quitter/recharger le navigateur, reprendre la carrière et vérifier qu’aucun point n’est compté deux fois.
6. Créer une saison avec un circuit personnalisé valide, puis renommer ou supprimer l’original dans Circuit Studio ; vérifier que la manche conserve son snapshot.
7. Abandonner une course et confirmer l’absence de points ; lancer Steering Lab et Neural Lab et confirmer qu’ils ne modifient pas le championnat.
8. Terminer la saison, vérifier le champion, puis créer une nouvelle saison et confirmer que l’ancienne reste archivée.

La démonstration du podium visuel et la persistance réelle au travers de la fermeture de Chrome nécessitent encore cette vérification manuelle.
