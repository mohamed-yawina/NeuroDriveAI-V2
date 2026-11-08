import { TUTORIAL_CHAPTERS, TUTORIAL_GUIDANCE, TUTORIAL_STEPS } from './RaceTutorial.js';
import './career-panel.css';

const TRACK_TITLES = { original: 'Circuit Azur', technical: 'Circuit Technique', 'fast-oval': 'Ovale Rapide' };
const safe = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const time = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}` : '—';

export function mountCareerPanel(menu) {
  const nav = menu.querySelector('.racing-nav nav');
  if (nav?.querySelector('.unavailable')) nav.querySelector('.unavailable').outerHTML = '<button data-view="career">CARRIÈRE LOCALE</button>';
  menu.insertAdjacentHTML('beforeend', `<section class="home-panel menu-panel secondary-panel hidden" data-panel="career">
    <div class="panel-topline"><button class="back-home">← MENU</button><span>PROGRESSION LOCALE · HORS LIGNE</span></div>
    <h2>Carrière & championnat</h2>
    <label class="menu-field">NOM DU PILOTE<input id="career-name" maxlength="32" autocomplete="nickname"></label><div id="career-summary"></div>
    <section class="career-season-builder" aria-label="Création de saison"><h3>Nouvelle saison</h3><p>La saison actuelle reste archivée avec tous ses résultats.</p>
      <fieldset><legend>Calendrier · choisissez 1 à 3 Grands Prix</legend><label><input type="checkbox" data-season-track="original" checked> Circuit Azur</label><label><input type="checkbox" data-season-track="technical" checked> Circuit Technique</label><label><input type="checkbox" data-season-track="fast-oval" checked> Ovale Rapide</label></fieldset>
      <div class="career-season-options"><label class="menu-field">TOURS<select id="career-season-laps"><option value="3">3</option><option value="5">5</option><option value="8">8</option></select></label><label class="menu-field">DIFFICULTÉ IA<select id="career-season-difficulty"><option value="prudent">Prudente</option><option value="balanced" selected>Équilibrée</option><option value="aggressive">Agressive</option></select></label><label class="menu-field">MÉTÉO<select id="career-season-weather"><option value="dry">Sèche</option><option value="wet">Humide</option><option value="rain">Pluie</option></select></label><label class="toggle-setting"><input type="checkbox" id="career-season-formation"><span>Tour de formation automatique</span></label></div>
      <button class="settings-action" id="career-season-create">CRÉER / ARCHIVER LA SAISON</button><p id="career-message" role="status"></p>
    </section>
    <h3>Calendrier et progression</h3><div id="career-championship"></div><h3>Classement de la saison</h3><div id="career-standings"></div><div id="career-championship-history"></div>
    <h3>Records locaux</h3><div id="career-records"></div><h3>Historique des courses</h3><div id="career-history"></div>
    <h3>Replays</h3><label class="menu-field">LIMITE DE STOCKAGE<select id="career-replay-limit"><option value="1">1 replay</option><option value="2">2 replays</option><option value="4">4 replays</option><option value="8">8 replays</option></select></label><label class="menu-field">IMAGES MAXIMUM / REPLAY<select id="career-replay-frames"><option value="900">900</option><option value="1800">1800</option><option value="3600">3600</option><option value="9000">9000</option></select></label><label class="settings-action">CHARGER UN REPLAY JSON<input id="career-replay-import" type="file" accept="application/json,.json"></label><p id="career-replay-message" role="status"></p><div id="career-replays"></div>
    <section class="tutorial-academy" aria-label="Académie NeuroDrive"><h3>Académie NeuroDrive</h3><p>Parcours guidés, validés par les commandes et mesures du jeu.</p><progress id="career-tutorial-progress" max="100" value="0"></progress><p id="career-tutorial-status"></p><div class="tutorial-chapters" id="career-tutorial-chapters"></div><div class="tutorial-current" id="career-tutorial-current"></div><button class="launch-button" id="career-tutorial">REPRENDRE LE PARCOURS <span>↗</span></button><button class="settings-action" id="career-tutorial-restart">RECOMMENCER LE TUTORIEL</button></section>
    <h3>Démonstration professeur · 3 minutes</h3><p>Transitions entre les modes réels; les actions nécessitant votre intervention restent indiquées.</p><button class="settings-action" id="career-demo">DÉMARRER LA DÉMONSTRATION</button>
    <h3>Rapport de conformité pédagogique</h3><div id="career-compliance"></div>
  </section>`);
}

function renderChampionship(panel, store, state) {
  const season = state.championship;
  const next = store.nextChampionshipRound(state);
  const results = new Map(season.results.map((result) => [result.roundTrackId, result]));
  const finished = season.results.length;
  panel.querySelector('#career-championship').innerHTML = `<div class="career-season-heading"><div><small>SAISON LOCALE · v${season.seasonVersion ?? 1}</small><h4>${safe(season.name)}</h4></div><b>${finished}/${season.rounds.length} MANCHES</b></div><p>${season.laps} tours · IA ${safe(season.difficulty)} · météo ${safe(season.weather)} · ${season.formationLap ? 'formation' : 'départ direct'}</p><ol class="career-calendar">${season.rounds.map((trackId, index) => {
    const result = results.get(trackId), unlocked = next?.trackId === trackId;
    const scored = result?.points?.find((entry) => entry.driverId === 'car-1');
    const resultText = result ? `Terminée · ${scored ? `${scored.points} pts` : '0 pt'} · ${result.entries?.filter((entry) => entry.status === 'finished').length ?? result.points.length} classés` : unlocked ? 'À courir · manche débloquée' : 'À venir · verrouillée';
    return `<li class="${result ? 'completed' : unlocked ? 'current' : 'locked'}"><span class="career-round-number">${String(index + 1).padStart(2, '0')}</span><div><b>${safe(TRACK_TITLES[trackId] ?? trackId)}</b><small>${resultText}</small></div>${unlocked ? `<button type="button" data-championship-start="${safe(trackId)}">LANCER LE GRAND PRIX</button>` : result ? '<span class="career-round-status">RÉSULTAT ENREGISTRÉ</span>' : '<span class="career-round-status">VERROUILLÉ</span>'}</li>`;
  }).join('')}</ol>${next ? `<p class="career-points-note">Barème par place à l’arrivée : 25 / 18 / 15 / 12 / 10 / 8 points. Une voiture non classée ne marque pas.</p>` : '<p class="career-season-complete">SAISON TERMINÉE · CLASSEMENT FINAL</p>'}`;
  const standings = store.standings(state);
  panel.querySelector('#career-standings').innerHTML = standings.length ? `<table class="career-standings"><thead><tr><th>P</th><th>Pilote</th><th>Pts</th><th>V</th><th>Podiums</th><th>GP</th></tr></thead><tbody>${standings.map((driver, index) => `<tr><td>${index + 1}</td><td><i style="--driver-color:#${(driver.color ?? 0xe10600).toString(16).padStart(6, '0')}"></i>${safe(driver.name)}</td><td><b>${driver.points}</b></td><td>${driver.wins}</td><td>${driver.podiums}</td><td>${driver.rounds}</td></tr>`).join('')}</tbody></table>` : '<p>Aucun résultat de championnat enregistré.</p>';
  panel.querySelector('#career-championship-history').innerHTML = state.championshipHistory.length ? `<details><summary>${state.championshipHistory.length} saison(s) précédente(s) conservée(s)</summary><ul>${state.championshipHistory.map((old) => `<li>${safe(old.name ?? old.id)} · ${(old.results ?? []).length}/${(old.rounds ?? []).length} manches enregistrées</li>`).join('')}</ul></details>` : '';
}

function renderTutorial(panel, progress) {
  const tutorial = progress ?? { index: 0, total: TUTORIAL_STEPS.length, completed: 0, completedIndices: [], progress: 0, current: TUTORIAL_STEPS[0], complete: false };
  const completed = new Set(tutorial.completedIndices ?? Array.from({ length: tutorial.index }, (_, index) => index));
  panel.querySelector('#career-tutorial-progress').value = Math.round((tutorial.progress ?? (tutorial.completed / tutorial.total)) * 100);
  panel.querySelector('#career-tutorial-status').textContent = tutorial.complete ? `Parcours terminé · ${tutorial.completed ?? tutorial.total}/${tutorial.total} étapes validées` : `${tutorial.completed ?? tutorial.index}/${tutorial.total} étapes validées · dernière étape ${tutorial.current?.label ?? 'disponible'}`;
  panel.querySelector('#career-tutorial-chapters').innerHTML = TUTORIAL_CHAPTERS.map((chapter) => {
    const done = chapter.steps.filter((index) => completed.has(index)).length;
    return `<button type="button" class="tutorial-chapter ${done === chapter.steps.length ? 'complete' : ''}" data-tutorial-chapter="${chapter.id}"><b>${safe(chapter.title)}</b><span>${safe(chapter.description)}</span><small>${done}/${chapter.steps.length} étapes validées</small></button>`;
  }).join('');
  const step = tutorial.current;
  panel.querySelector('#career-tutorial-current').innerHTML = step ? `<small>ÉTAPE ${tutorial.index + 1} · ${safe(TUTORIAL_CHAPTERS.find((chapter) => chapter.steps.includes(tutorial.index))?.title ?? '')}</small><b>${safe(step.label)}</b><span>${safe(TUTORIAL_GUIDANCE[step.event] ?? 'Suivez l’indication dans le module concerné.')}</span>` : '<b>Toutes les compétences prévues sont validées.</b>';
}

export function refreshCareerPanel(menu, store, tutorialProgress = null) {
  const state = store.read(), panel = menu.querySelector('[data-panel="career"]'); if (!panel) return;
  panel.querySelector('#career-name').value = state.profile.name;
  panel.querySelector('#career-summary').innerHTML = `<p>${state.races.length} courses · ${state.replays.length} replays sauvegardés</p><p>Livrée : <b style="color:${safe(state.profile.livery)}">${safe(state.profile.livery)}</b></p>`;
  renderChampionship(panel, store, state);
  panel.querySelector('#career-records').innerHTML = store.records(state).map((r) => `<p>${safe(TRACK_TITLES[r.trackId] ?? r.trackId)} · ${safe(r.mode)} · ${safe(r.driver)} · ${time(r.bestLapTime)}</p>`).join('') || '<p>Aucun meilleur tour enregistré.</p>';
  panel.querySelector('#career-history').innerHTML = state.races.map((race) => `<article class="career-race"><b>${safe(TRACK_TITLES[race.trackId] ?? race.trackId)}</b><span>${race.results.map((result) => `${Number.isInteger(result.gridPosition) ? `Grille P${result.gridPosition} → ` : ''}P${result.position} ${safe(result.name)} ${time(result.finishTime)}`).join(' · ')}</span></article>`).join('') || '<p>Les courses terminées apparaîtront ici.</p>';
  panel.querySelector('#career-replay-limit').value = String(store.replayLimit); panel.querySelector('#career-replay-frames').value = String(store.maxReplayFrames);
  panel.querySelector('#career-replays').innerHTML = state.replays.map((entry) => `<article class="career-race"><b>${safe(entry.replay.track.label)} · v${entry.replay.version}</b><span>${entry.replay.frames.length} images · ${entry.replay.version === 1 || !entry.replay.sampleRate ? 'cadence inconnue' : `${entry.replay.sampleRate} Hz nominal`}</span><button data-play-replay="${safe(entry.raceId)}">OUVRIR LE REPLAY 3D</button><button data-export-replay="${safe(entry.raceId)}">EXPORTER JSON</button></article>`).join('') || '<p>Aucun replay sauvegardé.</p>';
  renderTutorial(panel, tutorialProgress);
  panel.querySelector('#career-compliance').innerHTML = '<p>Références au support Michel Buffa — Master 2 Miage IA2, octobre 2026. Cette vue ne certifie pas une conformité officielle Casablanca G1.</p><button data-action="open-compliance">CONSULTER LA MATRICE AVEC PREUVES</button>';
}

export function bindCareerPanel(menu, store, { onTutorial = () => {}, onTutorialRestart = () => {}, onTutorialChapter = () => {}, onChampionshipStart = () => {}, onDemo = () => {}, onReplay = () => {}, onImportReplay = () => {}, onCompliance = () => {}, onUpdate = () => {} } = {}) {
  const panel = menu.querySelector('[data-panel="career"]');
  panel.querySelector('#career-name').addEventListener('change', (event) => { store.setProfile({ name: event.target.value }); refreshCareerPanel(menu, store); onUpdate(store.read().profile); });
  panel.addEventListener('change', async (event) => {
    if (event.target.matches('#career-replay-limit, #career-replay-frames')) { store.setReplayLimits({ replayLimit: panel.querySelector('#career-replay-limit').value, maxReplayFrames: panel.querySelector('#career-replay-frames').value }); refreshCareerPanel(menu, store); }
    if (event.target.matches('#career-replay-import') && event.target.files?.[0]) {
      try { const replay = JSON.parse(await event.target.files[0].text()); const id = await onImportReplay(replay); panel.querySelector('#career-replay-message').textContent = `Replay ${id} sauvegardé après validation.`; refreshCareerPanel(menu, store); }
      catch (error) { panel.querySelector('#career-replay-message').textContent = `Import refusé : ${error.message}`; }
      event.target.value = '';
    }
  });
  panel.addEventListener('click', (event) => {
    const play = event.target.closest('[data-play-replay]'); if (play) { const replay = store.read().replays.find((entry) => entry.raceId === play.dataset.playReplay)?.replay; if (replay) onReplay(replay); }
    const exportButton = event.target.closest('[data-export-replay]'); if (exportButton) {
      try { const item = store.read().replays.find((entry) => entry.raceId === exportButton.dataset.exportReplay); if (!item) return; const url = URL.createObjectURL(new Blob([JSON.stringify(item.replay, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `neurodrive-replay-${safe(item.replay.track.id)}-v${item.replay.version}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
      catch (error) { panel.querySelector('#career-replay-message').textContent = `Export impossible : ${error.message}`; }
    }
    if (event.target.closest('#career-season-create')) {
      try {
        const rounds = [...panel.querySelectorAll('[data-season-track]:checked')].map((input) => input.dataset.seasonTrack);
        store.createChampionship({ rounds, laps: panel.querySelector('#career-season-laps').value, difficulty: panel.querySelector('#career-season-difficulty').value, weather: panel.querySelector('#career-season-weather').value, formationLap: panel.querySelector('#career-season-formation').checked });
        panel.querySelector('#career-message').textContent = 'Nouvelle saison créée. Les données précédentes restent dans les archives.'; refreshCareerPanel(menu, store);
      } catch (error) { panel.querySelector('#career-message').textContent = error.message; }
    }
    const start = event.target.closest('[data-championship-start]');
    if (start) { const state = store.read(), next = store.nextChampionshipRound(state); if (next?.trackId === start.dataset.championshipStart) onChampionshipStart({ ...next, roundTotal: next.season.rounds.length }); }
    const chapter = event.target.closest('[data-tutorial-chapter]'); if (chapter) onTutorialChapter(chapter.dataset.tutorialChapter);
    if (event.target.closest('#career-tutorial')) onTutorial();
    if (event.target.closest('#career-tutorial-restart')) onTutorialRestart();
    if (event.target.closest('#career-demo')) onDemo();
    if (event.target.closest('[data-action="open-compliance"]')) onCompliance();
  });
}
