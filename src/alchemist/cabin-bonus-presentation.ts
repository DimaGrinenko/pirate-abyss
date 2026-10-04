/** Presentation decisions cannot advance a financial round. The host retains
 * ownership of starting/continuing the bonus through the single exit callback. */
export type CabinBonusAction = 'blocked' | 'reveal' | 'exit';

export function cabinBonusAction(input: {
  intro: boolean; countDone: boolean; transitioning: boolean; held: boolean;
  exiting: boolean; exitRequested: boolean;
}): CabinBonusAction {
  if (input.transitioning || input.held || input.exiting || input.exitRequested) return 'blocked';
  return !input.intro && !input.countDone ? 'reveal' : 'exit';
}

export function canExitCabinBonus(input: {
  requested: boolean; intro: boolean; countDone: boolean; entranceDone: boolean;
}): boolean {
  return input.requested && input.entranceDone && (input.intro || input.countDone);
}

export const CABIN_BONUS_ENTRANCE_MS = 820;
