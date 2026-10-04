import { t, formatAmount as format } from './locale';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { SpineEffects } from './SpineEffects';
import { BonusVaultBackground } from './BonusVaultBackground';
import { AlchemyButton } from './AlchemyButton';
import type { BonusMode } from './engine';
import { laboratoryAudio } from './audio';
import { countedWin, selectWinTier, WIN_TIER_DETAILS } from './win-tiers';
import { formatBonusCount } from './bonus-countup';
import { WinAmount, WinTitle } from './WinTypography';
import { WinScenery } from './PresentationScenery';
import { CabinBonusPresentation } from './CabinBonusPresentation';
import { usePresentationCount, usePresentationDeadline, useCeremonyExit } from './presentation-hooks';
import './ceremony.css';
import './win-celebrations.css';
import './ceremony-lifecycle.css';
import './win-typography-v13.css';
import './celebration-motion.css';

export type Celebration = { kind: 'win' | 'bonus-intro' | 'bonus-end'; value: number; mode?: BonusMode; capped?: boolean };

function WinCelebration({ currency, celebration, bet, reducedMotion, transitioning, animationHeld, timeScale, onContinue, onReady }: {
  currency: string; celebration: Celebration; bet: number; reducedMotion: boolean; transitioning: boolean; animationHeld: boolean; timeScale: number; onContinue: () => void; onReady?: () => void;
}) {
  const tier = selectWinTier(celebration.value, bet, celebration.capped);
  const details = WIN_TIER_DETAILS[tier];
  const [skip, setSkip] = useState(false);
  const [rendererReady, setRendererReady] = useState(false);
  const readyDelivered = useRef(false);
  const presentationHeld = animationHeld || !rendererReady || timeScale <= 0;
  // The count shares the first painted frame with the native award.
  const [countStarted, setCountStarted] = useState(true);
  const [entranceDone, setEntranceDone] = useState(reducedMotion);
  const [exiting, setExiting] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);
  const closed = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const progress = usePresentationCount(details.countMs, reducedMotion, presentationHeld || !countStarted, skip, timeScale);
  const finished = progress >= 1;
  const shown = finished ? celebration.value : countedWin(celebration.value, progress);
  const amount = format(celebration.value);
  const scenePhase = exiting ? 'exit' : finished && entranceDone ? 'celebrate' : 'entrance';
  usePresentationDeadline(details.entranceMs + 2200, !entranceDone && !reducedMotion, presentationHeld, () => { setEntranceDone(true); setCountStarted(true); }, timeScale);
  useEffect(() => { if (!transitioning && rendererReady) button.current?.focus(); }, [transitioning, rendererReady]);
  function leave() {
    if (closed.current) return;
    closed.current = true;
    onContinue();
  }
  const completeExit = useCeremonyExit(exiting, presentationHeld, reducedMotion, leave, timeScale);
  useEffect(() => {
    if (exitRequested && (entranceDone || reducedMotion) && finished) setExiting(true);
  }, [exitRequested, entranceDone, reducedMotion, finished]);
  function sceneComplete() {
    if (scenePhase === 'exit') completeExit();
    else if (scenePhase === 'entrance') { setEntranceDone(true); setCountStarted(true); }
  }
  function action() {
    if (transitioning || presentationHeld || exiting || exitRequested) return;
    if (!finished) { setCountStarted(true); setSkip(true); }
    else setExitRequested(true);
  }
  return <div className={`celebration big-win-scene win-celebration win-tier--${tier}`} data-win-tier={tier} data-count-complete={finished} data-count-skipping={skip && !finished} data-reduced-motion={reducedMotion} data-stage-exiting={exiting} data-scene-ready={rendererReady} data-animation-held={presentationHeld} inert={transitioning || exiting || !rendererReady}
    onKeyDown={event => {
      if (event.key === 'Tab') { event.preventDefault(); button.current?.focus(); }
      if (event.key === 'Escape') { event.preventDefault(); action(); }
    }} role="dialog" aria-modal="true" aria-labelledby="celebration-title" aria-describedby="win-final-amount">
    <BonusVaultBackground paused={presentationHeld || exiting} reducedMotion={reducedMotion} summary timeScale={timeScale} />
    <div className="celebration-vfx"><SpineEffects kind="bigwin" tier={tier} phase={scenePhase} paused={presentationHeld} timeScale={timeScale} reducedMotion={reducedMotion} onReady={() => { if (readyDelivered.current) return; readyDelivered.current = true; setRendererReady(true); onReady?.(); }} onComplete={sceneComplete} onEvent={cue => { if (cue === 'impact') setCountStarted(true); laboratoryAudio.bigwinCue(tier, cue); }} /></div>
    <WinScenery tier={tier} timeScale={timeScale} />
    <div className="celebration-copy win-celebration__copy" style={{ '--count-duration': `${details.countMs}ms`, '--amount-chars': Math.max(5, amount.length) } as CSSProperties}>
      <span className="win-celebration__story">{t(details.subtitle)}</span>
      <WinTitle text={t(details.title)} tier={tier} />
      <WinAmount shown={formatBonusCount(shown, celebration.value)} final={formatBonusCount(celebration.value, celebration.value)} />
      <p id="win-final-amount" className="win-celebration__exact" role="status" aria-live="polite" aria-atomic="true">{finished ? t('Итоговый выигрыш: {p0} {p1}', { p0: amount, p1: currency }) : t('Считаем сокровища…')}</p>
      <span className="win-celebration__currency">{currency}</span>
      <p className="win-celebration__multiplier" aria-label={t('Выигрыш {p0}× ставки', { p0: format(celebration.value / bet) })}><b>{format(celebration.value / bet)}×</b> <span>{t('ставки')}</span></p>
      <AlchemyButton ref={button} className="celebration-continue win-celebration__continue" disabled={transitioning || presentationHeld || exiting || exitRequested || skip && !finished} onClick={action} aria-label={!finished ? t('Показать итоговый выигрыш') : t('ПРОДОЛЖИТЬ')}>{finished ? t('ПРОДОЛЖИТЬ') : t('ПОКАЗАТЬ ВЫИГРЫШ')}</AlchemyButton>
    </div>
  </div>;
}

export type CelebrationScreenProps = { currency?: string; celebration: Celebration; bet: number; reducedMotion: boolean; transitioning?: boolean; animationHeld?: boolean; timeScale?: number; onContinue: () => void; onReady?: () => void };

export function CelebrationScreen(props: CelebrationScreenProps) {
  useEffect(() => () => laboratoryAudio.stopCeremonyEffects(), [props.celebration.kind, props.celebration.value]);
  const { currency = 'CR', celebration, bet, reducedMotion, transitioning = false, animationHeld = transitioning, timeScale = 1, onContinue } = props;
  if (celebration.kind === 'win') return <WinCelebration key={`${celebration.value}:${bet}:${celebration.capped}`} currency={currency} celebration={celebration} bet={bet} reducedMotion={reducedMotion} transitioning={transitioning} animationHeld={animationHeld} timeScale={timeScale} onContinue={onContinue} onReady={props.onReady} />;
  return <CabinBonusPresentation key={`${celebration.kind}:${celebration.mode}:${celebration.value}`} {...props} />;
}


