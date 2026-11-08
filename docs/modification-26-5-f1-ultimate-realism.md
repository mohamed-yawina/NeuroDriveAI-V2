# Modification 26.5 — F1 Ultimate Realism & Customization

## Sauvegarde et périmètre

- Branche de travail : `feature/f1-ultimate-realism` (elle existait déjà au début de cette reprise).
- Sauvegarde GitHub de référence : `806c437e19fb387500a17e5bb2a385d8f9305164`, push confirmé par l’utilisateur. Aucun commit ni push des changements 26.5 n’a été effectué.
- Le dépôt était propre au début de la reprise. Les modifications restent locales sur la branche de travail.
- Aucun entraînement et aucune modification des moteurs, protocoles, poids ou résultats scientifiques historiques.

## Audit et architecture conservée

`RaceWorld` et `GameVehicleDynamics` restent la source des règles, dimensions fonctionnelles et de la physique. `RaceSession` crée les vues par `FormulaCar`; le Garage et le showroom réutilisent `MenuShowroom` et `FormulaCar`. Les circuits emploient déjà une texture d’asphalte procédurale, des bordures, des vibreurs, du runoff, des barrières instanciées, panneaux 150/100/50, stands, tribunes, public instancié, publicité et un environnement à ciel/soleil/relief. `GameSettings` transmet la densité de décor selon le profil graphique.

Le son passe par un `AudioManager` unique basé sur Web Audio; REDLINE reste gouvernée par ses états MENU. Les courses et laboratoires continuent de partager leurs contrôleurs et leur monde. Le changement ajoute des détails de rendu et d’apparence, sans deuxième scène de course ni modification des trajectoires.

## Réalisations

### Piste et environnement

- Ajout de deux traces de gomme procédurales sur la spline runtime, aux profils Moyen/Élevé. Elles utilisent les mêmes waypoints que la piste, sont nommées comme éléments de rendu uniquement, et ne sont pas utilisées par les collisions, la projection, la progression, les tours ou le suivi IA.
- Le profil Faible omet ces traces. Les éléments répétitifs existants restent instanciés et adaptés à la densité graphique.
- Les circuits prédéfinis et personnalisés continuent d’employer le constructeur `Track` existant. Aucune coordonnée, largeur ou limite logique n’a été changée.

### Modèles de monoplaces

`FormulaCar` accepte maintenant quatre variantes visuelles sélectionnables :

| Modèle | Différences de silhouette visibles |
|---|---|
| Apex | Référence équilibrée |
| Velocity | Nez plus long et fin, ailes élargies, pontons affinés |
| Titan | Nez plus large, pontons et ailes plus massifs, diffuseur renforcé |
| Phantom | Nez facetté, ailes plus compactes, silhouette plus étroite |

La variante est un paramètre de rendu. Le domaine de course, les contrôleurs, les vitesses, les collisions et le gabarit fonctionnel de `RaceWorld` ne changent pas. La carrosserie peut présenter de petites différences visuelles de largeur/longueur; celles-ci n’ont aucune collision associée.

### Garage et pilote

- Ajout de la sélection des quatre modèles, de trois avatars stylisés, de la couleur du casque et de la combinaison.
- Les avatars sont procéduraux et légers : casque, visière, torse et marquage; les styles Classic, Nova et Vector ont des géométries de casque distinctes.
- Les paramètres rejoignent `CareerStore.profile.preferences` et `neurodrive-game-preferences`, gardant les préférences existantes. Le showroom reconstruit et nettoie la vue de voiture lors d’un changement.
- `RaceSession` relit la configuration du profil et la passe uniquement à la voiture humaine. Les voitures des laboratoires et leurs contrôleurs restent inchangés. L’apparence du pilote peut être visible dans le cockpit selon l’angle de caméra.
- Les réglages physiques affichés dans le Garage restent les paramètres communs existants; aucune performance par modèle n’est annoncée.

### Audio

- Le moteur conserve son oscillateur principal piloté par la vitesse/RPM/charge et reçoit une harmonique triangulaire pour enrichir le timbre.
- Une couche passe-bande de crissement est modulée par le glissement latéral mesuré de la voiture observée; sa sortie est silencée à la fermeture/pause de session et utilise le canal Effets.
- Les sons ponctuels existants (départ, collision, sortie de piste, passage de rapport, etc.) et l’ambiance procédurale restent dans le gestionnaire central. REDLINE conserve sa restriction menu uniquement.
- Il s’agit d’une synthèse Web Audio originale, pas d’un enregistrement de moteur. La qualité subjective et l’équilibre sur haut-parleurs/casque n’ont pas été évalués à l’écoute dans un navigateur.

## Fichiers modifiés

- `src/scene/FormulaCar.js`
- `src/scene/MenuShowroom.js`
- `src/scene/Track.js`
- `src/game/RaceSession.js`
- `src/game/AudioManager.js`
- `src/main.js`
- `src/style.css`
- `tests/garage-circuit-experience.test.js`
- `tests/phase14-audio-haptics.test.js`
- `docs/modification-26-5-f1-ultimate-realism.md`

## Validation

- Tests ciblés : 25 tests réussis sur 3 fichiers.
- Suite complète `npm.cmd test` : **306 tests réussis sur 39 fichiers**.
- `npm.cmd run build` : réussi. L’avertissement existant de bundle Three.js reste : 509,00 kB minifié (127,80 kB gzip).
- Manifeste `docs/ultimate-edition-lot5-1-integrity.csv` : **175 entrées présentes, 0 manquante, 0 divergence SHA-256**.
- Aucun entraînement n’a été exécuté.
- Aucun navigateur automatisé/Chrome n’était disponible dans cette session; les tests ne valident donc ni la qualité WebGL à l’écran, ni le rendu sonore à l’écoute, ni les FPS réels.

## Limites et checklist Chrome

1. Ouvrir le Garage, sélectionner successivement Apex, Velocity, Titan et Phantom; comparer les silhouettes de trois-quarts, côté, avant et arrière.
2. Choisir un avatar et changer les couleurs du casque et de la combinaison; naviguer vers le menu puis revenir afin de vérifier la persistance locale.
3. Lancer une course rapide et une manche de Carrière; confirmer que la même livrée, le numéro et la variante choisie sont appliqués à la voiture humaine. Vérifier que les cinq IA gardent leurs apparences et leur comportement usuels.
4. Depuis les caméras cockpit et poursuite, vérifier la lisibilité du pilote et l’absence de clipping.
5. Tester un circuit intégré puis un circuit utilisateur aux profils Faible, Moyen et Élevé; vérifier les traces de gomme, les FPS perçus, les bordures et les collisions. Les traces ne doivent pas modifier la conduite.
6. Avec le son activé après interaction, comparer accélération, décélération et glissement; vérifier les volumes, pause/reprise, retour au menu, absence de REDLINE en course et absence de sons après fermeture de session.
7. Refaire les vérifications à 1366×768 et 1920×1080.

Les mesures FPS, la stabilité visuelle des quatre silhouettes et la qualité acoustique restent à valider sur Chrome et le matériel de présentation.
