/** Seeded PRNG (mulberry32). The sim never uses Math.random, so a seed + inputs replays exactly. */

export interface Rng {
  s: number;
}

export function nextFloat(rng: Rng): number {
  rng.s = (rng.s + 0x6d2b79f5) | 0;
  let t = rng.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const nextRange = (rng: Rng, lo: number, hi: number): number => lo + (hi - lo) * nextFloat(rng);

export const nextInt = (rng: Rng, n: number): number => Math.floor(nextFloat(rng) * n);

/** Approximately normal, mean 0, sd 1. */
export function nextGauss(rng: Rng): number {
  const u = Math.max(nextFloat(rng), 1e-9);
  const v = nextFloat(rng);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
