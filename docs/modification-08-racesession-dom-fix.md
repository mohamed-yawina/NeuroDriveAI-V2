# Modification 08 — Correction du contrat DOM de RaceSession

## Cause confirmée

Dans `RaceSession` (anciennement ligne 108), le constructeur écrivait dans `.race-key-guide`. Or `configureHudLayout()` crée le composant `.race-command-help` avec son paragraphe de commandes, puis supprime explicitement `.race-key-guide`. Le constructeur de laboratoire s'exécutait après cette suppression. Le sélecteur ne trouvait donc rien et l'affectation de `textContent` produisait exactement l'exception observée.

`index.html` ne supprime pas cet élément : il ne contient que les racines `#app` et `#viewport`; le HUD est monté dynamiquement par `RaceSession`. La cause était le cycle de transformation du HUD lui-même.

## Correction

Les textes d'aide Steering et Neural sont maintenant écrits dans `.race-command-help p`, élément effectivement créé et conservé par `configureHudLayout()`. Une fonction dédiée valide cette dépendance et lève une erreur explicite de contrat HUD si le paragraphe venait à manquer. Aucun optional chaining n'a été ajouté pour dissimuler l'absence d'un élément requis.

L'audit des accès DOM directs de `RaceSession` a comparé les identifiants recherchés avec `index.html` et le markup généré par le HUD. Les seuls identifiants non présents dans `RaceSession.js` sont `#app` et `#viewport`, tous deux déclarés dans `index.html`. `RaceWorld` ne manipule pas le DOM. La disparition de `.race-key-guide` était l'incohérence repérée.

## Tests et limites d'environnement

`tests/race-session-dom-contract.test.js` contrôle les racines de l'application, les identifiants DOM interrogés par le HUD, la création du composant de commandes, la suppression de l'ancien guide et l'écriture des instructions dans le composant conservé pour les deux modes. Le test d'écriture n'émule que le composant ciblé ; il ne fabrique pas toute une page HUD. Les tests d'intégration existants couvrent le routage des cartes, les options transmises et le cycle de navigation.

Ce dépôt ne contient pas jsdom, happy-dom ou Playwright. L'hôte de contrôle navigateur est indisponible dans cette session. En conséquence, une construction complète de `RaceSession` dans un véritable DOM et une validation visuelle Chrome ne sont pas revendiquées ici. La cause du crash fournie par la trace Chrome est néanmoins reproduite par le cycle de création/suppression visible dans le code, puis corrigée.

## Vérifications à refaire dans Chrome

1. Lancer `npm.cmd run dev`, puis recharger la page.
2. Ouvrir **Laboratoires IA** et lancer **Steering Lab — Course 3D**. Vérifier l'apparition de la scène F1, du HUD et du panneau Steering Lab, sans erreur console.
3. Revenir au menu et lancer **Neural Lab — Course 3D**. Vérifier la même scène F1, le panneau Neural Lab et l'absence de l'exception `RaceSession.js:108`.
4. Revenir au menu, relancer les deux modes, puis vérifier Course rapide.
5. Si un échec subsiste, relever la première exception console complète : l'ancien crash `.race-key-guide` est supprimé et le message du contrat `.race-command-help p` identifiera toute nouvelle incohérence.

## Résultats de validation

- `npm.cmd test` : 215 tests réussis sur 32 fichiers.
- `npm.cmd run build` : réussi ; avertissement Vite maintenu pour le chunk Three.js (507,79 kB).
- Intégrité : 175 empreintes scientifiques vérifiées, 0 fichier absent et 0 empreinte différente.
- Chrome : non exécuté, car le navigateur/hôte d’automatisation est indisponible dans cet environnement.


