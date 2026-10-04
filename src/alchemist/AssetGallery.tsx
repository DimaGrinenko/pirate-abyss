import { t, symbolLabel, wildLabel, formatAmount } from './locale';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { CelebrationScreen } from './CelebrationScreen';
import type { Celebration } from './CelebrationScreen';
import { PreviewAnimationController } from './preview-animation-controller';
import { Character } from './Character';
import type { CharacterMood } from './Character';
import { ChemicalSymbol } from './ChemicalSymbol';
import { ReelCurtain } from './ReelCurtain';
import { RetriggerAward } from './RetriggerAward';
import { GpuBackgroundScene as BackgroundScene } from './GpuBackgroundScene';
import { AltarScene } from './AltarScene';
import { CAPTAIN_POSTER_FILE } from './character-assets';
import { BonusVaultBackground } from './BonusVaultBackground';
import { SpineEffects } from './SpineEffects';
import { BonusEntryTransition } from './BonusEntryTransition';
import { Icon } from './icons';
import { SYMBOLS, WILD_ORDER, WILD_TYPES } from './engine';
import type { WildType } from './engine';
import { assetUrl } from './assets';
import { SYMBOL_ART_REVISION } from './symbol-assets';
import { WIN_TIERS, WIN_TIER_DETAILS } from './win-tiers';
import type { WinTier } from './win-tiers';
import './asset-gallery.css';

type Group = 'symbols' | 'characters' | 'curtains' | 'scenes';
type Asset = { id: string; label: string; group: Group; image: string; type?: WildType; tier?: string; winTier?: WinTier; bonusStage?: 'intro' | 'summary'; bonusValue?: number };
type Pose = 'static' | 'idle' | 'drop' | 'win' | 'anticipation' | 'cast' | 'loss' | 'bonus' | 'laugh' | 'reveal' | 'intro' | 'wave' | 'tiphat' | 'look' | 'cheer' | 'suspense' | 'summon' | 'salute' | 'lantern' | 'curious' | 'surprise' | 'approve' | 'disappointed' | 'triumph'
  | 'approve-proud' | 'approve-amused' | 'win-resolve' | 'curious-doubletake' | 'lantern-listen';
