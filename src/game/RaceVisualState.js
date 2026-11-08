const DAY = Object.freeze({
  day: Object.freeze({ daylight: 1, fog: 0.45, exposure: 1.08 }),
  sunset: Object.freeze({ daylight: 0.66, fog: 0.65, exposure: 0.9 }),
  night: Object.freeze({ daylight: 0.24, fog: 0.32, exposure: 0.66 }),
});
const WEATHER = Object.freeze({ dry: Object.freeze({ wetness: 0, rain: 0 }), wet: Object.freeze({ wetness: 0.58, rain: 0 }), rain: Object.freeze({ wetness: 1, rain: 1 }) });
const approach = (current, target, dt, seconds = 2.4) => current + (target - current) * (1 - Math.exp(-Math.max(0, dt) / seconds));

export class RaceVisualState {
  constructor() { this.dayPreset = 'day'; this.weatherPreset = 'dry'; this.state = { ...DAY.day, ...WEATHER.dry }; this.target = { ...this.state }; }
  setConditions({ day = this.dayPreset, weather = this.weatherPreset } = {}) {
    if (!DAY[day] || !WEATHER[weather]) throw new RangeError('Unknown time-of-day or weather preset.');
    this.dayPreset = day; this.weatherPreset = weather; this.target = { ...DAY[day], ...WEATHER[weather] };
  }
  update(dt) { for (const key of Object.keys(this.target)) this.state[key] = approach(this.state[key], this.target[key], dt); return { ...this.state }; }
  static dayPresets() { return Object.keys(DAY); }
  static weatherPresets() { return Object.keys(WEATHER); }
}
