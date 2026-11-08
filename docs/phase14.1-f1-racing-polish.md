# Phase 14.1 — F1 Racing Polish & Gameplay

## Périmètre livré

- La monoplace de jeu gagne des flaps d’aileron, des éléments de diffuseur, des bandes de livrée, un cockpit/halo déjà présent et des moyeux à rayons. Les nouveaux éléments restent uniquement visuels.
- Le portique de départ en 3D comporte cinq feux; leurs états suivent `RaceDirector.redLights`, comme les feux du HUD.
- Des bâtiments de stand et des tribunes simples complètent le décor. Les bordures, blocs de sécurité et rangées de tribunes sont regroupés dans trois `InstancedMesh` pour réduire les objets et draw calls.
- Les collines et les arbres sont instanciés. La carte d’ombre directionnelle passe de 2048² à 1024², les objets de décor répétitifs ne projettent pas d’ombres et le pixel ratio de rendu est plafonné à 1,75.
- En caméra poursuite, distance, hauteur et anticipation augmentent progressivement avec la vitesse. Une collision joueur déclenche une secousse de caméra courte et amortie.
- Un vignettage rouge très léger dépend de la vitesse; le HUD souligne le freinage. Ces effets ne changent ni trajectoire ni dynamique.
- Le moteur audio procédural ajuste hauteur, filtre et gain en fonction de la vitesse, de la commande d’accélération, de l’accélération observée et du freinage. Les signaux de départ, collision, sortie, fin et menu restent des sons synthétiques sans ressource sous copyright. Pause et sortie utilisent toujours la suspension/nettoyage existants.

## Vérifications et limites

- Tests ajoutés : regroupement du décor, nombre et synchronisation des feux, présence des détails et livrée, quatre roues, variation de la caméra selon la vitesse, relation entre charge moteur et hauteur sonore, appels des événements audio.
- `npm.cmd test` : 119 tests passés dans 19 fichiers.
- `npm.cmd run build` : réussi. Le chunk d’entrée reste à 14,39 kB; Three.js est à 499,99 kB (gzip 125,44 kB), sans avertissement Vite.
- Le gain de performance est structurel (moins d’objets de décor et une carte d’ombre plus petite); aucun benchmark FPS représentatif n’a été effectué.
- Aucun test visuel navigateur n’a pu être fait dans cette session : l’outil navigateur renvoie `browser access host is unavailable`, et l’inventaire natif ne fournit aucune fenêtre contrôlable. Les images et l’aspect du WebGL ne sont donc pas déclarés validés.
- Le parcours complet menu → garage → circuit → course réelle → podium → menu doit encore être confirmé visuellement. Le moteur de course a un test headless de fin de course; cela ne remplace pas le test navigateur d’une course complète.
- Le son a été validé par API Web Audio simulée. Haut-parleurs, latence/perception, manette et haptique sur appareil réel restent à vérifier sur matériel.
- Le portique et le décor sont des objets statiques, pas une infrastructure de circuit interactive. Pas de stratégie pneus, boîte, météo, carrière, replay, DRS ni radio ajoutés.

## Séparation scientifique

Aucun entraînement n’a été lancé. Aucun modèle A/B/C, résultat historique, récompense, scénario scientifique ou équation de physique n’a été modifié. Les changements se limitent au rendu, à la caméra de présentation et au son de l’expérience F1.