const base = assetUrl('alchemist/');
const assets: Asset[] = [
  ...SYMBOLS.map((symbol, index) => ({ id: symbol.id, label: symbolLabel(symbol.id), group: 'symbols' as const, image: `symbols/${symbol.id}.webp`, tier: index < 5 ? t("Дорогой символ") : t("Обычный символ") })),
  ...WILD_ORDER.map(type => ({ id: `wild-${type}`, label: `Wild · ${wildLabel(type)}`, group: 'symbols' as const, image: `symbols/wild-${type}.webp`, type, tier: t("Специальный символ") })),
  { id: 'scatter', label: t("Чёрная метка · Scatter"), group: 'symbols', image: 'symbols/scatter.webp', tier: t("Специальный символ") },
  { id: 'captain', label: t("Капитан-призрак"), group: 'characters', image: `character/${CAPTAIN_POSTER_FILE}` },
  ...WILD_ORDER.map(type => ({ id: `reel-${type}`, label: t("Штора · {p0}", { p0: wildLabel(type) }), group: 'curtains' as const, image: `symbols/wild-${type}.webp`, type })),
  { id: 'environment', label: t("Затонувшая каюта"), group: 'scenes', image: 'environment/laboratory-walls-v43.webp' },
  { id: 'retrigger-award', label: 'RETRIGGER · +4', group: 'scenes', image: 'symbols/scatter.webp' },
  { id: 'environment-bonus', label: `${t('Бонус')} · ${t('Затонувшая каюта')}`, group: 'scenes', image: 'environment/shark-side-v38.webp' },
  { id: 'altar', label: t("Сокровищница"), group: 'scenes', image: 'ceremony/experiment-amber.webp' },
  { id: 'bonus-entry', label: t('Появление бонуса'), group: 'scenes', image: 'effects/bonus-entry-preview.webp' },
  { id: 'bonus-intro', label: t('Активация бонуса'), group: 'scenes', image: 'altar/arrival-pose-v36.png', bonusStage: 'intro' },
  { id: 'bonus-outro', label: t('Завершение бонуса'), group: 'scenes', image: 'altar/reward-broken-pose-v36.png', bonusStage: 'summary' },
  { id: 'bonus-outro-zero', label: t('Завершение бонуса · без выигрыша'), group: 'scenes', image: 'altar/setup-pose-v36.png', bonusStage: 'summary', bonusValue: 0 },
  ...WIN_TIERS.map(winTier => ({ id: `bigwin-${winTier}`, label: t(WIN_TIER_DETAILS[winTier].title), group: 'scenes' as const, image: `effects/bigwin-v2-${winTier}.webp?v=treasure13-no-cannon`, winTier, tier: `${formatAmount(WIN_TIER_DETAILS[winTier].minimum)}× ${t('ставки')}` })),
  { id: 'curtain', label: t("Переход между сценами"), group: 'scenes', image: 'ui/logo.webp?v=cartoon12' },
];
const groups: { id: Group; label: string }[] = [
  { id: 'symbols', label: t("Символы") }, { id: 'characters', label: t("Персонаж") },
  { id: 'curtains', label: t("Шторы Wild") }, { id: 'scenes', label: t("Сцены") },
];
const labels: Record<Pose, string> = {
  static: t("Статика"), idle: t('Покой'), drop: t('Падение'), win: t('Выигрыш'), anticipation: t("Ожидание"),
  cast: t("Призыв"), loss: t("Промах"), bonus: t("Бонус"), laugh: t("Смех"), reveal: t("Раскрытие"), intro: t("Пробуждение"),
  suspense: t('Ожидание бонуса'), summon: t('Магия фонаря'), salute: t('Салют капитана'), lantern: t('Проверка фонаря'),
  curious: t('Любопытство'), surprise: t('Удивление'), approve: t('Одобрение'), disappointed: t('Досада'), triumph: t('Триумф'),
  wave: t('Приветствие'), tiphat: t('Поклон'), look: t('Взгляд на барабаны'), cheer: t('Ликование'),
  'approve-proud': t('Гордый кивок'), 'approve-amused': t('Лукавое одобрение'),
  'win-resolve': t('Уверенный салют'), 'curious-doubletake': t('Двойной взгляд'), 'lantern-listen': t('Прислушаться к фонарю'),
};
function poses(asset: Asset): Pose[] {
  if (asset.id === 'retrigger-award') return ['static', 'win'];
  if (asset.group === 'symbols') return ['static', 'idle', 'drop', 'win'];
  if (asset.group === 'characters') return ['static', 'idle', 'anticipation', 'cast', 'win', 'loss', 'bonus', 'laugh', 'wave', 'tiphat', 'look', 'cheer', 'suspense', 'summon', 'salute', 'lantern', 'curious', 'surprise', 'approve', 'disappointed', 'triumph'];
  if (asset.group === 'curtains') return ['static', 'idle', 'reveal', 'win'];
  if (asset.id === 'altar') return ['static', 'idle', 'intro', 'win'];
  if (asset.id === 'bonus-entry') return ['intro', 'static'];
  if (asset.bonusStage) return ['static', asset.bonusStage === 'intro' ? 'intro' : 'win'];
  if (asset.winTier) return ['static', 'win'];
  if (asset.id === 'curtain') return ['reveal'];
  return ['static', 'idle'];
}

