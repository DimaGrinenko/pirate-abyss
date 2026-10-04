/** Matches the number reveal in retrigger-award.css. Split the existing hold;
 * never add another delay to a completed bonus spin. */
export function retriggerAwardTiming(durationMs: number, reducedMotion: boolean) {
  const total = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
  const collectMs = reducedMotion ? 0 : Math.round(total * .31);
  return { collectMs, readMs: total - collectMs };
}

/** The authoritative result already contains these spins. This subtracts only
 * the not-yet-presented award from a display value, never from GameState. */
export function visibleFreeSpins(actual: number, pendingAward: number) {
  return Math.max(0, actual - Math.max(0, pendingAward));
}

/** Cancellation before collection cannot leak a late increment into another
 * spin. The owner still clears its display override in its finally block. */
export async function presentRetriggerAward(
  durationMs: number,
  reducedMotion: boolean,
  wait: (milliseconds: number) => Promise<boolean>,
  collected: () => void,
) {
  const timing = retriggerAwardTiming(durationMs, reducedMotion);
  if (timing.collectMs > 0 && !await wait(timing.collectMs)) return false;
  collected();
  return timing.readMs > 0 ? wait(timing.readMs) : true;
}
