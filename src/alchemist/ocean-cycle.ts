/** Decorative light only. No wall-clock, result, wager or reward dependency. */
export const OCEAN_CYCLE_SECONDS = 274;
const smooth = (value: number) => { const x = Math.max(0, Math.min(1, value)); return x * x * (3 - 2 * x); };
export function oceanNightAmount(seconds: number) {
  const t = ((seconds % OCEAN_CYCLE_SECONDS) + OCEAN_CYCLE_SECONDS) % OCEAN_CYCLE_SECONDS;
  if (t < 120) return 0;
  if (t < 142) return smooth((t - 120) / 22);
  if (t < 252) return 1;
  return 1 - smooth((t - 252) / 22);
}
