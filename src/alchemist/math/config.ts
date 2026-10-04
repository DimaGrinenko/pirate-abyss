import type { MathMode, PlayableMathMode } from './types';

export const MATH_VERSION = 'alchemist-extreme-v4';
export const TARGET_RTP = 0.96;
export const PAYOUT_SCALE = 100;
export const WEIGHT_SCALE = 1_000_000_000_000_000;
export const MODE_COST: Record<MathMode, number> = {
  base: 1, bonushunt: 3, catalysts: 60, devastation: 100, reckoning: 200,
};
export const SESSION_MODE_COST: Record<PlayableMathMode, number> = { ...MODE_COST, captains_course: 100 };
/** Frequencies are design constraints, not claimed to be Hacksaw's frequencies. */
export const NATURAL_BONUS_PROBABILITY = { devastation: 1 / 1600, reckoning: 1 / 16000 } as const;
export const BONUS_HUNT_FACTOR = 5;
