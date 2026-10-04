import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { CelebrationScreenProps } from './CelebrationScreen';
import { t, formatAmount as format } from './locale';
import { AlchemyButton } from './AlchemyButton';
import { AltarScene, type AltarSceneCue } from './AltarScene';
import { BonusVaultBackground } from './BonusVaultBackground';
import { getCompassCopy } from './compass-copy';
import { laboratoryAudio } from './audio';
import { countedWin } from './win-tiers';
import { formatBonusCount } from './bonus-countup';
import { bonusSummaryHasReward, BONUS_SUMMARY_COUNT_MS } from './altar-animation';
import { useCeremonyExit, usePresentationCount, usePresentationDeadline } from './presentation-hooks';
import { cabinBonusAction, canExitCabinBonus } from './cabin-bonus-presentation';
import './bonus-stage-v3.css';
import './bonus-vault-restore-v42.css';

/** The original vault composition: one hinged chest with its guardian on the
 * left, and accessible award text on the right. The host owns the round. */
export function CabinBonusPresentation({ currency = 'CR', celebration, bet, reducedMotion, transitioning = false,
  animationHeld = transitioning, timeScale = 1, onContinue, onReady }: CelebrationScreenProps) {
  const reducedForAward = useRef(reducedMotion);
  if (reducedMotion) reducedForAward.current = true;
  const motionDisabled = reducedForAward.current;
  const [ready, setReady] = useState(false);
  const readyDelivered = useRef(false);
  const [stageCue, setStageCue] = useState<AltarSceneCue>(motionDisabled ? 'settled' : 'arrival');
  const [skipCount, setSkipCount] = useState(false);
  const [exitRequested, setExitRequested] = useState(false);
  const [exiting, setExiting] = useState(false);
  const closed = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const presentationHeld = animationHeld || !ready || timeScale <= 0;
  const intro = celebration.kind === 'bonus-intro';
  const rewarded = bonusSummaryHasReward(celebration.value);
  const entranceDone = stageCue === 'settled' || motionDisabled;
  const countProgress = usePresentationCount(BONUS_SUMMARY_COUNT_MS, motionDisabled || intro || !rewarded,
    presentationHeld || stageCue === 'arrival', skipCount, timeScale);
  const countDone = countProgress >= 1;
  const shown = countDone ? celebration.value : countedWin(celebration.value, countProgress);
  const leave = () => { if (!closed.current) { closed.current = true; onContinue(); } };
  const completeExit = useCeremonyExit(exiting, presentationHeld, motionDisabled, leave, timeScale);
  // Native chest cues drive the text. A missing cue may never trap an award.
  usePresentationDeadline(5600, !entranceDone, presentationHeld, () => setStageCue('settled'), timeScale);
  useEffect(() => {
    if (canExitCabinBonus({ requested: exitRequested, intro, countDone, entranceDone })) setExiting(true);
  }, [exitRequested, intro, countDone, entranceDone]);
  useEffect(() => { if (!transitioning && ready) button.current?.focus(); }, [transitioning, ready]);
  const action = () => {
    const next = cabinBonusAction({ intro, countDone, transitioning, held: presentationHeld, exiting, exitRequested });
    if (next === 'reveal') setSkipCount(true);
    else if (next === 'exit') setExitRequested(true);
  };
  const title = intro ? celebration.mode === 'captains_course' ? getCompassCopy().title
    : celebration.mode === 'reckoning' ? t('Владыки бездны') : t('Проклятый рейд')
    : rewarded ? t('Ваша награда') : t('Итог рейда');
  const exact = t(rewarded ? 'Итоговый выигрыш: {p0} {p1}' : 'Итог рейда: {p0} {p1}', { p0: format(celebration.value), p1: currency });
  const rate = Number.isFinite(timeScale) ? Math.max(.01, Math.min(4, timeScale)) : 1;
  const multiplier = Number.isFinite(bet) && bet > 0 ? celebration.value / bet : undefined;

  return <div className={`celebration ceremony-screen bonus-stage-v3 bonus-vault-restored ${intro ? 'bonus-intro-scene' : 'bonus-end-scene'}`}
    data-bonus-mode={celebration.mode} data-bonus-reward={!intro && rewarded} data-count-complete={countDone}
    data-reduced-motion={motionDisabled} data-animation-held={presentationHeld} data-stage-exiting={exiting}
    data-scene-ready={ready} data-stage-cue={stageCue}
    style={{ '--bonus-motion-rate': rate } as CSSProperties}
    inert={transitioning || exiting || !ready} role="dialog" aria-modal="true"
    aria-labelledby="celebration-title" aria-describedby={intro ? 'cabin-bonus-result' : 'cabin-bonus-final'}
    onKeyDown={event => {
      if (event.key === 'Tab') { event.preventDefault(); button.current?.focus(); }
      if (event.key === 'Escape') { event.preventDefault(); action(); }
    }}>
    <BonusVaultBackground paused={presentationHeld || exiting} reducedMotion={motionDisabled} summary={!intro} timeScale={timeScale} />
    <div className={`bonus-stage-v3__layout ${celebration.mode === 'reckoning' ? 'bonus-stage-v3--gold' : ''}`}>
      <div className="bonus-stage-v3__art">
        <AltarScene variant={exiting ? 'exit' : intro ? 'intro' : 'summary'} animated={!motionDisabled}
          rewarded={intro || rewarded} held={presentationHeld} timeScale={timeScale}
          onReady={() => {
            if (readyDelivered.current) return;
            readyDelivered.current = true; setReady(true); onReady?.();
          }}
          onExitComplete={completeExit}
          onRewardEvent={cue => { if (rewarded && !motionDisabled) laboratoryAudio.chestBreakCue(cue); }}
          onCue={cue => {
            setStageCue(cue);
            if (intro && cue === 'opening' && !motionDisabled) laboratoryAudio.play('cast');
          }} />
      </div>
      <div className="bonus-stage-v3__copy">
        <header className="bonus-stage-v3__heading">
          <span>{intro ? t('БОНУС АКТИВИРОВАН') : celebration.capped ? t('Максимальный выигрыш') : t('РЕЙД ЗАВЕРШЁН')}</span>
          <h2 id="celebration-title">{title}</h2>
        </header>
        <div id="cabin-bonus-result" className={`bonus-stage-v3__result ${intro ? 'bonus-stage-v3__spins' : 'bonus-stage-v3__payout'}`}
          style={{ '--payout-length': Math.max(5, formatBonusCount(celebration.value, celebration.value).length) } as CSSProperties}>
          {intro ? <><strong>{celebration.value}</strong><span>{t('БЕСПЛАТНЫХ')}<br />{t('ВРАЩЕНИЙ')}</span></>
            : <><strong aria-hidden="true">{formatBonusCount(shown, celebration.value)}</strong><span>{currency}</span></>}
        </div>
        {!intro && <span id="cabin-bonus-final" className="bonus-stage-v3__sr" role="status" aria-live="polite" aria-atomic="true">{countDone ? exact : t('Считаем сокровища…')}</span>}
        <p className="bonus-stage-v3__caption">
          {intro ? celebration.mode === 'reckoning' ? <>{t('Сила пробуждённых владык')}<br />{t('сохраняется до конца бонуса.')}</>
            : <>{t('Больше Wild.')}<br />{t('Больше раскрытий.')}</>
            : multiplier !== undefined ? <><b>{format(multiplier)}×</b> {t('ставки')}</> : currency}
        </p>
        <AlchemyButton ref={button} className="bonus-stage-v3__action" variant={celebration.mode === 'reckoning' ? 'buy' : 'primary'}
          disabled={transitioning || presentationHeld || exiting || exitRequested || skipCount && !countDone} onClick={action}>
          {intro ? t('НАЧАТЬ') : countDone ? t('ПРОДОЛЖИТЬ') : t('ПОКАЗАТЬ ВЫИГРЫШ')}
        </AlchemyButton>
      </div>
    </div>
  </div>;
}

