export function getPanelCtaAction(panelName) { return panelName === 'garage' ? 'circuits' : 'launch'; }

export function getRaceLaunchOptions(documentRef, livery = '#e10600') {
  const track = documentRef.querySelector('#menu-track');
  const laps = documentRef.querySelector('#menu-laps');
  const formation = documentRef.querySelector('#menu-formation');
  const parsedLaps = Number(laps?.value ?? 3);
  return {
    trackId: track?.value || 'original',
    laps: [3, 5, 8].includes(parsedLaps) ? parsedLaps : 3,
    formationLap: Boolean(formation?.checked),
    liveryColor: Number.parseInt(String(livery).replace('#', ''), 16) || 0xe10600,
  };
}

export function launchMenuRace(navigation, { documentRef, livery, createSession, onReturn, onRaceFinished, tutorial = false, professorMode = false }) {
  return navigation.launch(() => createSession({ ...getRaceLaunchOptions(documentRef, livery), onReturn, onRaceFinished, tutorial, professorMode }));
}
