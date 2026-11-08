export const MAIN_MENU_ENTRIES = Object.freeze({
  'quick-race': Object.freeze({ section: 'play', route: 'race' }),
  championship: Object.freeze({ section: 'play', route: 'career' }),
  tutorial: Object.freeze({ section: 'play', route: 'tutorial' }),
  'steering-lab': Object.freeze({ section: 'ai-labs', route: 'f1-session-steering' }),
  'neural-lab': Object.freeze({ section: 'ai-labs', route: 'f1-session-neural' }),
  'circuit-studio': Object.freeze({ section: 'creation', route: 'circuit-studio' }),
});

/** One delegated listener routes the menu cards to existing application actions. */
export function bindMainMenuEntries(root, actions = {}) {
  if (!root?.addEventListener) throw new TypeError('A menu root element is required.');
  const listeners = new AbortController();
  root.addEventListener('click', (event) => {
    const entry = event.target?.closest?.('[data-menu-entry]')?.dataset?.menuEntry;
    if (!Object.hasOwn(MAIN_MENU_ENTRIES, entry)) return;
    actions[entry]?.(event);
  }, { signal: listeners.signal });
  return () => listeners.abort();
}
