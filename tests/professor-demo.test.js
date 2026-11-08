import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROFESSOR_DEMO_STEPS, ProfessorDemo, ProfessorDemoTimeline, shouldReuseProfessorSession } from '../src/game/ProfessorDemo.js';

function makeNode() {
  const attrs = {};
  return {
    textContent: '', innerHTML: '', dataset: {}, style: {}, disabled: false, removed: false,
    setAttribute: vi.fn((name, value) => { attrs[name] = String(value); }),
    getAttribute: (name) => attrs[name],
    addEventListener: vi.fn((type, callback) => { if (type === 'click') this.clickHandler = callback; }),
    remove: vi.fn(function remove() { this.removed = true; }),
  };
}

function setupDemo(options = {}) {
  const nodes = new Map();
  const root = makeNode();
  root.className = '';
  root.setAttribute = vi.fn();
  root.querySelector = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, makeNode());
    return nodes.get(selector);
  };
  root.addEventListener = vi.fn((type, callback) => { if (type === 'click') root.clickHandler = callback; });
  const host = { append: vi.fn() };
  const documentListeners = new Map();
  const fakeDocument = {
    body: host, hidden: false, createElement: vi.fn(() => root),
    addEventListener: vi.fn((type, callback) => documentListeners.set(type, callback)),
  };
  vi.stubGlobal('document', fakeDocument);
  vi.stubGlobal('addEventListener', vi.fn());
  const demo = new ProfessorDemo({ host, ...options });
  return { demo, root, nodes, host, fakeDocument, documentListeners };
}

