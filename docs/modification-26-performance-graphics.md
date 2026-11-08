# Modification 26 — Performance & Graphics Settings Pro

## Audit initial

- `SceneManager` et `MenuShowroom` possèdent chacun leur renderer Three.js, leur resize observer et leur boucle RAF. Le showroom est suspendu pendant une session et reprend au retour au menu.
- `RaceSession` utilise un pas physique fixe de 1/60 s, limite les sous-pas par image à huit et cadence son HUD à 10 Hz. Les modes Circuit Studio, course et Steering Academy sont déjà chargés par imports dynamiques depuis le menu.
- Les profils existants fournissaient déjà un pixel ratio plafonné, des tailles d’ombres, une densité de décor et l’option d’effets. `Track` et l’environnement réutilisent des `InstancedMesh` pour les objets répétés. `RaceParticles` utilise des buffers fixes. Le AI Telemetry Center conserve 300 échantillons et dessine ses graphiques à la cadence d’échantillonnage.
- Le chunk Three.js d’environ 509 kB est la dépendance commune aux scènes 3D. Le projet reporte déjà les scènes de course, le Circuit Studio et Steering Academy. Le showroom 3D est immédiatement visible au menu; repousser sa création demanderait une autre expérience d’accueil, et fractionner Three.js sans modifier ses usages ne réduirait pas le travail total livré. Aucun `manualChunks` ni relèvement artificiel du seuil Vite n’a été ajouté.

## Profils graphiques

Les réglages restent dans l’écran Réglages existant. Le profil persiste dans `GameSettings` et s’applique au showroom dès la modification, puis à toute nouvelle scène de course :

| Profil | Pixel ratio maximal | Carte d’ombre | Décor associé |
|---|---:|---:|---|
| Faible | 1,00 | 512² | Densité selon le réglage dédié; effets visuels de course suspendus |
| Moyen | 1,35 | 768² | Densité selon le réglage dédié; effets disponibles selon le réglage |
| Élevé | 1,75 | 1024² | Densité selon le réglage dédié; effets disponibles selon le réglage |

Le pixel ratio effectif reste plafonné au DPR de l’écran. L’option Ombres peut les désactiver; en Faible, leur résolution est fortement réduite. Le profil Faible suspend aussi les effets visuels de vitesse/collision, sans effacer leur préférence sauvegardée; le contrôle correspondant est désactivé dans l’interface jusqu’au passage à Moyen ou Élevé. La densité du décor reste réglée séparément. Le contexte WebGL garde son antialiasing actuel; le réglage n’est pas présenté comme dynamique. Toute valeur stockée invalide est normalisée avant d’être réécrite. Les profils s’appliquent aux scènes déjà construites pour les paramètres renderer/shadows; les objets de décor d’une course sont construits au démarrage de la session.

Un changement de DPR ou de fenêtre recalcule le pixel ratio effectif, la taille du renderer et le rapport de caméra, sans recréer la scène. Le showroom recalcule aussi ses dimensions; un aperçu de circuit actif est reconstruit avec la même définition logique et la nouvelle densité visuelle.

## Moniteur de performance

`FrameRateMonitor` est optionnel et se contrôle dans la section Performance & graphismes. Il est monté avec le renderer de course et le showroom, puis supprimé avec eux. Un tableau circulaire de 60 intervalles RAF est préalloué; l’affichage n’est rafraîchi qu’au plus toutes les 500 ms. Le libellé `ms/RAF` indique l’intervalle moyen entre callbacks `requestAnimationFrame`; ce n’est ni le temps CPU ni le temps GPU. Les longues pauses de plus d’une seconde sont écartées des échantillons.

L’activation et le profil sont visibles dans l’indicateur Racing Red, placé sans capture de pointeur. En course, il est ajouté au calque HUD existant au-dessus du viewport WebGL; dans le showroom, il reste dans la scène UI du showroom. Le moniteur est caché par défaut. Il est nettoyé avec la scène et ne conserve pas d’historique après désactivation.

## Optimisations et limites

- Les observers `ResizeObserver` restent utilisés; un listener `resize` complémentaire détecte également les variations de DPR et est retiré à la destruction.
- La taille interne du renderer est recalculée seulement au resize/DPR, sans allocations par image.
- Les profils ne touchent ni à la physique, ni aux contrôleurs IA, ni aux règles de course. Le moniteur ajoute uniquement une mesure RAF et une écriture DOM plafonnée.
- Le chunk Three.js reste à **509,00 kB** minifié (127,80 kB gzip) dans le build testé. Le fractionnement existant des modes est conservé. Le bundle reste une limite de téléchargement initial, pas une mesure des performances GPU.
- Aucune mesure FPS en jeu n’est rapportée : Chrome est installé, mais le lancement du navigateur automatisé est bloqué par la politique d’exécution de cet environnement. Les tests headless valident les calculs et le cycle de vie, pas le rendu WebGL ni les FPS réels.

## Tests et intégrité

Les tests couvrent les valeurs sauvegardées et invalides, l’application du pixel ratio du renderer au resize, l’aspect caméra, l’adaptation DPR du showroom, la cadence et la fenêtre bornée du moniteur, son placement au-dessus du viewport, sa désactivation/nettoyage, et le branchement à une frame rendue. Les tests existants des paramètres menu, de navigation et des scènes restent inclus dans la suite complète.

Commandes et résultats finaux :

- `npm.cmd test` : **303 tests réussis sur 39 fichiers**.
- `npm.cmd run build` : réussi; Vite signale le chunk Three.js à **509,00 kB** (127,80 kB gzip).
- Manifeste `docs/ultimate-edition-lot5-1-integrity.csv` : **175 entrées, 0 manquante, 0 divergence SHA-256**.

Aucun entraînement n’a été lancé. Le code de cette modification ne touche ni les modèles A/B/C, ni leurs poids, ni les résultats scientifiques ou protocoles historiques.

## Checklist Chrome

1. Réglages → choisir Faible, Moyen, puis Élevé; confirmer le profil conservé après rechargement et vérifier l’apparence du showroom.
2. Activer le moniteur FPS, parcourir le showroom puis lancer une course de six voitures; vérifier que l’indicateur montre `FPS`, `ms/RAF` et le profil. Le masquer et confirmer sa disparition.
3. Redimensionner la fenêtre et déplacer le navigateur entre écrans/DPR différents; vérifier que l’image reste nette, sans étirement.
4. Refaire ces vérifications dans Course rapide, Steering Lab, Neural Lab et Circuit Studio; contrôler le retour au menu et la libération des scènes.
5. Noter les FPS réels sur le matériel de présentation avec la même scène et le même circuit pour chaque profil. Ne pas interpréter `ms/RAF` comme du temps CPU/GPU.
