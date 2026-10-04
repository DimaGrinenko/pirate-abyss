import type { MathMode } from './types';

/** Static books store integer hundredths of the underlying base bet. */
export interface MathStatisticsRow {
  payoutMultiplier: number;
  /** Use bigint or a decimal string above Number.MAX_SAFE_INTEGER. */
  weight: number | bigint | string;
}

export interface MathStatistics {
  cost: number;
  rows: number;
  positiveWeightRows: number;
  distinctPayouts: number;
  /** Exact integer aggregates; strings also make the report JSON serializable. */
  exact: {
    totalWeight: string;
    weightedPayoutHundredths: string;
    weightedSquaredPayoutHundredths: string;
    varianceNumerator: string;
  };
  /** All three quantities below use units of the underlying base bet. */
  meanBaseBet: number;
  varianceBaseBet: number;
  stdBaseBet: number;
  /** Mean, variance and standard deviation of payout / actual mode cost. */
  rtp: number;
  variance: number;
  std: number;
  hitProbability: number;
  zeroProbability: number;
  /** Net loss: payout < mode cost. Includes zero and partial returns. */
  lossProbability: number;
  profitProbability: number;
  breakEvenProbability: number;
  mostLikelyBookProbability: number;
  minWin: number;
  /** Attainable maximum, ignoring zero-weight rows, in base-bet units. */
  maxWin: number;
  maxWinNormalized: number;
  maxWinProbability: number;
  maxWinHitRate: number;
  prob5kUnscaled: number;
  prob10kUnscaled: number;
  probabilityScale: number;
  /** Official SDK probabilities after its mode-cost leniency scaling. */
  prob5k: number;
  prob10k: number;
  /** RAW base-bet expectations, exactly as in SDK; NOT divided by cost. */
  etl40b: number;
  etl10k: number;
  /** Sum of the two raw SDK expectations; overlapping upper tails count twice. */
  etlSum: number;
  quantile999BaseBet: number;
  sdkTailProbability: number;
  /** SDK's tie-inclusive conditional mean at/above its 99.9% quantile. */
  cvarBaseBet: number;
  cvar: number;
  /** True worst 0.1% mean: only the needed mass of the boundary tie. */
  fractionalCvar999BaseBet: number;
  fractionalCvar999: number;
}

const UINT64_MAX = (1n << 64n) - 1n;
const HUNDRED = 100n;
const THOUSAND = 1000n;

function integerWeight(weight: MathStatisticsRow['weight']): bigint {
  if (typeof weight === 'number' && (!Number.isSafeInteger(weight) || weight < 0)) {
    throw new RangeError('Weight must be a non-negative safe integer; use a decimal string or bigint for uint64.');
  }
  if (typeof weight === 'string' && !/^\d+$/.test(weight)) {
    throw new RangeError('Weight must be an unsigned decimal integer.');
  }
  const value = BigInt(weight);
  if (value < 0n || value > UINT64_MAX) throw new RangeError('Weight exceeds uint64 range.');
  return value;
}

/** Represent the supplied decimal cost exactly for payout comparisons. */
function decimalFraction(value: number): [bigint, bigint] {
  const [mantissa, exponent = '0'] = value.toString().toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const shift = Number(exponent) - fraction.length;
  const digits = BigInt(whole + fraction);
  return shift >= 0 ? [digits * 10n ** BigInt(shift), 1n] : [digits, 10n ** BigInt(-shift)];
}

function ratio(numerator: bigint, denominator: bigint): number {
  return Number(numerator) / Number(denominator);
}

/**
 * Exhaustive weighted statistics, not estimates from additional random draws.
 * All aggregation, variance cancellation and tail membership use integers;
 * only the returned presentation values are rounded to IEEE-754 numbers.
 * Payout step-of-ten is a publish-format constraint, checked by the exporter.
 */
