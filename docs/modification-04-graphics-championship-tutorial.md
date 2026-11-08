# Modification 04 — Graphismes, championnat local et académie

## Portée

Cette modification enrichit les scènes arcade, la saison locale et le parcours tutoriel. Elle ne touche pas au moteur scientifique, aux contrôleurs d'entraînement, aux poids A/B/C ni aux résultats expérimentaux. Aucun entraînement n'a été exécuté.

## Lot A — Graphismes

- Les carrosseries utilisent maintenant une peinture `MeshPhysicalMaterial` avec vernis, les pneus un matériau caoutchouc mat et le cockpit un matériau transparent. Les endplates et éléments de suspension avant ajoutent des détails à faible coût géométrique. Les six couleurs d'équipe continuent de venir de l'affectation de voiture; aucune dimension de collision n'est modifiée.
- Des panneaux de bord de piste fictifs sont générés en deux `InstancedMesh` à partir de la courbe du circuit et de sa demi-largeur. Leur placement est visuel et ne change ni les waypoints, ni la piste collisionnelle, ni les circuits sauvegardés.
- Le dôme de ciel procédural suit l'état jour/crépuscule/nuit déjà produit par `RaceVisualState`; un disque solaire et les lumières existantes reçoivent ce même état. Le changement de champ de vision de la caméra poursuite est borné à +2,2 degrés à vitesse maximale et revient progressivement à sa valeur nominale dans les autres vues.
- Les profils graphiques existants faible/moyen/élevé continuent à piloter pixel ratio, densité des décors et taille des ombres. Le paramètre d'effets coupe maintenant pluie visible, particules de sortie/collision et secousses de caméra. Les préférences sont lues lors de la création de scène.
- Les arbres, reliefs, tribunes, stands, barrières, vibreurs, panneaux de freinage, feux, matériaux d'asphalte et foule instanciée existaient déjà et sont réutilisés. Aucun asset externe n'a été ajouté.

## Lot B — Championnat local

- L'écran Carrière contient un constructeur de saison, un calendrier, le classement, les résultats conservés des saisons précédentes, l'historique et les records.
- La saison permet 1 à 3 circuits distincts parmi les trois circuits standards, 3/5/8 tours, trois profils d'IA déjà compris par `RaceController`, tour de formation et météo visuelle. La météo n'ajoute pas de modèle physique de pluie : les conditions affichées sont explicitement cosmétiques et le modèle arcade existant reste inchangé.
- Le barème préexistant est conservé : 25/18/15/12/10/8/6/4/2/1. Seuls les pilotes dont le résultat indique `finished` marquent. Le classement est calculé depuis les résultats enregistrés et départagé par points, victoires, podiums puis nom, de façon déterministe.
- Une manche ne se lance que si elle est la prochaine au calendrier. Un résultat valide est associé à la saison et au circuit prévus; quitter une course avant son état `finished` ne l'enregistre pas comme résultat de championnat. Un résultat terminé propose un retour vers le championnat.
- Le stockage local version 1 reste lisible. La saison courante précédente est archivée dans `championshipHistory` au démarrage d'une nouvelle saison; les courses et replays existants sont conservés sous leurs limites déjà configurées. Les erreurs d'écriture de saison/résultat sont remontées au lieu d'afficher un succès silencieux.

## Lot C — Académie tutorielle

- Les 18 étapes existantes sont conservées aux mêmes index. Deux validations mesurables sont ajoutées : gain d'une position au classement et tour effectivement terminé.
- Les étapes sont regroupées dans six chapitres : Pilotage, Course, Mécaniques F1, Steering Behaviors, Circuit Studio et Neural Racing Lab. Le joueur peut choisir un chapitre, reprendre la progression ou recommencer.
- Les anciennes sauvegardes `version: 1` contenant uniquement un index sont migrées en ensemble d'étapes déjà franchies. La sauvegarde locale version 2 conserve index et validations sans effacer les anciennes données.
- La validation reste fondée sur des événements existants : commandes non nulles, changement réel de caméra/rapport, activation DRS, dépense ERS, usure, service de stand, dommage mesuré, forces observées, circuit validé/sauvegardé et inspection réelle d'un réseau. La progression par délai seul n'est pas utilisée.
- En course, l'indicateur présente l'objectif et l'aide de commande correspondant à l'étape courante. Pour les étapes qui nécessitent un autre module, il indique de retourner au menu et reprendre; l'événement de validation réel met ensuite à jour la sauvegarde locale.

## Fichiers principaux

- `src/scene/FormulaCar.js`, `src/scene/Track.js`, `src/scene/SceneManager.js`
- `src/game/RaceCameras.js`, `src/game/RaceSession.js`, `src/game/RaceTutorial.js`
- `src/game/CareerStore.js`, `src/game/CareerPanel.js`, `src/game/career-panel.css`, `src/main.js`
- `tests/ultimate-lot4-visuals.test.js`, `tests/ultimate-career-store.test.js`, `tests/ultimate-lot5-1.test.js`

## Validation

Les tests ciblés couvrent le scoring, les non-finisseurs, l'archivage, les paramètres de saison, la migration tutorielle, le choix de chapitre, les événements de progression mesurés, les détails instanciés de circuit et la caméra dynamique.

Validation visuelle Chrome, FPS réels et contrôle matériel : à effectuer dans le navigateur cible. Les tests unitaires n'attestent pas du rendu WebGL, de la fluidité sur une machine particulière, ni du comportement des périphériques physiques.

La comparaison avec le manifeste d'intégrité `docs/ultimate-edition-lot5-1-integrity.csv` a trouvé **0 fichier manquant et 0 empreinte différente** pour 175 entrées (172 résultats JSON/CSV et 3 modèles A/B/C), après les tests et le build. Aucun entraînement n'a été lancé. Le navigateur automatisé n'était pas exposé par l'environnement (`browser access host is unavailable`), aucun FPS réel n'a donc été relevé. `npm.cmd test` : 201 tests réussis, 30 fichiers. `npm.cmd run build` : réussi; Vite conserve son avertissement de chunk Three.js à 509,09 kB (127,82 kB gzip).

### Checklist Chrome

1. Ouvrir Carrière, créer une saison d'un circuit, vérifier le calendrier puis lancer la manche; quitter en course et confirmer qu'aucun résultat n'a été ajouté.
2. Terminer une manche, vérifier points et classement, retourner au championnat et lancer la prochaine manche; créer une nouvelle saison et confirmer que l'ancienne est archivée.
3. Reprendre le tutoriel depuis une ancienne sauvegarde et confirmer que l'index est conservé; sélectionner chaque chapitre et vérifier que les objectifs ne sont validés qu'après l'action attendue.
4. En Course rapide, comparer les profils graphiques, basculer ombres/effets, parcourir les vues poursuite/cockpit/TV et observer les circuits standards et personnalisés.
5. Vérifier la console, le retour au menu et la réouverture des scènes après plusieurs courses.
