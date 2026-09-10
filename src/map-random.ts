// Separate map randomness from combat and loot rolls; seeds can reproduce a failed run.
export function mapRandom(seed: number) {
  return () => {
    seed = seed + 0x6d2b79f5 | 0;
    let value = Math.imul(seed ^ seed >>> 15, seed | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
let previousSeed = 0;
export function nextMapSeed() {
  const seed = globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ?? Math.floor(Math.random() * 4294967296);
  previousSeed = seed === previousSeed ? (seed + 1) >>> 0 : seed;
  return previousSeed;
}
export function shuffled<T>(values: readonly T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