function button(action) { return { target: { closest: () => ({ dataset: { action } }) } }; }

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Mode Professeur — présentation intégrée', () => {
  it('garde les onze étapes et un programme de trois minutes exactement', () => {
    expect(PROFESSOR_DEMO_STEPS).toHaveLength(11);
    expect(PROFESSOR_DEMO_STEPS.reduce((total, step) => total + step.seconds, 0)).toBe(180);
    expect(PROFESSOR_DEMO_STEPS.map((step) => step.id)).toEqual(['intro', 'path', 'obstacle', 'separation', 'combined', 'ai-telemetry', 'architecture', 'decisions', 'comparison', 'limits', 'conclusion']);
  });

  it('démarre en pause, démarre explicitement puis synchronise la pause avec la session', async () => {
    const onPause = vi.fn();
    const { demo, nodes } = setupDemo({ onPause });
    expect(demo.timeline.paused).toBe(true);
    await demo.action(button('start'));
    expect(demo.timeline.paused).toBe(false);
    await demo.action(button('pause'));
    expect(demo.timeline.paused).toBe(true);
    expect(onPause).toHaveBeenLastCalledWith(true);
    const elapsed = demo.timeline.elapsed;
    await demo.tick(10);
    expect(demo.timeline.elapsed).toBe(elapsed);
    await demo.action(button('pause'));
    expect(onPause).toHaveBeenLastCalledWith(false);
    expect(nodes.get('[data-action="pause"]').textContent).toBe('PAUSE');
    demo.dispose();
  });

  it('relie le clic DOM délégué au démarrage, à la navigation clavier et à la sortie', async () => {
    const onExit = vi.fn();
    const { demo, root } = setupDemo({ onExit });
    root.clickHandler(button('start'));
    expect(demo.started).toBe(true);
    const preventDefault = vi.fn(), stopImmediatePropagation = vi.fn();
    demo.onKeyDown({ code: 'PageDown', target: { closest: () => null }, preventDefault, stopImmediatePropagation });
    expect(demo.timeline.index).toBe(1);
    await Promise.resolve(); await Promise.resolve();
    demo.onKeyDown({ code: 'PageUp', target: { closest: () => null }, preventDefault, stopImmediatePropagation });
    expect(demo.timeline.index).toBe(0);
    demo.onKeyDown({ code: 'Escape', target: { closest: () => null }, preventDefault, stopImmediatePropagation });
    await Promise.resolve();
    expect(demo.disposed).toBe(true);
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('navigue aux transitions de module et ne perd pas les étapes à l’ouverture', async () => {
    const onNavigate = vi.fn(async () => {});
    const { demo } = setupDemo({ onNavigate });
    await demo.action(button('start'));
    await demo.tick(12);
    expect(demo.timeline.steps[demo.timeline.index].id).toBe('path');
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenLastCalledWith(PROFESSOR_DEMO_STEPS[1]);
    await demo.tick(16);
    expect(demo.timeline.steps[demo.timeline.index].id).toBe('obstacle');
    expect(onNavigate).toHaveBeenCalledTimes(2);
    demo.dispose();
  });

  it('permet précédent, suivant et recommencer sans créer un autre chronomètre', async () => {
    vi.useFakeTimers();
    const onNavigate = vi.fn(async () => {});
    const { demo } = setupDemo({ onNavigate });
    const timer = demo.timer;
    await demo.action(button('start'));
    await demo.action(button('next'));
    expect(demo.timeline.index).toBe(1);
    await demo.action(button('previous'));
    expect(demo.timeline.index).toBe(0);
    await demo.action(button('restart'));
    expect(demo.timer).toBe(timer);
    expect(demo.timeline.index).toBe(0);
    expect(demo.timeline.paused).toBe(false);
    demo.dispose();
  });

  it('pause la présentation quand la fenêtre perd le focus et ignore les champs éditables', () => {
    const onPause = vi.fn();
    const { demo, fakeDocument, documentListeners } = setupDemo({ onPause });
    demo.action(button('start'));
    fakeDocument.hidden = true;
    documentListeners.get('visibilitychange')();
    expect(demo.timeline.paused).toBe(true);
    demo.setPaused(false);
    const preventDefault = vi.fn();
    const stopImmediatePropagation = vi.fn();
    demo.onKeyDown({ code: 'Space', target: { closest: () => null }, preventDefault, stopImmediatePropagation });
    expect(demo.timeline.paused).toBe(true);
    demo.onKeyDown({ code: 'Space', target: { closest: (selector) => selector.includes('input') ? {} : null }, preventDefault, stopImmediatePropagation });
    expect(demo.timeline.paused).toBe(true);
    demo.onKeyDown({ code: 'Space', target: { closest: () => null }, preventDefault, stopImmediatePropagation });
    expect(demo.timeline.paused).toBe(false);
    expect(stopImmediatePropagation).toHaveBeenCalledTimes(2);
    expect(onPause).toHaveBeenCalledWith(true);
    demo.dispose();
  });

  it('expose les contrôles clavier, arrête ses listeners et son timer au nettoyage', async () => {
    vi.useFakeTimers();
    const { demo, root, fakeDocument } = setupDemo();
    expect(root.innerHTML).toContain('data-action="start"');
    expect(root.innerHTML).toContain('data-action="restart"');
    const timer = demo.timer;
    demo.dispose(); demo.dispose();
    expect(root.removed).toBe(true);
    expect(fakeDocument.addEventListener).toHaveBeenCalledWith('keydown', expect.any(Function), expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(vi.getTimerCount()).toBe(0);
    expect(timer).toBeDefined();
  });

  it('réutilise uniquement une session du laboratoire correspondant', () => {
    const steering = { laboratory: { type: 'steering' } };
    const neural = { laboratory: { type: 'neural' } };
    expect(shouldReuseProfessorSession(steering, PROFESSOR_DEMO_STEPS[2])).toBe(true);
    expect(shouldReuseProfessorSession(steering, PROFESSOR_DEMO_STEPS[6])).toBe(false);
    expect(shouldReuseProfessorSession(neural, PROFESSOR_DEMO_STEPS[7])).toBe(true);
    expect(shouldReuseProfessorSession(neural, PROFESSOR_DEMO_STEPS[10])).toBe(false);
    expect(shouldReuseProfessorSession({ ...steering, disposed: true }, PROFESSOR_DEMO_STEPS[2])).toBe(false);
  });

  it('met en pause et affiche une erreur compréhensible si une transition échoue', async () => {
    const { demo, nodes } = setupDemo({ onNavigate: async () => { throw new Error('échec du chargement'); } });
    await demo.action(button('start'));
    await demo.tick(12);
    expect(demo.timeline.paused).toBe(true);
    expect(nodes.get('[data-status]').textContent).toContain('échec du chargement');
    demo.dispose();
  });
});
