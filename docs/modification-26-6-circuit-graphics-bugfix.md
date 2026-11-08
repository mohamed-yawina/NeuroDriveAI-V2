# Modification 26.6 — Circuit Graphics Ultimate & Bug Fix

## Diagnostic et cause

La branche active est `feature/f1-ultimate-realism`. Les modifications locales de la 26.5 étaient déjà présentes et ont été conservées; aucun commit ni push n’a été fait.

L’environnement préexistant plaçait les arbres sur des anneaux fixes autour de `(0, 0)` sans consulter la géométrie du circuit : rayon 103 m, augmenté jusqu’à 133 m. Or le circuit d’entraînement est une spline centrée près de l’origine et déborde autour de ces anneaux. Une mesure point-segment sur 700 échantillons de la spline retrouve un centre d’arbre à **2,52 m de l’axe**, à l’intérieur de la demi-largeur de piste de 8,2 m. Les troncs et couronnes instanciés pouvaient donc apparaître sur la chaussée et entrer dans le champ de caméra. Le relief utilisait également une disposition indépendante de la piste.

Ce défaut de placement est confirmé dans le code et reproduit numériquement avec la spline runtime. La capture seule ne permet pas de distinguer le mesh d’arbre précis d’un relief; la collision de l’anneau d’arbres avec la piste est néanmoins démontrée et correspond à la masse verte observée. Le circuit « Mon circuit TEST » n’était pas accessible depuis le profil navigateur de cette session; aucune donnée utilisateur n’a été lue ou modifiée. Des formes personnalisées, dont des pistes serrées, petites, translatées et prédéfinies, servent aux tests.

## Correction de placement

Un module `SceneryPlacement` échantillonne la Catmull-Rom fermée avec 700 points, puis mesure la distance minimale à tous les segments X/Z de la spline — pas à quelques points de contrôle. Pour chaque arbre et relief, la marge prend en compte :

`demi-largeur piste + rayon d’emprise au sol + 34 m de dégagement caméra`.

Les candidats sont générés de façon déterministe autour de l’enveloppe réelle du circuit, et une validation exacte point-segment vérifie chaque position. Les arbres utilisent une empreinte conservatrice de 5 m; les reliefs, 16 m. Le groupe environnemental, le ciel et le sol sont centrés sur le circuit. Le sol s’étend selon l’enveloppe de la piste.

`SceneManager.setTrack()` — utilisé par l’aperçu 3D de Circuit Studio — conserve l’environnement s’il reste sûr et si le nouveau tracé tient dans le sol actuel. Si le tracé s’approche d’un décor ou sort de cette zone, l’environnement est reconstruit autour de la nouvelle piste et les anciennes ressources Three.js sont libérées. Les scènes standard et les courses personnalisées partent directement d’un environnement construit depuis leur définition.

Les caméras de course n’ont pas été déplacées : leur poursuite, capot, cockpit, arrière, bord de piste, TV et aérienne restent inchangés. La correction intervient à la source; le dégagement de 34 m dépasse la zone latérale habituelle des caméras de course. Aucun raycast d’évitement par frame n’est ajouté.

## Graphismes et intégrité du gameplay

- La texture procédurale d’asphalte conserve son format et ses UV; sa variation combine maintenant grain fin et motifs de surface plus doux.
- Les traces de gomme de la 26.5 restent en place lorsque le profil graphique le permet.
- Les vibreurs, runoff, barrières, panneaux, stands et tribunes gardent leur géométrie Track existante; ils restent en `InstancedMesh` là où ils l’étaient déjà.
- La densité d’arbres et de reliefs reste liée au profil Faible/Moyen/Élevé.
- Aucun waypoint, checkpoint, largeur, ligne de départ, collision, progression, classement, contrôleur IA ou paramètre physique n’a été modifié.

## Fichiers ajoutés ou modifiés

- Ajout : `src/scene/SceneryPlacement.js`.
- Modification : `src/scene/SceneManager.js`, `src/scene/Track.js`.
- Ajout : `tests/scenery-placement.test.js`.
- Ajout : `docs/modification-26-6-circuit-graphics-bugfix.md`.

Les modifications locales déjà présentes de la 26.5 dans Garage, voitures et audio sont conservées telles quelles.

## Tests et limites

Les nouveaux tests reproduisent l’ancien chevauchement, vérifient les distances d’emprise sur le circuit standard, les circuits technique et rapide, un ovale serré, un petit circuit utilisateur translaté, les matrices réellement remplies des `InstancedMesh`, et le ré-ancrage lors d’un changement de piste dans Circuit Studio. Les tests de présentation et de Circuit Studio couvrent aussi les systèmes voisins.

Aucun Chrome/WebGL n’était disponible pour cette validation. Le rendu visuel, l’occultation caméra à l’écran et les FPS restent à contrôler manuellement. Aucun gain de performance n’est revendiqué. La position très éloignée des éléments de décor est volontaire pour préserver la visibilité sur les caméras de course; leur placement précis peut être ajusté après contrôle visuel.

## Checklist Chrome

1. Ouvrir `Mon circuit TEST` dans Circuit Studio, afficher l’aperçu 3D puis modifier sa géométrie; vérifier que l’environnement se recale si le tracé approche les décors.
2. Lancer ce circuit en Course rapide avec six voitures; contrôler les caméras poursuite, capot, cockpit, arrière, TV et aérienne.
3. Refaire l’essai avec circuits standard, étroit, petit, large et fortement translaté.
4. Inspecter arbres, reliefs, vibreurs, barrières et visibilité dans les virages serrés; confirmer qu’aucun décor volumineux n’intersecte la piste.
5. Comparer Faible, Moyen et Élevé; confirmer la densité attendue et relever les FPS sur le matériel réel, sans interpréter les mesures headless comme FPS GPU.
6. Revenir de Circuit Studio au menu, relancer une course et confirmer l’absence de scène ou d’environnement dupliqué.
