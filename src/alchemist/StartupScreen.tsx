import { t } from './locale';
import { Character } from './Character';
import { ChemicalSymbol } from './ChemicalSymbol';
import { AlchemyButton } from './AlchemyButton';
import { assetUrl } from './assets';
import { WelcomeFeatureAmbience } from './PresentationScenery';
import { LoadingTreasure } from './LoadingTreasure';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { StartupProgress } from './startup-progress';
import './startup-loading-flow.css';
import './startup-interface-v35.css';
import './welcome-layout-v42.css';

const ASSET_BASE = assetUrl('alchemist/');

export function StartupScreen({ sessionMode = 'local', errorMessage, progress, failed, onStart, onRetry, reducedMotion = false }: { errorMessage?: string; sessionMode?: 'local' | 'server' | 'replay'; progress: number; failed: boolean; onStart: () => void; onRetry: () => void; reducedMotion?: boolean }) {
  const assetsReady = progress >= 100 && !failed;
  const welcome = useRef<HTMLDivElement>(null);
  const [mountedUnits, setMountedUnits] = useState(0);
  const [preparedUnits, setPreparedUnits] = useState(0);
  const [ready, setReady] = useState(false);
  const [preparationFailed, setPreparationFailed] = useState(false);
  const blocked = failed || preparationFailed;

  useEffect(() => { if (assetsReady) setMountedUnits(count => Math.max(1, count)); }, [assetsReady]);
  useEffect(() => {
    if (!assetsReady || mountedUnits === 0 || mountedUnits <= preparedUnits) return;
    const element = welcome.current;
    if (!element) return;
    let disposed = false, advancing = false, fallbackAllowed = false, failureAllowed = false, frame = 0;
    const selectors = ['[data-spine-character]', '[data-spine-background]', '[data-spine="wild-blue"]', '[data-spine="wild-red"]', '[data-spine="wild-green"]', '[data-spine="scatter"]'];
    const index = mountedUnits - 1;
    // The welcome uses the persistent world behind it instead of creating a
    // second background renderer. Keep waiting for that world's actual paint.
    const backgroundElement = index === 1 ? element.closest('.game-shell')?.querySelector<HTMLElement>(':scope > .environment') : null;
    const fallbackSelector = index === 0 ? '[data-character-fallback]' : index === 1 ? '.entry-backdrop' : `.chemical-symbol:has(${selectors[index]}) .chemical-symbol__fallback`;
    const backgroundFallback = index === 1 ? new Image() : null;
    if (backgroundFallback) backgroundFallback.src = `${ASSET_BASE}environment/laboratory-walls-v43.webp`;
    const complete = () => {
      if (advancing || disposed || document.hidden) return;
      advancing = true;
      // Let the first renderer paint, then yield a full frame before another mount.
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => {
        if (disposed) return;
        setPreparationFailed(false);
        setPreparedUnits(mountedUnits);
        if (mountedUnits < selectors.length) setMountedUnits(mountedUnits + 1);
        else setReady(true);
      }); });
    };
    const inspect = () => {
      if (document.hidden || disposed || advancing) return;
      const node = (index === 1 ? backgroundElement : element)?.querySelector<HTMLElement>(selectors[index]);
      const drawn = index === 0 ? node?.dataset.spineCharacter === 'ready' : index === 1 ? node?.dataset.spineBackground === 'ready' : node?.dataset.spineReady === 'true';
      if (drawn) { complete(); return; }
      if (!fallbackAllowed) return;
      const fallback = index === 1 ? backgroundFallback : element.querySelector<HTMLImageElement>(fallbackSelector);
      if (fallback instanceof HTMLImageElement && fallback.complete && fallback.naturalWidth > 0) {
        // Unsupported renderer: a real decoded fallback is usable, not an estimated ready signal.
        void fallback.decode().then(complete).catch(() => { if (failureAllowed) setPreparationFailed(true); });
      } else if (failureAllowed) {
        setPreparationFailed(true);
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-spine-character', 'data-spine-background', 'data-spine-ready', 'data-spine-error'] });
    if (backgroundElement) observer.observe(backgroundElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-spine-background', 'data-spine-error'] });
    element.addEventListener('load', inspect, true);
    backgroundFallback?.addEventListener('load', inspect);
    document.addEventListener('visibilitychange', inspect);
    const fallbackTimer = window.setTimeout(() => { fallbackAllowed = true; inspect(); }, 1800);
    const failureTimer = window.setTimeout(() => { failureAllowed = true; inspect(); }, 10000);
    inspect();
    return () => { disposed = true; observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(fallbackTimer); clearTimeout(failureTimer); element.removeEventListener('load', inspect, true); backgroundFallback?.removeEventListener('load', inspect); document.removeEventListener('visibilitychange', inspect); };
  }, [assetsReady, mountedUnits, preparedUnits]);
  useEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => welcome.current?.querySelector<HTMLButtonElement>('.entry-start')?.focus());
    return () => cancelAnimationFrame(frame);
  }, [ready]);
  const focusButton = (event: KeyboardEvent<HTMLDivElement>) => { if (event.key === 'Tab') { event.preventDefault(); event.currentTarget.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus(); } };
  const displayTarget = Math.max(0, Math.min(100, progress)) * .94 + preparedUnits;

  return <>
  {assetsReady && <div ref={welcome} className={`laboratory-entry entry-ready entry-welcome ${reducedMotion ? 'entry-static' : ''}`} data-preparing={!ready} inert={!ready} aria-hidden={!ready || undefined} onKeyDown={focusButton} role="dialog" aria-modal={ready || undefined} aria-label={t("Добро пожаловать в Пиратскую бездну")}>
    <div className="entry-backdrop" />
    <div className="entry-layout">
      <div className="entry-professor">{mountedUnits >= 1 && <Character mood="idle" reducedMotion={reducedMotion} paused={!ready} />}</div>
      <div className="entry-content">
        <img className="entry-logo" src={`${ASSET_BASE}ui/logo.webp?v=cartoon12`} alt={t("Пиратская бездна")} />
          <div className="entry-features">
            <section className="entry-feature">
              <WelcomeFeatureAmbience variant="lords" />
              {/* Continuous idle keeps the pose alive without replaying a payout.
                  The existing raster light guides attention between cards. */}
              <div className="entry-symbols entry-wilds">{mountedUnits >= 3 && <ChemicalSymbol id="wild" wildType="blue" animation="idle" timeScale={.8} animated={!reducedMotion} active={ready} />}{mountedUnits >= 4 && <ChemicalSymbol id="wild" wildType="red" animation="idle" timeScale={.8} animated={!reducedMotion} active={ready} />}</div>
              <h2>{t("Четыре владыки")}</h2><p>{t("Шторм, Корсар, Капитан и Кракен.")}<br />{t("Их Wild-множители складываются.")}</p>
            </section>
            <section className="entry-feature">
              <WelcomeFeatureAmbience variant="reel" />
              <div className="entry-symbols entry-scatter">{mountedUnits >= 5 && <ChemicalSymbol id="wild" wildType="green" animation="idle" timeScale={.8} animated={!reducedMotion} active={ready} />}</div>
              <h2>{t("Wild на весь барабан")}</h2><p>{t("Владыка раскрывается,")}<br />{t("если раскрытие приносит выигрыш.")}</p>
            </section>
            <section className="entry-feature entry-feature--prize">
              <WelcomeFeatureAmbience variant="scatter" />
              <div className="entry-symbols">{mountedUnits >= 6 && <ChemicalSymbol id="scatter" animation="idle" timeScale={.8} animated={!reducedMotion} active={ready} />}</div>
              <h2>{t("Пробуди всю команду")}</h2><p>{t("4 Scatter откроют бонус")}<br />{t("с накоплением активных типов Wild.")}</p>
            </section>
          </div>
          <AlchemyButton className="entry-start" disabled={!ready} onClick={onStart}>{sessionMode === 'replay' ? t("ВОСПРОИЗВЕСТИ ПОВТОР") : t("ПОДНЯТЬ ПАРУСА")}</AlchemyButton>
          <span className="entry-footnote">{t("19 линий · Выигрыш до 15 000×")}<br />{sessionMode === 'replay' ? t("Просмотр сохранённого раунда · без ставок") : sessionMode === 'server' ? t("Серверная сессия · Stake Engine") : t("Демо · виртуальные кредиты")}</span>
      </div>
    </div>
  </div>}
  {!ready && <div className={`laboratory-entry entry-loading ${reducedMotion ? 'entry-static' : ''}`} onKeyDown={focusButton} role="dialog" aria-modal="true" aria-label={t('Загрузка игры')}>
    <div className="entry-backdrop" />
    <div className="entry-layout"><div className="entry-content">
      <img className="entry-logo" src={`${ASSET_BASE}ui/logo.webp?v=cartoon12`} alt={t('Пиратская бездна')} />
      <div className="entry-loader">
        <LoadingTreasure reducedMotion={reducedMotion} failed={blocked} />
        <StartupProgress target={displayTarget} failed={blocked} errorMessage={errorMessage} reducedMotion={reducedMotion} />
        {blocked && <AlchemyButton onClick={onRetry}>{t('ПОВТОРИТЬ')}</AlchemyButton>}
      </div>
    </div></div>
  </div>}
  </>;
}
