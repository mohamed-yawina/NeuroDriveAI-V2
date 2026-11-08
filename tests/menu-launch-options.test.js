import { describe, expect, it, vi } from 'vitest';
import { getPanelCtaAction, getRaceLaunchOptions, launchMenuRace } from '../src/ui/MenuLaunchOptions.js';
import { SessionNavigation } from '../src/ui/SessionNavigation.js';

function menuDocument(values) {
  return {
    querySelector(selector) {
      const value = values[selector];
      return value === undefined ? null : typeof value === 'object' ? value : { value };
    },
  };
}

describe('real menu launch controls', () => {
  it('launches the race using menu controls without requiring removed AI model selectors', () => {
    const documentRef = menuDocument({ '#menu-track': 'technical', '#menu-laps': '5' });
    expect(getRaceLaunchOptions(documentRef, '#1755cc')).toEqual({ trackId: 'technical', laps: 5, formationLap: false, liveryColor: 0x1755cc });
    expect(getRaceLaunchOptions(menuDocument({}), undefined)).toEqual({ trackId: 'original', laps: 3, formationLap: false, liveryColor: 0xe10600 });
    expect(getRaceLaunchOptions(menuDocument({ '#menu-formation': { checked: true } })).formationLap).toBe(true);
  });

  it('sends the garage call-to-action to circuit selection before starting a race', () => {
    expect(getPanelCtaAction('garage')).toBe('circuits');
    expect(getPanelCtaAction('circuits')).toBe('launch');
  });

  it('runs the same menu race launcher through navigation and disposes it on return', async () => {
    const navigation = new SessionNavigation();
    const session = { dispose: vi.fn() };
    const createSession = vi.fn(async () => session);
    const started = await launchMenuRace(navigation, {
      documentRef: menuDocument({ '#menu-track': 'original', '#menu-laps': '8' }),
      livery: '#f5f5f5', createSession, onReturn: vi.fn(),
    });
    expect(started).toBe(session);
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ trackId: 'original', laps: 8, formationLap: false, liveryColor: 0xf5f5f5 }));
    await navigation.returnToMenu();
    expect(session.dispose).toHaveBeenCalledOnce();
    expect(navigation.state).toBe('menu');
  });

});
