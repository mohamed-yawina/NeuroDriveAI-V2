# Modification 12 — REDLINE uniquement dans les menus

## Résultat

REDLINE est maintenant gouvernée par l'état global de `SessionNavigation`. Le passage à `loading` lance un fondu de sortie linéaire de 450 ms; la lecture s'arrête après 500 ms si l'application reste hors menu. L'état `simulation` couvre les courses, les laboratoires et les séquences de course du tutoriel. La pause et le podium ne peuvent donc pas réautoriser la musique.

Au retour à `menu`, la piste persistante reprend avec le fondu d'entrée. Les changements d'onglets ne recréent ni ne relancent la piste. Un retour rapide ou une erreur de création annule l'arrêt différé et conserve la même instance. Les canaux moteur, effets et ambiance restent indépendants.

## Fichiers

- `src/main.js` — transmet chaque état de navigation à AudioManager et ne coupe plus immédiatement l'audio au retour menu.
- `tests/phase14-audio-haptics.test.js` — couvre le fondu 450 ms, les onglets, le cycle pause/course, le retour rapide, l'échec de lancement, le podium et l'absence de doublon.
- `docs/modification-12-redline-menu-only.md` — ce rapport.

La piste existante `public/audio/neurodrive-redline.wav` et les réglages persistés sont conservés.

## Validation

- `npm.cmd test` : **241 tests réussis**, 35 fichiers.
- `npm.cmd run build` : **réussi**. Avertissement Vite existant sur le chunk Three.js de 509 kB.
- Manifeste scientifique : **175/175 empreintes SHA-256 conformes**, aucun fichier manquant ou modifié.
- Aucun test Chrome matériel n'a été exécuté dans cette session. Dans Chrome, vérifier le déverrouillage audio après interaction, le fondu à l'ouverture d'une course, l'absence de musique pendant pause/course, puis la reprise sans double piste au retour menu. Vérifier également le mode muet et le volume musique.
