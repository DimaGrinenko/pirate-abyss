import type { TranslationKey } from './locale';

export const WIN_TIERS = ['big', 'super', 'mega', 'epic', 'legendary', 'max'] as const;
export type WinTier = typeof WIN_TIERS[number];
export type WinTierDefinition = {
  minimum: number;
  title: TranslationKey;
  subtitle: TranslationKey;
  countMs: number;
  entranceMs: number;
};
/** Presentation bands only: these do not affect game maths or celebration triggers. */
export const WIN_TIER_DETAILS: Record<WinTier, WinTierDefinition> = {
  big: { minimum: 20, title: 'БОЛЬШОЙ ВЫИГРЫШ', subtitle: 'Бочки полны золота!', countMs: 2300, entranceMs: 1600 },
  super: { minimum: 50, title: 'СУПЕРВЫИГРЫШ', subtitle: 'Краб поймал удачу!', countMs: 3200, entranceMs: 2100 },
  mega: { minimum: 100, title: 'МЕГАВЫИГРЫШ', subtitle: 'Сундук не удержать!', countMs: 4200, entranceMs: 2800 },
  epic: { minimum: 250, title: 'ЭПИЧЕСКИЙ ВЫИГРЫШ', subtitle: 'Кракен поднимает трофей!', countMs: 5200, entranceMs: 3400 },
  legendary: { minimum: 500, title: 'ЛЕГЕНДАРНЫЙ ВЫИГРЫШ', subtitle: 'Корабль несметных сокровищ!', countMs: 6400, entranceMs: 4200 },
  max: { minimum: 15000, title: 'МАКСИМАЛЬНЫЙ ВЫИГРЫШ', subtitle: 'Вся бездна празднует!', countMs: 7800, entranceMs: 5000 },
};
export function selectWinTier(value: number, bet: number, capped = false): WinTier {
  if (capped) return 'max';
  if (!Number.isFinite(value) || !Number.isFinite(bet) || value < 0 || bet <= 0) return 'big';
  const multiplier = value / bet;
  // Decimal currency can divide just below an exact threshold (35 / .07).
  const precision = Number.EPSILON * Math.max(1, Math.abs(multiplier)) * 4;
  for (const tier of [...WIN_TIERS].reverse()) if (multiplier + precision >= WIN_TIER_DETAILS[tier].minimum) return tier;
  return 'big';
}

/** Clamp display progress without rounding or altering the actual payout. */
export function countedWin(value: number, progress: number): number {
  if (progress >= 1) return value;
  return value * (1 - (1 - Math.max(0, progress)) ** 3);
}