function Preview({ asset, pose, version, paused, timeScale }: { asset: Asset; pose: Pose; version: number; paused: boolean; timeScale: number }) {
  const animated = pose !== 'static';
  if (asset.id === 'retrigger-award') return <div style={{ position: 'relative', width: '100%', height: '100%' }}><RetriggerAward key={version} count={4} durationMs={1500 / timeScale} reducedMotion={!animated} paused={paused} /></div>;
  if (asset.group === 'symbols') return <ChemicalSymbol id={asset.type ? 'wild' : asset.id} wildType={asset.type} multiplier={asset.type ? WILD_TYPES[asset.type].multipliers[0] : undefined} animated={animated} active={!paused} timeScale={timeScale} animation={pose === 'drop' ? 'land' : pose === 'win' ? 'win' : 'idle'} landKey={pose === 'drop' ? version : undefined} />;
  if (asset.group === 'characters') return <Character className="asset-gallery__captain" mood={pose === 'static' ? 'idle' : pose as CharacterMood} cue={version} animated={animated} paused={paused} timeScale={timeScale} reducedMotion={!animated} />;
  if (asset.group === 'curtains') return <ReelCurtain type={asset.type!} multiplier={WILD_TYPES[asset.type!].multipliers[0]} animated={animated} active={!paused} timeScale={timeScale} phase={pose === 'reveal' ? 'reveal' : 'idle'} winning={pose === 'win'} />;
  if (asset.id === 'environment' || asset.id === 'environment-bonus') return <div className="asset-gallery__world"><BackgroundScene animated={animated} paused={paused} timeScale={timeScale} bonus={asset.id === 'environment-bonus'} reducedMotion={!animated} /></div>;
  if (asset.bonusStage) return <div className="asset-gallery__vault-preview">
    <BonusVaultBackground paused={paused} reducedMotion={!animated} summary={asset.bonusStage === 'summary'} timeScale={timeScale} />
    <AltarScene variant={asset.bonusStage} animated={animated} rewarded={asset.bonusValue !== 0}
      held={paused} timeScale={timeScale} />
  </div>;
  if (asset.id === 'altar') return <AltarScene variant={pose === 'win' ? 'summary' : pose === 'intro' ? 'intro' : 'welcome'} animated={animated} held={paused} timeScale={timeScale} />;
  if (asset.id === 'bonus-entry') return <BonusEntryTransition animated={animated} paused={paused} timeScale={timeScale} reducedMotion={!animated} mode="devastation" origin={{ x: .25, y: .68, width: 0, height: 0 }} />;
  if (asset.winTier) {
    const details = WIN_TIER_DETAILS[asset.winTier];
    return <div className="asset-gallery__win-preview" data-preview-win-tier={asset.winTier}>
      <SpineEffects kind="bigwin" tier={asset.winTier} reducedMotion={!animated} paused={paused} timeScale={timeScale} />
      <div className="asset-gallery__win-copy" style={{ '--preview-amount-chars': formatAmount(details.minimum * 10).length } as CSSProperties}><span>{t(details.subtitle)}</span><strong>{formatAmount(details.minimum * 10)}</strong><small>CR · {formatAmount(details.minimum)}×</small></div>
    </div>;
  }
  return <SpineEffects kind="curtain" reducedMotion={!animated} paused={paused} timeScale={timeScale} />;
}

const inspectionOrigin = { x: .25, y: .68, width: 0, height: 0 };

/** Replay the real veil/first-paint handshake without a game, wallet or round.
 * The caller keys the whole sequence, so Replay also resets the covered gate. */
function BonusInspectionSequence({ celebration, paused, timeScale, staticPose, onReturn }: {
  celebration: Celebration; paused: boolean; timeScale: number; staticPose: boolean; onReturn: () => void;
}) {
  const [covered, setCovered] = useState(staticPose);
  const [sceneReady, setSceneReady] = useState(false);
  const [revealed, setRevealed] = useState(staticPose);
  return <>
    <div className="asset-gallery__world" aria-hidden="true"><BackgroundScene animated={!staticPose} paused={paused} timeScale={timeScale} bonus reducedMotion={staticPose} /></div>
    {covered && <CelebrationScreen celebration={celebration} bet={10} reducedMotion={staticPose}
      animationHeld={paused || !revealed} transitioning={!revealed} timeScale={timeScale}
      onReady={() => setSceneReady(true)} onContinue={onReturn} />}
    {!revealed && <BonusEntryTransition mode={celebration.mode ?? 'devastation'} origin={inspectionOrigin}
      paused={paused} timeScale={timeScale * 1.6} revealReady={sceneReady}
      onCovered={() => setCovered(true)} onComplete={() => setRevealed(true)} />}
  </>;
}