export function mathStatistics(rows: readonly MathStatisticsRow[], cost: number): MathStatistics {
  if (!Number.isFinite(cost) || cost <= 0) throw new RangeError('Mode cost must be finite and positive.');
  const [costNumerator, costDenominator] = decimalFraction(cost);
  const support = new Map<number, bigint>();
  let total = 0n, first = 0n, second = 0n, largestWeight = 0n;
  let positiveWeightRows = 0;
  for (const row of rows) {
    if (!Number.isSafeInteger(row.payoutMultiplier) || row.payoutMultiplier < 0) {
      throw new RangeError('payoutMultiplier must be a non-negative safe integer in hundredths of a base bet.');
    }
    const weight = integerWeight(row.weight);
    if (weight === 0n) continue;
    const payout = BigInt(row.payoutMultiplier);
    positiveWeightRows++;
    total += weight;
    if (total > UINT64_MAX) throw new RangeError('Sum of weights exceeds uint64 range.');
    first += weight * payout;
    second += weight * payout * payout;
    if (weight > largestWeight) largestWeight = weight;
    support.set(row.payoutMultiplier, (support.get(row.payoutMultiplier) ?? 0n) + weight);
  }
  if (total === 0n) throw new RangeError('At least one positive-weight outcome is required.');

  const sorted = [...support.entries()].sort(([a], [b]) => a - b);
  let zero = 0n, losses = 0n, profits = 0n, equal = 0n;
  let weights5k = 0n, weights10k = 0n, expectation40 = 0n, expectation10k = 0n;
  let cumulative = 0n;
  let quantile: number | undefined;
  for (const [payoutNumber, weight] of sorted) {
    const payout = BigInt(payoutNumber);
    const comparison = payout * costDenominator - HUNDRED * costNumerator;
    if (comparison < 0n) losses += weight;
    else if (comparison > 0n) profits += weight;
    else equal += weight;
    if (payout === 0n) zero += weight;
    if (payout >= 500_000n) weights5k += weight;
    if (payout >= 1_000_000n) {
      weights10k += weight;
      expectation10k += payout * weight;
    }
    if (payout * costDenominator >= 4000n * costNumerator) expectation40 += payout * weight;
    cumulative += weight;
    if (quantile === undefined && cumulative * THOUSAND >= 999n * total) quantile = payoutNumber;
  }

  let sdkTailWeight = 0n, sdkTailPayout = 0n;
  for (const [payout, weight] of sorted) {
    if (payout >= quantile!) {
      sdkTailWeight += weight;
      sdkTailPayout += BigInt(payout) * weight;
    }
  }
  // Measure mass in 1/1000-weight units. The worst 0.1% has exactly total
  // such units, even when totalWeight is indivisible by 1000.
  let remainingTail = total, fractionalTailPayout = 0n;
  for (let i = sorted.length - 1; i >= 0 && remainingTail > 0n; i--) {
    const [payout, weight] = sorted[i];
    const available = weight * THOUSAND;
    const taken = available < remainingTail ? available : remainingTail;
    fractionalTailPayout += BigInt(payout) * taken;
    remainingTail -= taken;
  }

  const varianceNumerator = second * total - first * first;
  const meanBaseBet = ratio(first, total * HUNDRED);
  const varianceBaseBet = ratio(varianceNumerator, total * total * HUNDRED * HUNDRED);
  const stdBaseBet = Math.sqrt(varianceBaseBet);
  const [maxPayout, maxWeight] = sorted[sorted.length - 1];
  const probabilityScale = cost >= 1000 ? 0.2 : cost >= 500 ? 0.5 : cost >= 200 ? 0.8 : 1;
  const prob5kUnscaled = ratio(weights5k, total);
  const prob10kUnscaled = ratio(weights10k, total);
  const cvarBaseBet = ratio(sdkTailPayout, sdkTailWeight * HUNDRED);
  const fractionalCvar999BaseBet = ratio(fractionalTailPayout, total * HUNDRED);
  return {
    cost, rows: rows.length, positiveWeightRows, distinctPayouts: support.size,
    exact: {
      totalWeight: total.toString(), weightedPayoutHundredths: first.toString(),
      weightedSquaredPayoutHundredths: second.toString(), varianceNumerator: varianceNumerator.toString(),
    },
    meanBaseBet, varianceBaseBet, stdBaseBet,
    rtp: meanBaseBet / cost, variance: varianceBaseBet / cost / cost, std: stdBaseBet / cost,
    hitProbability: ratio(total - zero, total), zeroProbability: ratio(zero, total),
    lossProbability: ratio(losses, total), profitProbability: ratio(profits, total),
    breakEvenProbability: ratio(equal, total), mostLikelyBookProbability: ratio(largestWeight, total),
    minWin: sorted[0][0] / 100, maxWin: maxPayout / 100, maxWinNormalized: maxPayout / 100 / cost,
    maxWinProbability: ratio(maxWeight, total), maxWinHitRate: ratio(total, maxWeight),
    prob5kUnscaled, prob10kUnscaled, probabilityScale,
    prob5k: prob5kUnscaled * probabilityScale, prob10k: prob10kUnscaled * probabilityScale,
    etl40b: ratio(expectation40, total * HUNDRED), etl10k: ratio(expectation10k, total * HUNDRED),
    etlSum: ratio(expectation40 + expectation10k, total * HUNDRED),
    quantile999BaseBet: quantile! / 100, sdkTailProbability: ratio(sdkTailWeight, total),
    cvarBaseBet, cvar: cvarBaseBet / cost,
    fractionalCvar999BaseBet, fractionalCvar999: fractionalCvar999BaseBet / cost,
  };
}

