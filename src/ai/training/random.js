export function createSeededRandom(seed = 1) {
  let state = Number(seed) >>> 0;
  if (state === 0) state = 0x6d2b79f5;
  const random = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  random.getState = () => state >>> 0;
  random.setState = (nextState) => {
    if (!Number.isInteger(nextState) || nextState <= 0 || nextState > 0xffffffff) {
      throw new RangeError('Random generator state must be a non-zero uint32.');
    }
    state = nextState >>> 0;
  };
  return random;
}
