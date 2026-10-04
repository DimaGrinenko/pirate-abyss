/** Pick only a server-provided stake; never synthesize a monetary amount. */
export function adjacentPurchaseBet(levels: readonly number[], current: number, direction: -1 | 1): number | null {
  if (!Number.isFinite(current) || current <= 0) return null;
  const candidates = levels.filter(value => Number.isFinite(value) && value > 0 && (direction < 0 ? value < current : value > current));
  return candidates.length ? direction < 0 ? Math.max(...candidates) : Math.min(...candidates) : null;
}