/** Isolated inspection controls never receive a wallet or a live round. */
function FullscreenInspection({ celebration, version, paused, timeScale, staticPose, onPause, onSpeed, onReplay, onReturn }: {
  celebration: Celebration; version: number; paused: boolean; timeScale: number; staticPose: boolean;
  onPause: () => void; onSpeed: (speed: number) => void; onReplay: () => void; onReturn: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const controller = useRef(new PreviewAnimationController());
  useLayoutEffect(() => {
    const element = scene.current;
    if (!element) return;
    const apply = () => controller.current.synchronize(element.getAnimations({ subtree: true }), timeScale, paused || document.hidden);
    apply();
    // New CSS cues and result glyphs inherit the rate before their next paint.
    const observer = new MutationObserver(apply);
    observer.observe(element, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'data-count-complete', 'data-stage-cue', 'data-stage-exiting', 'data-animation-held'] });
    document.addEventListener('visibilitychange', apply);
    return () => { observer.disconnect(); document.removeEventListener('visibilitychange', apply); };
  }, [paused, timeScale, version]);

  return <div className="asset-gallery-fullscreen" ref={host} data-testid="asset-gallery-fullscreen" data-preview-paused={paused} data-preview-speed={timeScale} data-preview-static={staticPose}
    onKeyDownCapture={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onReturn(); return; }
      if (event.key !== 'Tab') return;
      // Include the external inspector controls, instead of the game's
      // intentional one-action focus trap inside CelebrationScreen.
      event.stopPropagation();
      const buttons = [...(host.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])].filter(button => button.getClientRects().length > 0 && !button.closest('[inert]'));
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }}>
    <div className="asset-gallery-fullscreen__controls" role="group" aria-label={t('Просмотр ассета')}>
      <button onClick={onReturn} className="asset-gallery-fullscreen__return" aria-label={t('Вернуться к ассетам')}><Icon name="close" size={15} /><span>{t('Вернуться к ассетам')}</span></button>
      <button onClick={onReplay} aria-label={t('Повторить')} title={t('Повторить')}><Icon name="reset" size={15} /></button>
      <button onClick={onPause} disabled={staticPose} aria-pressed={paused} aria-label={t(paused ? 'Продолжить анимацию' : 'Пауза')}>{t(paused ? 'ПРОДОЛЖИТЬ' : 'Пауза')}</button>
      <div className="asset-gallery__control-group" role="group" aria-label={t('Скорость')}>{[.25, .5, 1].map(speed => <button key={speed} disabled={staticPose} aria-pressed={timeScale === speed} onClick={() => onSpeed(speed)}>{speed}×</button>)}</div>
    </div>
    <div ref={scene} className="asset-gallery-fullscreen__scene">
      {celebration.kind === 'win'
        ? <CelebrationScreen key={version} celebration={celebration} bet={10} reducedMotion={staticPose} animationHeld={paused} timeScale={timeScale} onContinue={onReturn} />
        : <BonusInspectionSequence key={`${celebration.kind}:${version}:${staticPose}`} celebration={celebration}
          paused={paused} timeScale={timeScale} staticPose={staticPose} onReturn={onReturn} />}
    </div>
  </div>;
}

