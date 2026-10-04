import { formatAmount, formatNumber } from './locale';

/** Match the final payout precision so intermediate digits never widen the layout. */
export function formatBonusCount(value: number, finalValue: number): string {
  // Use the actual RU/EN display, not toFixed: very large values can otherwise
  // expose binary floating-point tails that Intl deliberately rounds away.
  const fraction = formatAmount(finalValue).match(/[.,](\d+)$/)?.[1] ?? '';
  const digits = Math.max(2, fraction.length);
  return formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
