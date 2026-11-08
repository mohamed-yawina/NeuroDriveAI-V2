# NeuroDrive — REDLINE

Original 132 BPM electro-racing cue generated specifically for NeuroDrive F1 Ultimate Edition.

- Asset: `neurodrive-redline.wav` (stereo PCM, 44.1 kHz, 16-bit, about 58 seconds).
- Arrangement: sparse four-bar opening, 28-bar electronic racing theme with D-minor harmony, bass, lead, kick, snare, hi-hats and a loop-boundary crossfade.
- Source renderer: `scripts/generate-redline-theme.mjs` (deterministic, no external samples or libraries).
- No third-party recording or commercial composition is used.
- Encoding: WAV is kept as the browser-ready source because the FFmpeg executable resolved outside the writable workspace and could not be invoked in the current sandbox. The browser can decode this file directly; a compressed OGG/MP3 export remains a packaging optimization.

Regenerate with:

```sh
node scripts/generate-redline-theme.mjs public/audio/neurodrive-redline.wav
```
