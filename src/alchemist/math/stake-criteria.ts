import type { MathStatistics } from './statistics';

/** User-supplied September 22 dashboard limits, distinct from SDK warnings. */
export const STAKE_CRITERIA = {
  'two-star': { template: '500max_1cent', maxBet: 500, minBet: .01,
    maxExposure: 15_000_000, maxPayout: 50_000, maxBetCost: 100_000,
    cost: 1000, baseStd: 50, p5k: .01, p10k: .005,
    cvarPerStake: 700, cvarAbsolute: 20_000, etl40: .8, etl10k: .6, etlSum: 1.3 },
  'three-star': { template: '1kmax_1cent', maxBet: 1000, minBet: .01,
    maxExposure: 50_000_000, maxPayout: 100_000, maxBetCost: 500_000,
    cost: 2000, baseStd: 60, p5k: .05, p10k: .01,
    cvarPerStake: 700, cvarAbsolute: 50_000, etl40: .9, etl10k: .8, etlSum: 1.5 },
} as const;

export type StakeRating = keyof typeof STAKE_CRITERIA;
export type StakeMetric = 'maxExposure' | 'maxPayout' | 'maxBetCost' | 'cost' | 'baseStd'
  | 'p5k' | 'p10k' | 'cvarPerStake' | 'cvarAbsolute' | 'etl40' | 'etl10k' | 'etlSum';
export interface StakeCriteriaCheck {
  metric: StakeMetric;
  value: number;
  limit: number;
  unit: string;
  passed: boolean;
}

/**
 * X is a complete-round payout in base bets, c is the price of its mode.
 * Tail probabilities are FRACTIONS, never percentages or cost-scaled values.
 * CVaR takes exactly the worst 0.001 mass (fractional boundary atom).
 * ETLs follow the SDK's raw expectation units; conservatively checked in ALL modes.
 * Exposure and maximum price use the target template's maximum base bet.
 */
export function stakeCriteriaChecks(stats: MathStatistics, rating: StakeRating, baseStd: number): StakeCriteriaCheck[] {
  const limits = STAKE_CRITERIA[rating];
  const inputs: [StakeMetric, number, string][] = [
    ['maxExposure', stats.maxWin * limits.maxBet, 'currency units'],
    ['maxPayout', stats.maxWin, 'base bets'],
    ['maxBetCost', stats.cost * limits.maxBet, 'currency units'],
    ['cost', stats.cost, 'base bets'],
    ['baseStd', baseStd, 'base bets'],
    ['p5k', stats.prob5kUnscaled, 'probability fraction'],
    ['p10k', stats.prob10kUnscaled, 'probability fraction'],
    ['cvarPerStake', stats.fractionalCvar999, 'mode stakes'],
    ['cvarAbsolute', stats.fractionalCvar999BaseBet, 'base bets'],
    ['etl40', stats.etl40b, 'expected base bets'],
    ['etl10k', stats.etl10k, 'expected base bets'],
    ['etlSum', stats.etlSum, 'expected base bets'],
  ];
  return inputs.map(([metric, value, unit]) => ({ metric, value, unit, limit: limits[metric],
    passed: Number.isFinite(value) && value >= 0 && value <= limits[metric] }));
}
