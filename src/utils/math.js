export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const wrapIndex = (index, length) => ((index % length) + length) % length;
export const formatTime = (seconds) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
