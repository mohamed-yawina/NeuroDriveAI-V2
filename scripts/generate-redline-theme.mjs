import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Original NeuroDrive composition rendered offline without samples or third-party assets.
const output = resolve(process.argv[2] ?? resolve(dirname(fileURLToPath(import.meta.url)), '../public/audio/neurodrive-redline.wav'));
const sampleRate = 44100;
const bpm = 132;
const beat = 60 / bpm;
const bars = 32;
const duration = bars * 4 * beat;
const frames = Math.ceil(duration * sampleRate);
const mix = new Float32Array(frames * 2);
const progressions = [
  { root: 146.832, chord: [146.832, 174.614, 220], bass: 73.416 }, // Dm
  { root: 116.541, chord: [116.541, 146.832, 174.614], bass: 58.270 }, // Bb
  { root: 174.614, chord: [174.614, 220, 261.626], bass: 87.307 }, // F
  { root: 130.813, chord: [130.813, 164.814, 196], bass: 65.406 }, // C
];
const minorScale = [0, 2, 3, 5, 7, 8, 10, 12, 14, 15, 17, 19, 20, 22, 24];
const melody = [3, null, 5, 7, 5, null, 3, 5, 7, null, 8, 10, 12, null, 10, 7];
let noiseState = 0x52a1f00d;
const noise = () => {
  noiseState ^= noiseState << 13; noiseState ^= noiseState >>> 17; noiseState ^= noiseState << 5;
  return (noiseState >>> 0) / 0xffffffff * 2 - 1;
};
const clamp = (x) => Math.max(-1, Math.min(1, x));

function addVoice({ start, length, frequency, type, volume, pan = 0, attack = 0.008, release = 0.12, cutoff = 12000, detune = 0 }) {
  const first = Math.max(0, Math.floor(start * sampleRate));
  const count = Math.min(Math.floor(length * sampleRate), frames - first);
  if (count <= 0) return;
  const left = Math.sqrt((1 - pan) * 0.5), right = Math.sqrt((1 + pan) * 0.5);
  const alpha = 1 - Math.exp(-2 * Math.PI * cutoff / sampleRate);
  let filtered = 0, phase = 0, phase2 = 0, previousNoise = 0;
  for (let index = 0; index < count; index += 1) {
    const t = index / sampleRate;
    const remaining = length - t;
    const envelope = Math.min(1, t / Math.max(attack, 1 / sampleRate)) * Math.min(1, remaining / Math.max(release, 1 / sampleRate));
    const f = frequency * (1 + detune);
    phase += 2 * Math.PI * f / sampleRate;
    phase2 += 2 * Math.PI * f * 1.006 / sampleRate;
    let sample;
    if (type === 'saw') sample = (2 * (phase / (2 * Math.PI) % 1) - 1) * 0.68 + Math.sin(phase2) * 0.32;
    else if (type === 'triangle') sample = (2 / Math.PI) * Math.asin(Math.sin(phase));
    else if (type === 'square') sample = Math.sign(Math.sin(phase));
    else if (type === 'noise') {
      const white = noise();
      sample = white - previousNoise * 0.72;
      previousNoise = white;
    } else sample = Math.sin(phase);
    filtered += alpha * (sample - filtered);
    const value = Math.tanh(filtered * 1.35) * volume * envelope;
    const destination = (first + index) * 2;
    mix[destination] += value * left;
    mix[destination + 1] += value * right;
  }
}

function addKick(time, velocity = 1) {
  const length = 0.27, first = Math.floor(time * sampleRate), count = Math.floor(length * sampleRate);
  let phase = 0;
  for (let i = 0; i < count && first + i < frames; i += 1) {
    const t = i / sampleRate;
    const frequency = 43 + 105 * Math.exp(-t * 23);
    phase += 2 * Math.PI * frequency / sampleRate;
    const envelope = Math.exp(-t * 13.5);
    const sample = (Math.sin(phase) * 0.82 + Math.sin(phase * 2.01) * 0.18) * envelope * 0.53 * velocity;
    const destination = (first + i) * 2;
    mix[destination] += sample; mix[destination + 1] += sample;
  }
}

function addSnare(time, accent = 1) {
  addVoice({ start: time, length: 0.19, frequency: 185, type: 'sine', volume: 0.2 * accent, cutoff: 850, attack: 0.002, release: 0.16 });
  addVoice({ start: time, length: 0.22, frequency: 4200, type: 'noise', volume: 0.32 * accent, cutoff: 6800, attack: 0.001, release: 0.18, pan: -0.06 });
}