/** Local art inspection: this component never receives a wallet or round session. */
export function AssetGallery({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState(assets[0]);
  const [group, setGroup] = useState<Group>('symbols');
  const [pose, setPose] = useState<Pose>('idle');
  const [version, setVersion] = useState(0);
  const [fullWin, setFullWin] = useState<WinTier | null>(null);
  const [fullBonus, setFullBonus] = useState<'intro' | 'summary' | null>(null);
  const [paused, setPaused] = useState(false);
  const [timeScale, setTimeScale] = useState(1);
  const [background, setBackground] = useState<'dark' | 'light' | 'checker'>('dark');
  const [characterFocus, setCharacterFocus] = useState(false);
  const [characterVariants, setCharacterVariants] = useState(false);
  const [symbolGrid, setSymbolGrid] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fullWin || fullBonus) return;
    const previous = document.activeElement as HTMLElement | null;
    root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    function keyboard(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const buttons = [...(root.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])].filter(button => button.getClientRects().length > 0);
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', keyboard);
    return () => { document.removeEventListener('keydown', keyboard); previous?.focus(); };
  }, [onClose, fullWin, fullBonus]);
  function select(asset: Asset) {
    if (asset.group !== 'characters') setCharacterFocus(false);
    setSelected(asset); setPaused(false); setPose(poses(asset).includes('idle') ? 'idle' : poses(asset).find(value => value !== 'static') ?? 'static'); setVersion(value => value + 1);
  }
  if (fullWin || fullBonus) return <FullscreenInspection
    celebration={fullWin ? { kind: 'win', value: WIN_TIER_DETAILS[fullWin].minimum * 10, capped: fullWin === 'max' } : { kind: fullBonus === 'intro' ? 'bonus-intro' : 'bonus-end', value: fullBonus === 'intro' ? 10 : selected.bonusValue ?? 12500, mode: 'reckoning' }}
    version={version} paused={paused} timeScale={timeScale} staticPose={pose === 'static'}
    onPause={() => setPaused(value => !value)} onSpeed={setTimeScale}
    onReplay={() => { setPaused(false); setVersion(value => value + 1); }}
    onReturn={() => { setFullWin(null); setFullBonus(null); setPaused(false); }} />;
  return <div className="asset-gallery" ref={root} role="dialog" aria-modal="true" aria-labelledby="asset-gallery-title" data-testid="asset-gallery" data-group={group} data-character-focus={characterFocus} data-symbol-grid={symbolGrid && group === 'symbols'} data-preview-paused={paused} data-preview-speed={timeScale} data-inspection-background={background}>
    <header className="asset-gallery__header">
      <div><span>PIRATE ABYSS · DEV</span><h2 id="asset-gallery-title">{t("Мастерская ассетов")}</h2></div>
      <button className="icon-button" onClick={onClose} aria-label={t("Закрыть мастерскую")}><Icon name="close" /></button>
    </header>
    <nav className="asset-gallery__tabs" aria-label={t("Категории ассетов")}>{groups.map(item => <button key={item.id} aria-pressed={group === item.id} onClick={() => { setGroup(item.id); select(assets.find(asset => asset.group === item.id)!); }}>{item.label}<span>{assets.filter(asset => asset.group === item.id).length}</span></button>)}</nav>
    <div className="asset-gallery__body">
      <div className="asset-gallery__catalog" aria-label={t("Выбор ассета")}>{assets.filter(asset => asset.group === group).map(asset => <button key={asset.id} className="asset-gallery__item" aria-pressed={selected.id === asset.id} onClick={() => select(asset)}><img src={`${base}${asset.image}${asset.image.startsWith('symbols/') ? `?v=${SYMBOL_ART_REVISION}` : ''}`} alt="" loading="lazy" /><span>{asset.label}</span></button>)}</div>
      <section className="asset-gallery__inspector" aria-label={t("Просмотр ассета")}>
        <div className="asset-gallery__caption"><div><small>{symbolGrid && group === 'symbols' ? t('Символы') : selected.tier || groups.find(item => item.id === selected.group)?.label}</small><h3>{symbolGrid && group === 'symbols' ? t('Сравнение символов') : selected.label}</h3></div><div className="asset-gallery__preview-actions">{selected.group === 'symbols' && <button className="secondary-button" aria-pressed={symbolGrid} onClick={() => setSymbolGrid(value => !value)}>{t(symbolGrid ? 'Один символ' : 'Сравнить размеры')}</button>}{selected.group === 'characters' && <button className="secondary-button" aria-pressed={characterFocus} onClick={() => setCharacterFocus(value => !value)}>{t(characterFocus ? 'Вернуться к ассетам' : 'Крупный просмотр')}</button>}<button className="secondary-button" onClick={() => { setPaused(false); setVersion(value => value + 1); }}><Icon name="reset" size={17} />{t("Повторить")}</button></div></div>
        <div className="asset-gallery__playback">
          <button className="secondary-button" disabled={pose === 'static'} aria-pressed={paused} onClick={() => setPaused(value => !value)}>{t(paused ? 'Продолжить анимацию' : 'Пауза')}</button>
          <div className="asset-gallery__control-group" role="group" aria-label={t('Скорость')}><span>{t('Скорость')}</span>{[.25, .5, 1].map(speed => <button key={speed} aria-pressed={timeScale === speed} onClick={() => setTimeScale(speed)}>{speed}×</button>)}</div>
          <div className="asset-gallery__control-group" role="group" aria-label={t('Фон просмотра')}><span>{t('Фон просмотра')}</span>{(['dark', 'light', 'checker'] as const).map(value => <button key={value} className={`asset-gallery__swatch asset-gallery__swatch--${value}`} aria-label={t(value === 'dark' ? 'Тёмный' : value === 'light' ? 'Светлый' : 'Шахматный')} aria-pressed={background === value} onClick={() => setBackground(value)} />)}</div>
        </div>
        <div className={`asset-gallery__stage asset-gallery__stage--${selected.group}`} data-preview-asset={symbolGrid && group === 'symbols' ? 'all-symbols' : selected.id} data-preview-pose={pose}>{symbolGrid && group === 'symbols' ? <div className="asset-gallery__symbol-grid">{assets.filter(asset => asset.group === 'symbols').map(asset => <div className="asset-gallery__comparison-cell" key={`${asset.id}-${pose}-${version}`} title={asset.label}><Preview asset={asset} pose={pose} version={version} paused={paused} timeScale={timeScale} /></div>)}</div> : <div className="asset-gallery__art"><Preview key={selected.group === 'characters' ? `${selected.id}-${pose === 'static' ? 'static' : 'animated'}` : `${selected.id}-${pose}-${version}`} asset={selected} pose={pose} version={version} paused={paused} timeScale={timeScale} /></div>}</div>
        {selected.winTier && <div className="asset-gallery__win-tools"><p className="asset-gallery__win-note">{t('Демонстрация: ставка 10 CR · выигрыш {p0} CR · счётчик {p1} с.', { p0: formatAmount(WIN_TIER_DETAILS[selected.winTier].minimum * 10), p1: formatAmount(WIN_TIER_DETAILS[selected.winTier].countMs / 1000) })}</p><button className="secondary-button" onClick={() => setFullWin(selected.winTier!)}>{t('Полный экран')}</button></div>}
        {selected.bonusStage && <div className="asset-gallery__win-tools"><button className="secondary-button" onClick={() => setFullBonus(selected.bonusStage!)}>{t('Полный экран')}</button></div>}
        <div className="asset-gallery__poses" aria-label={t("Состояния анимации")}>{poses(selected).map(value => <button key={value} aria-pressed={pose === value} onClick={() => { setPaused(false); setPose(value); setVersion(current => current + 1); }}>{labels[value]}</button>)}</div>
        {selected.group === 'characters' && <><button className="secondary-button" aria-expanded={characterVariants} onClick={() => setCharacterVariants(value => !value)}>{t('Варианты реакций')}</button>{characterVariants && <div className="asset-gallery__poses" aria-label={t('Варианты реакций')}>{(['approve-proud', 'approve-amused', 'win-resolve', 'curious-doubletake', 'lantern-listen'] as const).map(value => <button key={value} aria-pressed={pose === value} onClick={() => { setPaused(false); setPose(value); setVersion(current => current + 1); }}>{labels[value]}</button>)}</div>}</>}
      </section>
    </div>
    <footer className="asset-gallery__footer">{t("Просмотр ассетов · баланс и игровой раунд сохраняются.")} {pose === 'drop' && t("Drop воспроизводит посадку символа (Spine: land).")}</footer>
  </div>;
}
