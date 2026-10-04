import type { SpinResult } from '../engine';

export const MATH_MODES = ['base', 'bonushunt', 'catalysts', 'devastation', 'reckoning'] as const;
export type MathMode = typeof MATH_MODES[number];
/** Keep the original generator's five-mode set immutable. New math is isolated. */
export type PlayableMathMode = MathMode | 'captains_course';
export const PLAYABLE_MATH_MODES: readonly PlayableMathMode[] = [...MATH_MODES, 'captains_course'];
/** All payouts in this payload are multiples of one underlying base bet. */
export type UnitSpinResult = Omit<SpinResult, 'state'> & {
  state: Omit<SpinResult['state'], 'balance' | 'bet'>;
};
export interface MathSpinEvent {
  index: number;
  type: 'alchemistSpin';
  result: UnitSpinResult;
}
export interface MathBook {
  id: number;
  /** Integer hundredths of the underlying base bet, NOT of the mode cost. */
  payoutMultiplier: number;
  events: MathSpinEvent[];
}
export interface WeightedBook { book: MathBook; weight: number }
export interface LocalMathData {
  version: string;
  mode: MathMode;
  cost: number;
  totalWeight: number;
  entries: WeightedBook[];
}
export interface LocalMathCatalog {
  version: string;
  mode: MathMode;
  cost: number;
  totalWeight: number;
  pageSize: number;
  /** Contiguous book IDs start at 1; each row is [weight, payoutMultiplier]. */
  entries: [number, number][];
}
export interface MathIndex {
  modes: { name: MathMode; cost: number; events: string; weights: string }[];
}
