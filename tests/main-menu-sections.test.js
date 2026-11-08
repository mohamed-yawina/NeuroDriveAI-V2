import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bindMainMenuEntries, MAIN_MENU_ENTRIES } from '../src/ui/MainMenuSections.js';
import { getRaceLaunchOptions } from '../src/ui/MenuLaunchOptions.js';

describe('professional main menu sections', () => {
  it('assigns every requested game, lab and creation entry to an existing route', () => {
    expect(MAIN_MENU_ENTRIES).toMatchObject({
      'quick-race': { section: 'play', route: 'race' },
      championship: { section: 'play', route: 'career' },
      tutorial: { section: 'play', route: 'tutorial' },
      'steering-lab': { section: 'ai-labs', route: 'f1-session-steering' },
      'neural-lab': { section: 'ai-labs', route: 'f1-session-neural' },
      'circuit-studio': { section: 'creation', route: 'circuit-studio' },
    });
    expect(MAIN_MENU_ENTRIES).not.toHaveProperty('legacy-ai-lab');
  });

  it('uses one delegated click listener and dispatches nested card clicks to the matching existing action', () => {
    let clickHandler;
    const addEventListener = vi.fn((type, handler) => { if (type === 'click') clickHandler = handler; });
    const root = { addEventListener };
    const actions = Object.fromEntries(Object.keys(MAIN_MENU_ENTRIES).map((entry) => [entry, vi.fn()]));
    const dispose = bindMainMenuEntries(root, actions);
    expect(addEventListener).toHaveBeenCalledTimes(1);
    for (const entry of Object.keys(MAIN_MENU_ENTRIES)) {
      clickHandler({ target: { closest: () => ({ dataset: { menuEntry: entry } }) } });
      expect(actions[entry]).toHaveBeenCalledTimes(1);
    }
    clickHandler({ target: { closest: () => ({ dataset: { menuEntry: 'unknown' } }) } });
    for (const action of Object.values(actions)) expect(action).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('keeps selected track and lap settings as the quick-race source of truth', () => {
    const controls = { '#menu-track': { value: 'technical' }, '#menu-laps': { value: '8' } };
    const documentRef = { querySelector: (selector) => controls[selector] ?? null };
    expect(getRaceLaunchOptions(documentRef, '#e10600')).toMatchObject({ trackId: 'technical', laps: 8 });
    controls['#menu-track'].value = 'fast-oval';
    controls['#menu-laps'].value = '5';
    expect(getRaceLaunchOptions(documentRef)).toMatchObject({ trackId: 'fast-oval', laps: 5 });
  });

  it('defines the three menu sections and responsive card layouts in the application markup/styles', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const main = readFileSync(`${root}/src/main.js`, 'utf8');
    const index = readFileSync(`${root}/index.html`, 'utf8');
    const styles = readFileSync(`${root}/src/style.css`, 'utf8');
    for (const section of ['home', 'ai-labs', 'creation']) expect(main).toContain(`data-panel="${section}"`);
    for (const entry of Object.keys(MAIN_MENU_ENTRIES)) expect(main).toContain(`data-menu-entry="${entry}"`);
    expect(styles).toContain('@media(max-width:900px)');
    expect(styles).toContain('@media(max-width:600px)');
    expect(styles).toContain('.menu-entry-grid,.play-entry-grid{grid-template-columns:1fr');
    expect(main).toContain('createIntegratedLabEntryActions');
    expect(main).toContain('launchSteeringLab(navigation');
    expect(main).toContain('launchNeuralLab(navigation');
    expect(main).not.toContain('launchLegacyAiLab');
    expect(main).not.toContain('legacy-lab-access');
    expect(index).not.toContain('LABORATOIRE DE PILOTAGE AUTONOME');
  });
});