function chordPad(time, bar, chord) {
  const length = 4 * beat;
  chord.forEach((frequency, index) => {
    addVoice({ start: time, length, frequency, type: 'triangle', volume: 0.062, cutoff: 1300, attack: 0.28, release: 0.7, pan: (index - 1) * 0.42, detune: index === 0 ? -0.002 : index === 2 ? 0.002 : 0 });
    addVoice({ start: time, length, frequency: frequency * 2, type: 'sine', volume: 0.015, cutoff: 2600, attack: 0.42, release: 0.65, pan: (1 - index) * 0.25 });
  });
}

for (let bar = 0; bar < bars; bar += 1) {
  const start = bar * 4 * beat;
  const progressionIndex = bar < 4 ? Math.floor(bar / 2) : Math.floor((bar - 4) / 4) % 4;
  const harmony = progressions[progressionIndex];
  const intro = bar < 4;
  const breakdown = bar >= 20 && bar < 24;
  chordPad(start, bar, harmony.chord);

  if (!intro && !breakdown) {
    for (let b = 0; b < 4; b += 1) {
      const time = start + b * beat;
      addVoice({ start: time, length: beat * 0.84, frequency: harmony.bass, type: 'saw', volume: 0.22, cutoff: 560, attack: 0.006, release: 0.09, detune: b % 2 ? 0.003 : -0.002 });
      addVoice({ start: time, length: beat * 0.84, frequency: harmony.bass / 2, type: 'sine', volume: 0.16, cutoff: 220, attack: 0.004, release: 0.1 });
      if (b === 0 || b === 2) addKick(time, b === 0 ? 1 : 0.88);
      if (b === 1 || b === 3) addSnare(time, b === 3 ? 1 : 0.82);
      for (let half = 0; half < 2; half += 1) {
        const hatTime = time + half * beat / 2;
        if (bar % 2 || half === 0) addVoice({ start: hatTime, length: 0.045, frequency: 8000, type: 'noise', volume: half ? 0.045 : 0.07, cutoff: 10500, attack: 0.001, release: 0.04, pan: (bar + b + half) % 2 ? 0.35 : -0.35 });
      }
    }
  } else if (!intro) {
    for (let b = 0; b < 4; b += 1) {
      addVoice({ start: start + b * beat, length: beat * 0.8, frequency: harmony.bass, type: 'triangle', volume: 0.09, cutoff: 450, attack: 0.1, release: 0.2 });
    }
  }

  if (bar >= 2) {
    for (let step = 0; step < 16; step += 1) {
      const phraseStep = (bar * 4 + step) % melody.length;
      let degree = melody[phraseStep];
      if (degree === null) continue;
      if (bar >= 24 && step % 4 === 2) degree += 2;
      const octave = bar >= 8 && bar < 20 ? 2 : 1;
      const frequency = harmony.root * Math.pow(2, octave) * Math.pow(2, minorScale[degree] / 12);
      const time = start + step * beat / 4;
      const length = beat * (step % 4 === 0 ? 0.42 : 0.25);
      addVoice({ start: time, length, frequency, type: step % 4 === 0 ? 'saw' : 'triangle', volume: step % 4 === 0 ? 0.13 : 0.078, cutoff: 4100, attack: 0.008, release: length * 0.7, pan: step % 2 ? 0.18 : -0.18 });
      if (bar % 4 === 3 && (step === 6 || step === 14)) addVoice({ start: time + 0.12, length: 0.18, frequency: frequency * 1.5, type: 'sine', volume: 0.055, cutoff: 6000, attack: 0.006, release: 0.14, pan: 0.3 });
    }
  }
}

// Equal-power crossfade across the bar-aligned loop boundary.
const fadeFrames = Math.floor(sampleRate * 0.65);
for (let i = 0; i < fadeFrames; i += 1) {
  const t = i / fadeFrames;
  const tail = (frames - fadeFrames + i) * 2, head = i * 2;
  for (let channel = 0; channel < 2; channel += 1) {
    const beginning = mix[head + channel];
    mix[tail + channel] = mix[tail + channel] * Math.cos(t * Math.PI / 2) + beginning * Math.sin(t * Math.PI / 2);
  }
}

let peak = 0;
for (const value of mix) peak = Math.max(peak, Math.abs(value));
const gain = peak > 0 ? 0.88 / peak : 1;
const pcm = Buffer.alloc(frames * 4);
for (let i = 0; i < frames; i += 1) {
  pcm.writeInt16LE(Math.round(clamp(mix[i * 2] * gain) * 32767), i * 4);
  pcm.writeInt16LE(Math.round(clamp(mix[i * 2 + 1] * gain) * 32767), i * 4 + 2);
}
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
await mkdir(dirname(output), { recursive: true });
await writeFile(output, Buffer.concat([header, pcm]));
console.log(`Rendered original NeuroDrive — REDLINE at ${bpm} BPM: ${output} (${duration.toFixed(2)} s)`);
