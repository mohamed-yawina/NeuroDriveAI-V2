# Course rapide : stabilité arcade

Cette note décrit les règles propres au mode arcade. Le moteur scientifique, ses
équations, ses modèles enregistrés et les expériences historiques ne sont pas
utilisés comme cible de modification par ces règles.

## Commandes

| Action | Commande |
| --- | --- |
| Accélérer | Flèche haut ou W |
| Freiner / marche arrière à basse vitesse | Flèche bas ou S |
| Braquer | Flèches gauche/droite ou A/D |
| Pause/reprise | Espace |
| Recommencer | R |
| Changer de caméra | C |
| Suivre une voiture | 1 à 6 |
| Monter/rétrograder (boîte manuelle) | E / Q |
| Demander le DRS | F |
| Déployer l’ERS | V ou commande HUD |

Les entrées de conduite sont neutralisées pendant le compte à rebours, après la
fin de course et en pause. La perte de focus efface les touches maintenues ; la
masquage de l’onglet efface les entrées et met la course en pause. La reprise
après retour à l’onglet est volontaire.

## Grille, tours et temps

- La simulation de course utilise un pas fixe de 1/60 s et au plus huit pas par
  image. Lors d’un retard important de rendu, le jeu limite le rattrapage plutôt
  que d’injecter un grand pas physique.
- Le contrôleur arcade avance son point de visée à partir de la projection
  courante, y compris au passage entre segments ; cette adaptation reste locale
  à RaceController et ne modifie pas le Path Following scientifique partagé.
- Les six emplacements sont posés le long de la géométrie courbe. L’écart
  longitudinal des rangées est plafonné à 6,5 m et l’écart latéral par défaut
  reste de 5,4 m.
- Un premier franchissement valide démarre le chronométrage du pilote. Les tours
  suivants nécessitent un passage vers l’avant dans la largeur de piste et au
  moins 90 % de la longueur du circuit parcourue depuis le dernier passage.
  Les sauts de projection incompatibles avec le déplacement physique sont
  écartés, et le déplacement à rebours réduit la distance accumulée.
- Une collision voiture-à-voiture est comptée à l’entrée en contact. La
  résolution de pénétration continue à chaque pas, mais un contact maintenu ne
  répète ni le compteur de collision, ni les dégâts d’impact, ni les événements
  audio/haptiques associés.
- La formation est hors temps de course : les voitures reviennent sur une grille
  espacée avant le compte à rebours. Les entrées de conduite sont ignorées tant
  que les feux ne sont pas éteints.

Les circuits intégrés sont validés par des courses headless déterministes à
trois tours pour les cinq adversaires IA. Les circuits utilisateur doivent
passer la validation de Circuit Studio avant leur lancement.
