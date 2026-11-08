import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { setIntegratedLabInstructions } from '../src/game/RaceSession.js';

const raceSessionSource = readFileSync(new URL('../src/game/RaceSession.js', import.meta.url), 'utf8');
const indexSource = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('RaceSession DOM contract', () => {
  it('keeps the application roots required by SceneManager in the real entry HTML', () => {
    expect(indexSource).toMatch(/<div\s+id="app"[^>]*>/);
    expect(indexSource).toMatch(/<div\s+id="viewport"[^>]*>/);
  });

  it('declares every static id queried by RaceSession in its actual HUD or dynamic HUD markup', () => {
    const selectors = [...raceSessionSource.matchAll(/querySelector\('([^']+)'\)/g)].map((match) => match[1]);
    const queriedIds = [...new Set(selectors.filter((selector) => /^#[A-Za-z][\w-]*$/.test(selector)))];
    const applicationAndHudMarkup = `${indexSource}\n${raceSessionSource}`;
    const missing = queriedIds.filter((selector) => !applicationAndHudMarkup.includes(`id="${selector.slice(1)}"`));
    expect(missing).toEqual([]);
  });

  it('writes laboratory instructions into the help component created by configureHudLayout', () => {
    expect(raceSessionSource).toContain("help.className = 'race-command-help'");
    expect(raceSessionSource).toContain("help.innerHTML = '<summary>COMMANDES</summary><p>");
    expect(raceSessionSource).toContain("footer.append(systemReadout, help)");
    expect(raceSessionSource).toContain("this.ui.querySelector('.race-key-guide')?.remove()");
    expect(raceSessionSource).toContain('setIntegratedLabInstructions(this.ui, this.laboratory.type)');
    expect(raceSessionSource).not.toContain("this.ui.querySelector('.race-key-guide').textContent");
  });

  it.each(['steering', 'neural'])('configures the retained help element for %s mode', (type) => {
    const paragraph = { textContent: 'standard race instructions' };
    const ui = { querySelector: (selector) => selector === '.race-command-help p' ? paragraph : null };
    setIntegratedLabInstructions(ui, type);
    expect(paragraph.textContent).toBeTruthy();
    expect(paragraph.textContent).not.toBe('standard race instructions');
    expect(paragraph.textContent).toContain(type === 'neural' ? 'Pilote observé' : 'accélérer');
  });

  it('reports a missing required HUD component explicitly instead of silently skipping it', () => {
    expect(() => setIntegratedLabInstructions({ querySelector: () => null }, 'steering'))
      .toThrow('RaceSession HUD contract: .race-command-help p must exist before configuring an integrated lab.');
  });

  it('does not query or mutate the key guide after configureHudLayout removes it', () => {
    const keyGuideWrites = raceSessionSource.match(/querySelector\('\.race-key-guide'\)\.textContent/g) ?? [];
    expect(keyGuideWrites).toHaveLength(0);
    expect(raceSessionSource.match(/querySelector\('\.race-key-guide'\)\?\.remove\(\)/g)).toHaveLength(1);
  });
});
