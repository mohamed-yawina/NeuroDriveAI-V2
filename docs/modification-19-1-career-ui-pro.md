# Modification 19.1 — Carrière locale : UX/UI responsive

## Résumé

La Carrière locale dispose désormais d'une composition de menu dédiée. Sur desktop, le panneau occupe 39 % de la largeur disponible (plafond de 760 px) et le showroom 58 %. Le panneau conserve une largeur fluide sans minimum fixe et défile indépendamment si son contenu dépasse la hauteur utile. Sous 1024 px, la voiture passe dans une zone de présentation en haut et le contenu carrière prend la largeur disponible en dessous.

Les changements portent sur la présentation et l'activation du layout carrière. Aucune règle métier, sauvegarde, donnée de saison, attribution de points ou personnalisation de voiture n'a été modifiée.

## Audit et cause des problèmes

- Le panneau héritait des dimensions génériques des panneaux secondaires, autour de 390 px, trop étroites pour les statistiques.
- `.career-stat-grid` imposait six colonnes avec une largeur minimale de 90 px. La grille ne pouvait pas tenir dans le panneau et débordait horizontalement.
- La hauteur carrière était plafonnée à `100vh - 106px`, alors que le panneau était placé à `top: 16vh`. À 768 px de haut, la somme dépassait le viewport et coupait le contenu inférieur.
- Les libellés du tableau de bord et du calendrier étaient souvent entre 8 et 11 px, trop petits pour une lecture confortable.
- Le showroom occupait la scène entière même lorsque la vue Carrière était sélectionnée.

## Corrections

- La navigation ajoute la classe `menu-career-active` seulement sur la vue Carrière.
- Le showroom est cadré dans la partie droite sur desktop; son `ResizeObserver` existant adapte le renderer et la caméra à la nouvelle taille du conteneur. La scène n'est pas recréée.
- La vue carrière dispose d'un panneau de 39 %, positionné sous la barre supérieure et limité à la hauteur restante. Le débordement horizontal est empêché; le scroll vertical reste interne au panneau.
- La grille de statistiques utilise quatre colonnes lorsque le panneau est large, deux colonnes lorsque sa largeur réelle passe sous 570 px, et des valeurs plus lisibles.
- Les actions principales peuvent s'étendre sur toute la largeur dans les panneaux étroits; les libellés peuvent revenir à la ligne.
- Les cartes du calendrier et les miniatures ont été compactées, tandis que les noms, statuts et résultats sont agrandis.
- À 1024 px et moins, le layout devient vertical. À 640 px et moins, les formulaires et les cartes de manche passent à une disposition étroite.
- Les sélecteurs sont tous limités à `.main-menu.menu-career-active`, afin de ne pas redimensionner le Garage, Course rapide ou Circuit Studio.

## Résolutions ciblées

Les règles couvrent les résolutions demandées :

| Résolution | Disposition prévue | Vérification effectuée |
|---|---|---|
| 1920 × 1080 | Panneau carrière à gauche, showroom à droite | Contrat CSS automatisé uniquement |
| 1848 × 768 | Même partage, panneau limité à la hauteur utile | Contrat CSS automatisé uniquement |
| 1366 × 768 | Partage desktop fluide, statistiques sur deux colonnes si le panneau est étroit | Contrat CSS automatisé uniquement |
| 1280 × 720 | Partage desktop fluide, actions empilées si nécessaire | Contrat CSS automatisé uniquement |
| 768 × 1024 | Showroom au-dessus, panneau carrière dessous | Contrat CSS automatisé uniquement |

Ces résolutions n'ont pas été inspectées visuellement dans un navigateur pendant cette tâche.

## Tests et validation

- Ajout de quatre tests de contrat couvrant l'activation du layout dédié, le partage desktop, les variantes étroites et le cloisonnement des styles.
- `npm.cmd test` : **281 tests réussis dans 37 fichiers**.
- `npm.cmd run build` : **réussi**. Vite affiche toujours son avertissement existant de chunk Three.js supérieur à 500 kB; il n'est pas lié à cette modification.
- Manifeste d'intégrité : **175 entrées, 0 divergence SHA-256**.
- Aucun navigateur automatisé ou Chrome n'était accessible pour effectuer une validation visuelle; aucun rendu visuel n'est revendiqué.

## Fichiers modifiés

- `src/main.js` — activation de la classe de vue carrière sur la navigation existante.
- `src/game/career-panel.css` — layout dédié, typographie, statistiques, calendrier et responsive.
- `tests/career-responsive-layout.test.js` — tests de structure CSS et d'isolation.
- `docs/modification-19-1-career-ui-pro.md` — ce rapport.

## Checklist Chrome

À vérifier manuellement après lancement avec `npm.cmd run dev` :

1. Ouvrir Carrière locale aux cinq résolutions du tableau.
2. Confirmer que le panneau et le showroom respectent le partage desktop et que la voiture reste cadrée.
3. Vérifier qu'aucun texte, champ ou bouton ne dépasse horizontalement.
4. Vérifier que les statistiques utilisent deux ou quatre colonnes selon la largeur.
5. Confirmer que le prochain Grand Prix, son bouton, le calendrier et le classement restent accessibles avec un scroll interne discret.
6. Passer de Carrière au Garage, aux Circuits, à Course rapide et à Circuit Studio, puis revenir : leur disposition ne doit pas changer.
7. Redimensionner la fenêtre et confirmer l'adaptation de la caméra showroom sans scène dupliquée.

## Limites

Les tests automatisés garantissent les règles CSS attendues et leur portée, mais ne peuvent pas prouver l'absence de chevauchements au pixel près. La vérification responsive finale de la composition et du cadrage showroom reste à réaliser dans Chrome.
