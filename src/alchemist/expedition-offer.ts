import { BONUS_COST, FEATURE_COST, type BonusMode, type FeatureMode } from './engine';
import type { PlayableMathMode as MathMode } from './math/types';

export type ExpeditionChoice = { kind: 'feature'; mode: FeatureMode } | { kind: 'bonus'; mode: BonusMode };
export type ExpeditionContext = {
  bet: number; balance: number; allowedModes: readonly MathMode[]; allowBuyFeature: boolean; disabled: boolean;
};

/** UI quote only: all financial actions still go through the existing session. */
export function expeditionOffer(choice: ExpeditionChoice, context: ExpeditionContext, confirmedBet = context.bet) {
  const multiplier = choice.kind === 'bonus' ? BONUS_COST[choice.mode] : FEATURE_COST[choice.mode];
  const mode: MathMode = choice.mode === 'standard' ? 'base' : choice.mode;
  const cost = Math.round(context.bet * multiplier * 1_000_000) / 1_000_000;
  const validAmount = Number.isFinite(context.bet) && context.bet > 0 && Number.isFinite(context.balance) && context.balance >= 0;
  const available = context.allowedModes.includes(mode) && (choice.kind === 'feature' || context.allowBuyFeature);
  const affordable = validAmount && context.balance >= cost;
  const currentQuote = confirmedBet === context.bet;
  return {
    multiplier, cost, available, affordable, currentQuote,
    // Selecting a spin mode is free, even when the next spin cannot be afforded.
    canConfirm: validAmount && available && currentQuote && !context.disabled && (choice.kind === 'feature' || affordable),
  };
}
