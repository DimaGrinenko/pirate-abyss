/** The column is uncovered in material order, without scaling its portraits.
 * Uses Spine track time so turbo, hidden tabs and GPU recovery share one clock. */
export const CURTAIN_COLUMN_ENTRANCE_SECONDS = .5;

export function reelCurtainEntranceProgress(animation: string | undefined, trackTime: number, animated: boolean) {
  const t = animation === 'reveal' && animated
    ? Math.max(0, Math.min(1, trackTime / CURTAIN_COLUMN_ENTRANCE_SECONDS)) : 1;
  // Show the upper hardware on the first painted pose. A cubic ease-out makes
  // the next frames visibly advance, instead of spending them almost clipped.
  return t < 1 ? .04 + .96 * (1 - (1 - t) ** 3) : 1;
}

export function applyReelCurtainEntrance(host: HTMLElement | null, animation: string | undefined, trackTime: number, animated: boolean) {
  if (!host) return;
  const progress = reelCurtainEntranceProgress(animation, trackTime, animated);
  const clip = progress < 1 ? `inset(0 0 ${((1 - progress) * 100).toFixed(3)}% 0)` : '';
  if (host.style.clipPath !== clip) host.style.clipPath = clip;
}