export interface GuardrailViolation {
  metric: 'rtp' | 'prob5k' | 'prob10k' | 'etl40b' | 'etl10k' | 'etlSum' | 'std' | 'prob5kUnscaled' | 'cvar' | 'fractionalCvar999';
  value: number;
  limit: number;
  kind: 'sdk-three-star' | 'conservative-tail' | 'platform-two-star' | 'platform-three-star';
}

/** Rating/design guardrails, NOT a claim of hard platform approval limits. */
export function sdkGuardrailViolations(stats: MathStatistics): GuardrailViolation[] {
  const limits = { prob5k: 0.01, prob10k: 0.005, etl40b: 0.9, etl10k: 0.8, cvar: 800, rtp: 0.967 } as const;
  const result: GuardrailViolation[] = [];
  for (const metric of Object.keys(limits) as (keyof typeof limits)[]) {
    const value = stats[metric], limit = limits[metric];
    // Match Python math.isclose(..., rel_tol=1e-9) for RTP only.
    const withinRtpResidue = metric === 'rtp' && Number.isFinite(value)
      && Math.abs(value - limit) <= 1e-9 * Math.max(Math.abs(value), limit);
    if (!Number.isFinite(value) || (value > limit && !withinRtpResidue)) {
      result.push({ metric, value, limit, kind: 'sdk-three-star' });
    }
  }
  if (!Number.isFinite(stats.fractionalCvar999) || stats.fractionalCvar999 > 800) {
    result.push({ metric: 'fractionalCvar999', value: stats.fractionalCvar999, limit: 800, kind: 'conservative-tail' });
  }
  return result;
}

/** Known dashboard criteria supplied on 2026-09-07, distinct from SDK warnings.
 * ETL/SD limits are established for base only. Cost must never scale P(X>=5000).
 * This is deliberately not presented as an exhaustive platform approval policy.
 */
export const PLATFORM_RATING_LIMITS = {
  'two-star': { etl40b: .8, etl10k: .6, etlSum: 1.3, std: 50, prob5kUnscaled: .01 },
  'three-star': { etl40b: .9, etl10k: .8, etlSum: 1.5, std: 60, prob5kUnscaled: .05 },
} as const;
export type PlatformRating = keyof typeof PLATFORM_RATING_LIMITS;
export interface PlatformRatingCheck {
  metric: keyof typeof PLATFORM_RATING_LIMITS['two-star'];
  value: number;
  limit: number;
  passed: boolean;
}

export function platformRatingChecks(stats: MathStatistics, mode: MathMode, rating: PlatformRating): PlatformRatingCheck[] {
  const limits = PLATFORM_RATING_LIMITS[rating];
  const metrics: PlatformRatingCheck['metric'][] = mode === 'base'
    ? ['etl40b', 'etl10k', 'etlSum', 'std', 'prob5kUnscaled'] : ['prob5kUnscaled'];
  return metrics.map(metric => ({ metric, value: stats[metric], limit: limits[metric],
    passed: Number.isFinite(stats[metric]) && stats[metric] <= limits[metric] }));
}

export function guardrailViolations(stats: MathStatistics, mode: MathMode, targetRating: PlatformRating = 'two-star'): GuardrailViolation[] {
  const violations = sdkGuardrailViolations(stats);
  // A three-star release may intentionally exceed the narrower two-star SD.
  // Keep the legacy default for callers that explicitly retain that profile.
  for (const rating of targetRating === 'two-star' ? ['two-star', 'three-star'] as const : ['three-star'] as const) {
    for (const check of platformRatingChecks(stats, mode, rating)) {
      if (!check.passed) violations.push({ metric: check.metric, value: check.value,
        limit: check.limit, kind: `platform-${rating}` });
    }
  }
  return violations;
}
