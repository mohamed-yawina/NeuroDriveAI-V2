export const GAME_SETTINGS_KEY = 'neurodrive-visual-settings';
export const DEFAULT_GAME_SETTINGS = Object.freeze({
  quality: 'high', shadows: true, scenery: 'high', effects: true,
  showFps: false, cameraMode: 'chase', orbitSensitivity: 0.009, zoomSensitivity: 0.8,
});

const QUALITY = Object.freeze({
  low: { pixelRatio: 1, shadowMapSize: 512 },
  medium: { pixelRatio: 1.35, shadowMapSize: 768 },
  high: { pixelRatio: 1.75, shadowMapSize: 1024 },
});
const SCENERY = Object.freeze({ low: 0.45, medium: 0.72, high: 1 });

export function readGameSettings(storage = globalThis.localStorage) {
  try {
    return normalizeSettings({ ...DEFAULT_GAME_SETTINGS, ...JSON.parse(storage?.getItem(GAME_SETTINGS_KEY) ?? '{}') });
  } catch { return { ...DEFAULT_GAME_SETTINGS }; }
}

export function writeGameSettings(settings, storage = globalThis.localStorage) {
  const validated = normalizeSettings({ ...DEFAULT_GAME_SETTINGS, ...settings });
  try { storage?.setItem(GAME_SETTINGS_KEY, JSON.stringify(validated)); } catch { /* Storage may be unavailable. */ }
  return validated;
}

export function resetGameSettings(storage = globalThis.localStorage) {
  return writeGameSettings(DEFAULT_GAME_SETTINGS, storage);
}

export function getRenderProfile(settings = readGameSettings()) {
  const quality = QUALITY[settings?.quality] ? settings.quality : DEFAULT_GAME_SETTINGS.quality;
  const scenery = SCENERY[settings?.scenery] ? settings.scenery : DEFAULT_GAME_SETTINGS.scenery;
  return { ...QUALITY[quality], quality, sceneryDensity: SCENERY[scenery], shadowsEnabled: Boolean(settings?.shadows), effectsEnabled: Boolean(settings?.effects) && quality !== 'low', showFps: Boolean(settings?.showFps) };
}

function clamp(value, min, max, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(max, Math.max(min, numeric)) : fallback;
}

function normalizeSettings(value) {
  if (!(value.quality in QUALITY)) value.quality = DEFAULT_GAME_SETTINGS.quality;
  if (!(value.scenery in SCENERY)) value.scenery = DEFAULT_GAME_SETTINGS.scenery;
  if (!['chase', 'hood', 'trackside', 'cockpit', 'overview'].includes(value.cameraMode)) value.cameraMode = DEFAULT_GAME_SETTINGS.cameraMode;
  value.shadows = value.shadows === true; value.effects = value.effects === true; value.showFps = value.showFps === true;
  value.orbitSensitivity = clamp(value.orbitSensitivity, 0.003, 0.02, DEFAULT_GAME_SETTINGS.orbitSensitivity);
  value.zoomSensitivity = clamp(value.zoomSensitivity, 0.3, 1.6, DEFAULT_GAME_SETTINGS.zoomSensitivity);
  return value;
}
