import { TUTORIAL_CHAPTERS, TUTORIAL_GUIDANCE, TUTORIAL_STEPS } from './RaceTutorial.js';
import { CHAMPIONSHIP_POINTS } from './CareerStore.js';
import { measureTrackDefinition, trackPreviewSvg } from '../ui/TrackGallery.js';
import './career-panel.css';

const TRACK_TITLES = { original: 'Circuit Azur', technical: 'Circuit Technique', 'fast-oval': 'Ovale Rapide' };
const safe = (text) => String(text ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const time = (seconds) => Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(3).padStart(6, '0')}` : '—';
const isStartedSeason = (season) => Boolean(season?.createdAt || season?.results?.length || season?.id !== 'local-season-1');

export function mountCareerPanel(menu) {
  const nav = menu.querySelector('.racing-nav nav');
  if (nav?.querySelector('.unavailable')) nav.querySelector('.unavailable').outerHTML = '<button data-view="career">CARRIÈRE LOCALE</button>';
  menu.insertAdjacentHTML('beforeend', `<section class="home-panel menu-panel secondary-panel hidden" data-panel="career">
    <div class="panel-topline"><button class="back-home" type="button">← MENU</button><span>PROGRESSION LOCALE · HORS LIGNE</span></div>
    <div class="career-hero"><div><span class="menu-kicker">SAISON LOCALE · PROGRESSION SAUVEGARDÉE</span><h2>Votre carrière</h2><p id="career-summary"></p></div><b class="career-hero-mark">ND<br><small>F1</small></b></div>
    <div class="career-profile-row"><label class="menu-field">PILOTE<input id="career-name" maxlength="32" autocomplete="nickname"></label><label class="menu-field">N° PILOTE<input id="career-driver-number" type="number" min="0" max="99" step="1"></label><label class="menu-field">LIVRÉE<input id="career-livery" type="color"></label><span class="career-profile-note">Les réglages du Garage s’appliquent à votre voiture en course.</span></div><p id="career-recovery-warning" role="alert"></p>
    <div id="career-dashboard"></div><div id="career-preparation" hidden></div>
    <h3>Calendrier des Grands Prix</h3><div id="career-championship"></div>
    <h3>Classement des pilotes</h3><div id="career-standings"></div><div id="career-championship-history"></div>
    <details class="career-season-details"><summary>NOUVELLE CARRIÈRE / NOUVELLE SAISON</summary><section class="career-season-builder" aria-label="Création de saison"><h3>Préparer une saison</h3><p>Choisissez jusqu’à trois circuits compatibles. Une saison commencée reste conservée dans les archives.</p>
      <fieldset><legend>Calendrier · 1 à 3 Grands Prix</legend><div id="career-season-tracks"></div></fieldset>
      <div class="career-season-options"><label class="menu-field">TOURS<select id="career-season-laps"><option value="3">3</option><option value="5">5</option><option value="8">8</option></select></label><label class="menu-field">DIFFICULTÉ IA<select id="career-season-difficulty"><option value="prudent">Prudente</option><option value="balanced" selected>Équilibrée</option><option value="aggressive">Agressive</option></select></label><label class="menu-field">MÉTÉO<select id="career-season-weather"><option value="dry">Sèche</option><option value="wet">Humide</option><option value="rain">Pluie</option></select></label><label class="toggle-setting"><input type="checkbox" id="career-season-formation"><span>Tour de formation automatique</span></label></div>
      <button class="settings-action" id="career-season-create" type="button">CRÉER LA SAISON</button><p id="career-message" role="status"></p>
    </section></details>
    <details class="career-archive-tools"><summary>HISTORIQUE, REPLAYS ET OUTILS PÉDAGOGIQUES</summary>
      <h3>Records locaux</h3><div id="career-records"></div><h3>Historique des courses</h3><div id="career-history"></div>
      <h3>Replays</h3><label class="menu-field">LIMITE DE STOCKAGE<select id="career-replay-limit"><option value="1">1 replay</option><option value="2">2 replays</option><option value="4">4 replays</option><option value="8">8 replays</option></select></label><label class="menu-field">IMAGES MAXIMUM / REPLAY<select id="career-replay-frames"><option value="900">900</option><option value="1800">1800</option><option value="3600">3600</option><option value="9000">9000</option></select></label><label class="settings-action">CHARGER UN REPLAY JSON<input id="career-replay-import" type="file" accept="application/json,.json"></label><p id="career-replay-message" role="status"></p><div id="career-replays"></div>
      <section class="tutorial-academy" aria-label="Académie NeuroDrive"><h3>Académie NeuroDrive</h3><p>Parcours guidés, validés par les commandes et mesures du jeu.</p><progress id="career-tutorial-progress" max="100" value="0"></progress><p id="career-tutorial-status"></p><div class="tutorial-chapters" id="career-tutorial-chapters"></div><div class="tutorial-current" id="career-tutorial-current"></div><button class="launch-button" id="career-tutorial" type="button">REPRENDRE LE PARCOURS <span>↗</span></button><button class="settings-action" id="career-tutorial-restart" type="button">RECOMMENCER LE TUTORIEL</button></section>
      <h3>Démonstration professeur · 3 minutes</h3><p>Transitions entre les modes réels; les actions qui demandent une intervention restent indiquées.</p><button class="settings-action" id="career-demo" type="button">DÉMARRER LA DÉMONSTRATION</button>
      <h3>Rapport de conformité pédagogique</h3><div id="career-compliance"></div>
    </details>
  </section>`);
}

function renderSeason(panel, store, state, availableTracks) {
  const season = state.championship;
  const started = isStartedSeason(season);
  const next = started ? store.nextChampionshipRound(state) : null;
  const results = new Map(season.results.map((result) => [result.roundTrackId, result]));
  const trackMap = new Map(availableTracks.map((entry) => [entry.selectionId ?? entry.id, entry.track ?? entry.definition ?? entry]));
  const standings = store.standings(state);
  const player = standings.find((driver) => driver.driverId === 'car-1');
  const playerRank = player ? standings.findIndex((driver) => driver.driverId === 'car-1') + 1 : null;
  const completedSeason = started && !next && season.results.length === season.rounds.length;
  const profile = state.profile;
  const rounds = season.rounds.map((trackId, index) => {
    const result = results.get(trackId), unlocked = next?.trackId === trackId;
    const saved = store.championshipTrackDefinition(trackId, season);
    const track = saved ?? trackMap.get(trackId);
    const title = track?.label ?? track?.name ?? TRACK_TITLES[trackId] ?? trackId;
    const scored = result?.points?.find((entry) => entry.driverId === 'car-1');
    const resultText = result ? `Terminée · ${scored ? `${scored.points} pts` : '0 pt'} · ${result.entries?.filter((entry) => entry.status === 'finished').length ?? result.points.length} classés` : unlocked ? 'Prochaine manche' : started ? 'À venir' : 'À planifier';
    let preview = '';
    try { if (track) preview = trackPreviewSvg(track); } catch { /* preserve the schedule and mark a missing preview below */ }
    const status = result ? 'TERMINÉ' : unlocked ? 'PROCHAIN GP' : started ? 'À VENIR' : 'À PLANIFIER';
    return `<li class="career-round ${result ? 'completed' : unlocked ? 'current' : 'locked'}"><span class="career-round-number">${String(index + 1).padStart(2, '0')}</span><div class="career-round-track">${preview || '<div class="career-track-missing">APERÇU INDISPONIBLE</div>'}<span><small>${status}</small><b>${safe(title)}</b><em>${safe(resultText)}</em>${track ? (() => { const stats = measureTrackDefinition(track); return `<i>${(stats.length / 1000).toFixed(2)} km · ${stats.turns} virages estimés</i>`; })() : '<i>La géométrie de cette manche est absente de la sauvegarde.</i>'}</span></div>${unlocked && track ? `<button type="button" data-championship-prepare="${safe(trackId)}">PRÉPARER LE GP <span>↗</span></button>` : result ? '<span class="career-round-status">RÉSULTAT ENREGISTRÉ</span>' : '<span class="career-round-status">' + (track ? 'VERROUILLÉ' : 'CIRCUIT ABSENT') + '</span>'}</li>`;
  }).join('');
  const totalPoints = player?.points ?? 0;
  const wins = player?.wins ?? 0;
  const podiums = player?.podiums ?? 0;
  panel.querySelector('#career-summary').textContent = `${profile.name} · N° ${profile.preferences?.driverNumber ?? 7} · ${profile.livery}`;
  panel.querySelector('#career-dashboard').innerHTML = `<div class="career-stat-grid"><article><small>SAISON</small><b>${started ? safe(season.name) : 'Aucune saison active'}</b></article><article><small>POSITION</small><b>${started && playerRank ? `P${playerRank}` : '—'}</b></article><article><small>POINTS</small><b>${started ? totalPoints : '—'}</b></article><article><small>VICTOIRES</small><b>${started ? wins : '—'}</b></article><article><small>PODIUMS</small><b>${started ? podiums : '—'}</b></article><article><small>GRANDS PRIX</small><b>${season.results.length}/${season.rounds.length}</b></article></div><div class="career-next"><div><small>${next ? `PROCHAIN GRAND PRIX · ${next.index + 1}/${season.rounds.length}` : completedSeason ? 'CHAMPION DE LA SAISON' : started ? 'BILAN DE SAISON' : 'COMMENCEZ ICI'}</small><b>${next ? safe(trackMap.get(next.trackId)?.label ?? store.championshipTrackDefinition(next.trackId, season)?.label ?? TRACK_TITLES[next.trackId] ?? next.trackId) : completedSeason ? safe(standings[0]?.name ?? 'Aucun pilote classé') : started ? 'Reprenez votre calendrier' : 'Créez votre première saison'}</b></div>${next ? `<button class="launch-button" id="career-continue" data-championship-prepare="${safe(next.trackId)}">CONTINUER MA CARRIÈRE <span>↗</span></button>` : completedSeason ? `<span class="career-season-complete">SAISON TERMINÉE · ${standings[0]?.points ?? 0} PTS</span>` : '<button class="launch-button" id="career-new-start" type="button">NOUVELLE CARRIÈRE <span>↗</span></button>'}</div>`;
  panel.querySelector('#career-championship').innerHTML = `<div class="career-season-heading"><div><small>CALENDRIER · v${season.seasonVersion ?? 1}</small><h4>${safe(season.name)}</h4></div><b>${season.results.length}/${season.rounds.length} MANCHES</b></div><p>${season.laps} tours · IA ${safe(season.difficulty)} · météo ${safe(season.weather)} · ${season.formationLap ? 'formation automatique' : 'départ direct'}</p><ol class="career-calendar">${rounds}</ol>${started ? `<p class="career-points-note">Points par place à l’arrivée : ${CHAMPIONSHIP_POINTS.slice(0, 6).join(' / ')}. Les pilotes non classés ne marquent pas.</p>` : '<p class="career-points-note">Sélectionnez les Grands Prix dans « Nouvelle carrière / nouvelle saison ».</p>'}`;
  const roundColumns = season.rounds.map((trackId, index) => `<th title="${safe(trackMap.get(trackId)?.label ?? TRACK_TITLES[trackId] ?? trackId)}">GP${index + 1}</th>`).join('');
  panel.querySelector('#career-standings').innerHTML = standings.length ? `<div class="career-table-scroll"><table class="career-standings"><thead><tr><th>P</th><th>Pilote</th><th>Pts</th><th>V</th><th>Podiums</th><th>GP</th>${roundColumns}</tr></thead><tbody>${standings.map((driver, index) => `<tr><td>${index + 1}</td><td><i style="--driver-color:#${(driver.color ?? 0xe10600).toString(16).padStart(6, '0')}"></i>${safe(driver.name)}</td><td><b>${driver.points}</b></td><td>${driver.wins}</td><td>${driver.podiums}</td><td>${driver.rounds}</td>${season.rounds.map((trackId) => { const entry = results.get(trackId)?.entries?.find((item) => item.driverId === driver.driverId); return `<td>${entry ? entry.status === 'finished' ? `P${entry.position}` : 'DNF' : '—'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>` : '<p>Aucun résultat de championnat enregistré.</p>';
  panel.querySelector('#career-championship-history').innerHTML = state.championshipHistory.length ? `<details><summary>${state.championshipHistory.length} saison(s) précédente(s) conservée(s)</summary><ul>${state.championshipHistory.map((old) => `<li>${safe(old.name ?? old.id)} · ${(old.results ?? []).length}/${(old.rounds ?? []).length} manches enregistrées</li>`).join('')}</ul></details>` : '';
  return { next, started };
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

export function refreshCareerPanel(menu, store, tutorialProgress = null, availableTracks = []) {
  const state = store.read(), panel = menu.querySelector('[data-panel="career"]'); if (!panel) return;
  const tracks = availableTracks.map((entry) => ({ selectionId: entry.selectionId ?? entry.id, track: entry.track ?? entry.definition ?? entry, custom: Boolean(entry.custom) }));
  const checks = tracks.map(({ selectionId, track, custom }) => `<label class="career-track-choice"><input type="checkbox" data-season-track="${safe(selectionId)}" ${state.championship.rounds.includes(selectionId) ? 'checked' : ''}><span>${safe(track.label ?? track.name ?? selectionId)}</span>${custom ? '<small>PERSONNALISÉ</small>' : ''}</label>`).join('');
  panel.querySelector('#career-season-tracks').innerHTML = checks;
  const profile = state.profile;
  panel.querySelector('#career-name').value = profile.name;
  panel.querySelector('#career-driver-number').value = String(profile.preferences?.driverNumber ?? 7);
  panel.querySelector('#career-livery').value = profile.livery;
  panel.querySelector('#career-summary').textContent = `${profile.name} · N° ${profile.preferences?.driverNumber ?? 7} · ${profile.livery}`;
  panel.querySelector('#career-summary').innerHTML = `<span>${state.races.length} course(s) enregistrée(s) · ${state.replays.length} replay(s)</span><span>Livrée <b style="color:${safe(profile.livery)}">${safe(profile.livery)}</b></span>`;
  panel.querySelector('#career-recovery-warning').textContent = store.recoveryWarning ?? '';
  const { next, started } = renderSeason(panel, store, state, tracks);
  panel.querySelector('#career-preparation').hidden = true;
  panel.querySelector('#career-preparation').innerHTML = '';
  panel.querySelectorAll('[data-championship-prepare]').forEach((button) => { button.disabled = !store.championshipTrackDefinition(button.dataset.championshipPrepare, state.championship) && !tracks.some((entry) => entry.selectionId === button.dataset.championshipPrepare); });
  panel.querySelector('#career-records').innerHTML = store.records(state).map((record) => `<p>${safe(TRACK_TITLES[record.trackId] ?? record.trackId)} · ${safe(record.mode)} · ${safe(record.driver)} · ${time(record.bestLapTime)}</p>`).join('') || '<p>Aucun meilleur tour enregistré.</p>';
  panel.querySelector('#career-history').innerHTML = state.races.map((race) => `<article class="career-race"><b>${safe(TRACK_TITLES[race.trackId] ?? race.trackId)}</b><span>${race.results.map((result) => `${Number.isInteger(result.gridPosition) ? `Grille P${result.gridPosition} → ` : ''}P${result.position} ${safe(result.name)} ${time(result.finishTime)}`).join(' · ')}</span></article>`).join('') || '<p>Les courses terminées apparaîtront ici.</p>';
  panel.querySelector('#career-replay-limit').value = String(store.replayLimit); panel.querySelector('#career-replay-frames').value = String(store.maxReplayFrames);
  panel.querySelector('#career-replays').innerHTML = state.replays.map((entry) => `<article class="career-race"><b>${safe(entry.replay.track.label)} · v${entry.replay.version}</b><span>${entry.replay.frames.length} images · ${entry.replay.version === 1 || !entry.replay.sampleRate ? 'cadence inconnue' : `${entry.replay.sampleRate} Hz nominal`}</span><button data-play-replay="${safe(entry.raceId)}">OUVRIR LE REPLAY 3D</button><button data-export-replay="${safe(entry.raceId)}">EXPORTER JSON</button></article>`).join('') || '<p>Aucun replay sauvegardé.</p>';
  renderTutorial(panel, tutorialProgress);
  panel.querySelector('#career-compliance').innerHTML = '<p>Références au support Michel Buffa — Master 2 Miage IA2, octobre 2026. Cette vue ne certifie pas une conformité officielle Casablanca G1.</p><button data-action="open-compliance">CONSULTER LA MATRICE AVEC PREUVES</button>';
  const builder = panel.querySelector('.career-season-details');
  if (!started && next === null) panel.querySelector('#career-new-start')?.addEventListener('click', () => { builder.open = true; builder.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' }); });
}

export function bindCareerPanel(menu, store, { onTutorial = () => {}, onTutorialRestart = () => {}, onTutorialChapter = () => {}, onChampionshipStart = () => {}, onDemo = () => {}, onReplay = () => {}, onImportReplay = () => {}, onCompliance = () => {}, onUpdate = () => {}, getAvailableTracks = () => [], confirmNewSeason = (message) => globalThis.confirm?.(message) ?? true } = {}) {
  const panel = menu.querySelector('[data-panel="career"]');
  const refresh = () => refreshCareerPanel(menu, store, null, getAvailableTracks());
  panel.addEventListener('change', async (event) => {
    if (event.target.matches('#career-name, #career-driver-number, #career-livery')) {
      const profile = store.setProfile({ name: panel.querySelector('#career-name').value, livery: panel.querySelector('#career-livery').value, preferences: { driverNumber: Number(panel.querySelector('#career-driver-number').value) } });
      refresh(); onUpdate(profile);
    }
    if (event.target.matches('#career-replay-limit, #career-replay-frames')) { store.setReplayLimits({ replayLimit: panel.querySelector('#career-replay-limit').value, maxReplayFrames: panel.querySelector('#career-replay-frames').value }); refresh(); }
    if (event.target.matches('#career-replay-import') && event.target.files?.[0]) {
      try { const replay = JSON.parse(await event.target.files[0].text()); const id = await onImportReplay(replay); panel.querySelector('#career-replay-message').textContent = `Replay ${id} sauvegardé après validation.`; refresh(); }
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
        const state = store.read(), season = state.championship;
        if ((season.results.length || season.createdAt) && !confirmNewSeason('La saison actuelle sera archivée et conservée avant de créer la nouvelle. Continuer ?')) return;
        const catalog = new Map(getAvailableTracks().map((entry) => [entry.selectionId ?? entry.id, entry.track ?? entry.definition ?? entry]));
        const trackDefinitions = Object.fromEntries(rounds.filter((id) => catalog.has(id)).map((id) => [id, catalog.get(id)]));
        store.createChampionship({ rounds, trackDefinitions, laps: panel.querySelector('#career-season-laps').value, difficulty: panel.querySelector('#career-season-difficulty').value, weather: panel.querySelector('#career-season-weather').value, formationLap: panel.querySelector('#career-season-formation').checked });
        panel.querySelector('#career-message').textContent = 'Saison créée. Les résultats des saisons précédentes sont conservés.'; panel.querySelector('.career-season-details').open = false; refresh();
      } catch (error) { panel.querySelector('#career-message').textContent = error.message; }
    }
    const prepare = event.target.closest('[data-championship-prepare]');
    if (prepare) {
      const state = store.read(), next = store.nextChampionshipRound(state);
      if (next?.trackId === prepare.dataset.championshipPrepare) {
        const available = new Map(getAvailableTracks().map((entry) => [entry.selectionId ?? entry.id, entry.track ?? entry.definition ?? entry]));
        const track = store.championshipTrackDefinition(next.trackId, next.season) ?? available.get(next.trackId);
        const preparation = panel.querySelector('#career-preparation');
        if (!track) { preparation.hidden = false; preparation.innerHTML = '<p role="alert">La géométrie sauvegardée de ce circuit est indisponible. La course n’a pas été lancée.</p>'; return; }
        let preview = ''; try { preview = trackPreviewSvg(track); } catch { /* the session constructor still validates the track */ }
        const stats = measureTrackDefinition(track);
        preparation.hidden = false;
        preparation.innerHTML = `<article class="career-preparation-card"><div>${preview}<span><small>PRÉPARATION · GRAND PRIX ${next.index + 1}/${next.season.rounds.length}</small><b>${safe(track.label ?? track.name ?? track.id)}</b><em>${(stats.length / 1000).toFixed(2)} km · ${stats.turns} virages estimés</em></span></div><p>Votre voiture · ${safe(state.profile.name)} · N° ${state.profile.preferences?.driverNumber ?? 7}</p><p>${next.season.laps} tours · 6 voitures · IA ${safe(next.season.difficulty)} · ${safe(next.season.weather)}</p><button type="button" class="launch-button" data-championship-start="${safe(next.trackId)}">LANCER LE GRAND PRIX <span>↗</span></button></article>`;
        preparation.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
      }
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
