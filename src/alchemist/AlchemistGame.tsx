import { t, language, formatAmount as format, formatNumber, symbolLabel, wildLabel, localizeMessage, configureSessionLocale } from './locale';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Character } from './Character';
import { preloadCharacter } from './Character';
import type { CharacterMood } from './Character';
import { CAPTAIN_SUMMON_FLAME, captainPlacement } from './character-layout';
import { useMotionPreference } from './motion-preference';
import { purchasedBonusTriggerBoard } from './bonus-purchase-presentation';
import { CabinBonusEntry as BonusEntryTransition, preloadCabinBonusEntry as preloadBonusEntry } from './CabinBonusEntry';
import { preloadBonusSharkWindow } from './BonusSharkWindow';
import { preloadAlchemistEffects } from './spineEffectsRuntime';
import { preloadGpuReelCurtains } from './reel-curtain-gpu-assets';
import { preloadGpuBigwin } from './GpuBigwinScene';
import { useSceneryVisibility } from './PresentationScenery';
import { FEATURE_COST, MAX_WIN_MULTIPLIER, PAYLINES, SYMBOLS, WILD_ORDER, WILD_TYPES, buyBonus, createState, demoBoard, spin, validateBoard } from './engine';
import type { Board, BonusMode, DemoScenario, FeatureMode, GameState, SpinResult } from './engine';
import { Icon } from './icons';
import { laboratoryAudio } from './audio';
import { ReelColumn } from './ReelColumn';
import { PaylineCanvas, preloadPaylineArt } from './PaylineCanvas';
import { ReelCurtain } from './ReelCurtain';
import { ReelCurtainStage } from './ReelCurtainStage';
import { reelCurtainDurationMs } from './reel-curtain-timing';
import { RetriggerAward, preloadRetriggerAward } from './RetriggerAward';
import { presentRetriggerAward, visibleFreeSpins } from './retrigger-presentation';
import { reelCrestType } from './reel-crest';
import { ReelFrame } from './ReelFrame';
import { CompassMarker } from './CompassMarker';
import { getCompassCopy } from './compass-copy';
import { BonusReelAtmosphere } from './BonusReelAtmosphere';
import { anticipationAfter, scatterAnticipationAfter, orderedCurtains, spinMotionProfile, SpinPresentation } from './presentation';
import { startVisibleDelay, startVisibleRepeat } from './visible-presentation-delay';
import { StartupScreen } from './StartupScreen';
import { assetUrl } from './assets';
import { prepareImages } from './asset-readiness';
import { BonusPurchaseScreen } from './BonusPurchaseScreen';
import { CelebrationScreen } from './CelebrationScreen';
import type { Celebration } from './CelebrationScreen';
import './cartoon-theme.css';
import './rules.css';
import './startup.css';
import './celebration-motion.css';
import { GpuBackgroundScene as BackgroundScene, preloadGpuBackgroundScene } from './GpuBackgroundScene';
import { CabinAtmosphere } from './CabinAtmosphere';
import { CabinTreasureChest } from './CabinTreasureChest';
import { CeilingDust } from './CeilingDust';
import { RoundSession, featureMode } from './round-session';
import { RgsError } from './rgs';
import { AssetGallery } from './AssetGallery';
import { GameControls } from './GameControls';
import { containDialogSpace } from './dialog-keyboard';
import { SessionComplianceMeta } from './SessionComplianceMeta';
import { TARGET_RTP } from './math/config';
import './pirate-theme.css';
import './bonus-mode-v3.css';
import './connected-reels.css';
import './pirate-typography.css';
import './button-refinement.css';
import './ui-polish-v11.css';
import './round-choreography.css';
import './polish-v16.css';
import './board-layout-v17.css';
import './lord-headers-v26.css';
import './art-direction-v32.css';
import './mobile-cabin-v34.css';
import './cabin-layout-v36.css';
import './frame-cartoon-v36.css';
import './cabin-layout-v37.css';
import './mobile-composition-v39.css';
import './reel-rail-seating-v41.css';
import './pirate-lettering-v39.css';
import './mobile-composition-v42.css';
import './cabin-ui-v42.css';
import './hud-spacing-v42.css';
import { symbolImageUrl, SYMBOL_ART_REVISION } from './symbol-assets';
import { preloadTintedScenery } from './tinted-raster';
import { claimMillionDemo, createMillionDemo, millionDemoAvailable } from './one-shot-million-demo';
import { useFrameDiagnostics } from './use-frame-diagnostics';
import { RenderProbe, renderProbeRequested } from './RenderProbe';
import type { RenderProbeMode } from './RenderProbe';

const STORAGE_KEY = 'pirate-abyss.local-session.v1';
const BETS = [.1, .2, .5, 1, 2, 5, 10, 20, 50, 100];
const ASSET_BASE = assetUrl('alchemist/');
type Modal = 'bonus' | 'auto' | 'settings' | 'rules' | 'scenes' | 'assets' | null;
type Session = { game: GameState; board: Board; feature?: FeatureMode };

function initialSession(): Session {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null') as Session | null;
    if (saved && ['base', 'devastation', 'reckoning'].includes(saved.game.mode)
      && BETS.includes(saved.game.bet) && Number.isFinite(saved.game.balance) && saved.game.balance >= 0
      && Number.isInteger(saved.game.freeSpins) && saved.game.freeSpins >= 0
      && (saved.game.mode === 'base' || saved.game.freeSpins > 0)
      && ['bonusWin', 'roundWin', 'totalSpins', 'lastWin', 'lastBonusWin'].every(key => Number.isFinite(saved.game[key as keyof GameState]) && Number(saved.game[key as keyof GameState]) >= 0)
      && Array.isArray(saved.game.activatedTypes) && saved.game.activatedTypes.every(type => WILD_ORDER.includes(type))) {
      validateBoard(saved.board);
      return saved;
    }
  } catch { /* A missing or old local session simply starts a fresh laboratory. */ }
  const board: Board = [
    [{ id: 'elixir' }, { id: 'sulfur' }, { id: 'flask' }, { id: 'iron' }, { id: 'crystal' }],
    [{ id: 'copper' }, { id: 'wild', wildType: 'blue', multiplier: 3 }, { id: 'atom' }, { id: 'elixir' }, { id: 'lead' }],
    [{ id: 'crystal' }, { id: 'retort' }, { id: 'lead' }, { id: 'flask' }, { id: 'mercury' }],
    [{ id: 'atom' }, { id: 'iron' }, { id: 'wild', wildType: 'gold', multiplier: 15 }, { id: 'sulfur' }, { id: 'elixir' }],
    [{ id: 'mercury' }, { id: 'elixir' }, { id: 'copper' }, { id: 'scatter' }, { id: 'retort' }],
    [{ id: 'sulfur' }, { id: 'flask' }, { id: 'crystal' }, { id: 'mercury' }, { id: 'atom' }],
  ];
  return { game: createState(10000, 1), board };
}

function Dialog({ title, eyebrow, children, onClose, dismissible = true }: { title: string; eyebrow: string; children: ReactNode; onClose: () => void; dismissible?: boolean }) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    (dialog?.querySelector<HTMLElement>('button:not(:disabled)') ?? dialog)?.focus();
    const trap = (event: KeyboardEvent) => {
      if (containDialogSpace(event, event.target instanceof HTMLElement && Boolean(event.target.closest('button')))) return;
      if (event.key === 'Escape' && dismissible) { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const focusable = dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),[tabindex="0"]');
      if (!focusable?.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.removeEventListener('keydown', trap); previous?.focus(); };
  }, [onClose, dismissible]);
  return <div className="overlay" onClick={event => { if (dismissible && event.target === event.currentTarget) onClose(); }}>
    <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title" ref={dialogRef} tabIndex={-1}>
      <header className="dialog__header">
        {dismissible && <button className="icon-button dialog-close" onClick={onClose} aria-label={t("Закрыть")}><Icon name="close" /></button>}
        <span className="dialog-eyebrow">{eyebrow}</span><h2 id="dialog-title">{title}</h2>
      </header>
      <div className="dialog__body">{children}</div>
    </div>
  </div>;
}

export function AlchemistGame() {
  useSceneryVisibility();
  const [initial] = useState(initialSession);
  const [storage] = useState(() => { try { return window.localStorage; } catch { return undefined; } });
  const [session] = useState(() => new RoundSession(initial, window.location.href, { storage }));
  const [game, setGame] = useState(session.view.game);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [sessionFault, setSessionFault] = useState('');
  const [board, setBoard] = useState<Board>(initial.board);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [phase, setPhase] = useState<'idle' | 'spinning' | 'revealing'>('idle');
  const [landed, setLanded] = useState(6);
  const [expanded, setExpanded] = useState<number[]>([]);
  const [openingReels, setOpeningReels] = useState<number[]>([]);
  const [teaseReel, setTeaseReel] = useState<number | null>(null);
  const [spinId, setSpinId] = useState(0);
  const [activeWinIndex, setActiveWinIndex] = useState(-1);
  const [mood, setMood] = useState<CharacterMood>('idle');
  const [characterCue, setCharacterCue] = useState(0);
  const reactCaptain = useCallback((next: CharacterMood) => { setMood(next); setCharacterCue(value => value + 1); }, []);
  const [modal, setModal] = useState<Modal>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const [bonusEntry, setBonusEntry] = useState<{ mode: BonusMode; origin: { x: number; y: number; width: number; height: number } } | null>(null);
  const [bonusSceneReady, setBonusSceneReady] = useState(false);
  const [entryRevealed, setEntryRevealed] = useState(false);
  const [bonusTrigger, setBonusTrigger] = useState(false);
  const [retriggerAward, setRetriggerAward] = useState(0);
  const [pendingRetriggerSpins, setPendingRetriggerSpins] = useState(0);
  const curtain = bonusEntry !== null;
  const [sound, setSound] = useState(() => { try { return storage?.getItem('pirate-abyss.sound.v2') !== 'off'; } catch { return true; } });
  const [startup, setStartup] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [replayQueued, setReplayQueued] = useState(false);
  const [turbo, setTurbo] = useState(false);
  const [reducedMotion, setReducedMotion] = useMotionPreference();
  const [autoRemaining, setAutoRemaining] = useState(0);
  const [bonusPaused, setBonusPaused] = useState(true);
  const [feature, setFeature] = useState<FeatureMode>(initial.feature && ['standard', 'bonushunt', 'catalysts'].includes(initial.feature) ? initial.feature : 'standard');
  const [toast, setToast] = useState('');
  const [preview, setPreview] = useState(false);
  const [requestedProbe, setRequestedProbe] = useState<RenderProbeMode>('full');
  const millionDemo = useRef<{outcomes:SpinResult[];index:number}|null>(null);
  const [millionAvailable, setMillionAvailable] = useState(() => Boolean(navigator.locks && storage && millionDemoAvailable(storage)));
  const [millionPreview, setMillionPreview] = useState(false);
  const savedSession = useRef<Session | null>(null);
  const actionLock = useRef(false);
  const mounted = useRef(true);
  const activeSpin = useRef<SpinPresentation | null>(null);
  const spinSequence = useRef(0);
  const runSpinRef = useRef<() => void>(() => {});
  const centerActionRef = useRef<() => void>(() => {});
  const shellRef = useRef<HTMLDivElement>(null);
  const entryCallbacks = useRef<{ covered: () => void; complete: () => void } | null>(null);
  const busy = phase !== 'idle' || curtain || networkBusy;
  const restrictions = session.config?.jurisdiction ?? {};
  const betLevels = session.betLevels;
  const currency = session.currency;
  const inBonus = game.mode !== 'base';
  const displayedFreeSpins = visibleFreeSpins(game.freeSpins, pendingRetriggerSpins);
  const devGallery = !session.live && !session.replay && (import.meta.env.DEV || new URLSearchParams(window.location.search).get('dev') === '1');
  const blocked = startup || busy || Boolean(modal) || Boolean(celebration) || Boolean(sessionFault);
  const spinningAutomatically = autoRemaining > 0 || (inBonus && !bonusPaused);

  useEffect(() => {
    // Jurisdiction can change on recovery as well as initial authentication.
    if (restrictions.disabledTurbo) setTurbo(false);
    if (restrictions.disabledAutoplay) setAutoRemaining(0);
  }, [restrictions.disabledTurbo, restrictions.disabledAutoplay]);

  const pause = useCallback((ms: number) => activeSpin.current?.wait(ms) ?? Promise.resolve(false), []);
  const reelStopped = useCallback((col: number, id: number) => activeSpin.current?.stopped(col, id), []);
  const reelSettled = useCallback((col: number, id: number) => activeSpin.current?.settled(col, id), []);
  const notice = useCallback((message: string) => { setToast(message); }, []);
  const closeModal = useCallback(() => setModal(null), []);
  useEffect(() => {
    // CSS award beats pause on the same visibility boundary as Spine and holds.
    const visibility = () => { if (shellRef.current) shellRef.current.dataset.documentHidden = String(document.hidden); };
    visibility(); document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  const syncSession = useCallback((restoreResult = false) => {
    configureSessionLocale(session.config?.jurisdiction.socialCasino);
    setPendingRetriggerSpins(0);
    setGame({ ...session.view.game }); setBoard(session.view.board); setFeature(session.view.feature);
    if (restoreResult) { setResult(session.lastResult); setExpanded(session.lastResult?.expandedReels ?? []); setActiveWinIndex(session.lastResult?.wins.length ? 0 : -1); }
  }, [session]);
  function sessionError(error: unknown) {
    setPendingRetriggerSpins(0); setRetriggerAward(0);
    const message = error instanceof Error ? localizeMessage(error.message) : t("Не удалось получить результат");
    notice(message); setAutoRemaining(0); setBonusPaused(true);
    if (session.fault || error instanceof RgsError && error.uncertain) {
      // Recovery must replace purchase/settings overlays, including their
      // focus traps. Never leave an uncertain paid action behind a disabled form.
      setModal(null);
      setSessionFault(message);
    }
  }
  async function finishRound() {
    if (!session.complete) return;
    setNetworkBusy(true);
    try { await session.finish(); syncSession(); } catch (error) { sessionError(error); }
    finally { setNetworkBusy(false); }
  }
  async function recoverSession() {
    if (networkBusy || actionLock.current) return;
    setNetworkBusy(true);
    try {
      await session.recover(); syncSession(true); setSessionFault(''); setCelebration(null); reactCaptain('idle');
      if (session.complete) await session.finish();
      syncSession(true); notice(session.hasPending ? t("Раунд восстановлен. Продолжите просмотр") : t("Баланс проверен. Можно начать новый раунд"));
    } catch (error) { setSessionFault(error instanceof Error ? localizeMessage(error.message) : t("Не удалось восстановить сессию")); }
    finally { setNetworkBusy(false); }
  }

  useEffect(() => {
    mounted.current = true;
    let finished = 0;
    const visualAssets = ['effects/column-jamb-v36.webp', ...WILD_ORDER.map(type => `effects/rail-${type}-cartoon-v36.webp`), ...['spin', 'auto', 'turbo', 'settings', 'sound', 'muted', 'plus', 'minus', 'close', 'flask', 'play', 'stop', 'info', 'reset'].map(name => `ui/icons/${name}.webp`), ...['primary', 'buy', 'secondary'].flatMap(variant => ['base', 'pressed', 'glow', 'seal'].map(part => `ui/v4/button-${variant}-${part}.webp`)), 'ui/interface-panel.webp', 'ceremony/experiment-emerald.webp', 'ceremony/experiment-amber.webp', 'environment/laboratory-walls-v43.webp', 'ui/logo.webp?v=cartoon12', 'ui/big-win.webp', 'ui/mega-win.webp', ...[...SYMBOLS.map(s => s.id), ...WILD_ORDER.map(t => `wild-${t}`), 'scatter'].map(id => `symbols/${id}.webp?v=${SYMBOL_ART_REVISION}`)];
    visualAssets.push('effects/parts/sea-mist-v23.webp', 'ceremony/vault-background-v42.webp', 'ui/cabin-frame-v42.webp', 'ui/cabin-control-v42.webp', 'ui/cabin-buy-v42.webp', 'ui/win-lettering-en-v17.webp', 'ui/win-lettering-ru-v17.webp', ...['gold-burst', 'spark', 'bubble', 'caustic', 'coin', 'shard'].map(name => `effects/parts/${name}.png`));
    visualAssets.push('ui/v35/panel.webp', 'ui/spin-cartoon-v36.webp', 'environment/cabin-chest-v36/end-cap.webp',
      ...['spin', 'stop', 'plus', 'minus', 'close', 'play', 'reset', 'settings', 'sound', 'muted', 'auto', 'turbo', 'spark', 'info'].map(name => `ui/v35/icons/${name}.webp`),
      ...['body','outer','inner','coin','diamond','ruby','emerald'].map(name => `environment/cabin-chest-v24/${name}.webp`));
    visualAssets.push('environment/marine-side-v38.webp', 'environment/shark-side-v38.webp');
    const update = () => { if (mounted.current) setLoadProgress(Math.min(99, finished / (visualAssets.length + 26) * 100)); };
    const ready = () => { finished++; update(); };
    const tasks: Promise<void>[] = [prepareImages(visualAssets.map(path => `${ASSET_BASE}${path}`), ready)];
    tasks.push(prepareImages([`${ASSET_BASE}ui/primary-action-v32.webp`], () => {}));
    tasks.push(preloadRetriggerAward());
    tasks.push(preloadTintedScenery());
    let effectsReady = 0;
    tasks.push(preloadAlchemistEffects(done => { finished += done - effectsReady; effectsReady = done; update(); }), preloadCharacter().then(ready));
    tasks.push(preloadBonusEntry().then(() => { finished++; update(); }));
    tasks.push(preloadBonusSharkWindow().catch(() => {}).then(() => { finished++; update(); }));
    tasks.push(preloadPaylineArt().then(() => { finished++; update(); }));
    // Build one native data graph per scene. Prepare the alternate Canvas graph
    // only if this device cannot prepare its GPU path.
    tasks.push(preloadGpuReelCurtains().catch(() => preloadAlchemistEffects(undefined, WILD_ORDER.map(type => `reel-${type}`))).then(ready));
    tasks.push(preloadGpuBigwin().catch(() => preloadAlchemistEffects(undefined, ['bigwin-v2'])).then(ready));
    tasks.push(preloadGpuBackgroundScene().catch(() => preloadAlchemistEffects(undefined, ['environment'])).then(ready));
    tasks.push(session.initialize().then(() => { if (mounted.current) { syncSession(true); finished++; update(); } }));
    void laboratoryAudio.preload().catch(() => {});
    void Promise.all(tasks).then(() => Promise.all([
      document.fonts.load('400 24px "Ruslan Display"'),
      document.fonts.load('800 16px "Bitter"'),
    ])).then(() => document.fonts.ready).then(() => { if (mounted.current) setLoadProgress(100); }).catch((error: unknown) => { if (mounted.current) { setLoadFailed(true); setLoadError(error instanceof Error ? localizeMessage(error.message) : t("Ошибка загрузки")); } });
    return () => { mounted.current = false; activeSpin.current?.cancel(); entryCallbacks.current?.complete(); entryCallbacks.current = null; laboratoryAudio.setEnabled(false); };
  }, [session, syncSession, notice]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 4200); return () => clearTimeout(timer); } }, [toast]);
  useEffect(() => {
    if (phase !== 'idle' || !result?.wins.length || celebration || modal) return;
    return startVisibleRepeat(reducedMotion ? 2400 : 1450, () => setActiveWinIndex(index => (index + 1) % result.wins.length));
  }, [phase, result, celebration, modal, reducedMotion]);

  function playBonusEntry(mode: BonusMode, reveal: () => void, settledMood: CharacterMood = 'bonus') {
    const width = Math.max(window.innerWidth, 1), height = Math.max(window.innerHeight, 1);
    const hero = shellRef.current?.querySelector('.character-view')?.getBoundingClientRect();
    const heroPlacement = captainPlacement(hero?.width ?? 0, hero?.height ?? 0);
    const heroScale = heroPlacement.scale;
    // Flame position in the summon clip at the 0.5 s release, projected through
    // the same fixed camera as Character. Keep the ribbon attached to the prop.
    const origin = hero && hero.width > 0 && hero.height > 0
      ? { x: (hero.x + heroPlacement.originX + CAPTAIN_SUMMON_FLAME.x * heroScale) / width, y: (hero.y + heroPlacement.originY - CAPTAIN_SUMMON_FLAME.y * heroScale) / height, width: 0, height: 0 }
      : { x: .5, y: .7, width: 0, height: 0 };
    reactCaptain('summon');
    setBonusSceneReady(false);
    setEntryRevealed(false);
    return new Promise<void>(resolve => {
      // A short lantern cue introduces the award over the same cabin.
      // Mount its copy at the reveal gate without replacing the room.
      let covered = false;
      entryCallbacks.current = {
        covered: () => { if (!covered && mounted.current) { covered = true; reveal(); } },
        complete: () => {
          entryCallbacks.current = null;
          if (mounted.current) {
            setBonusEntry(null); setEntryRevealed(false);
            // Let the lantern's summon accent finish before its outcome pose.
            reactCaptain(settledMood);
          }
          resolve();
        },
      };
      setBonusEntry({ mode, origin });
    });
  }

  async function presentReelBoard(targetBoard: Board, presentation: SpinPresentation, motion: ReturnType<typeof spinMotionProfile>) {
    const landings: Promise<boolean>[] = [];
    setPhase('spinning'); setLanded(0); setResult(null); setExpanded([]); setOpeningReels([]); setTeaseReel(null); setActiveWinIndex(-1); setBonusTrigger(false); setRetriggerAward(0); setPendingRetriggerSpins(0); setSpinId(presentation.id); reactCaptain('anticipation');
    laboratoryAudio.startSpin();
    if (!await presentation.wait(motion.minimumSpin) || !mounted.current) return false;
    for (let reel = 0; reel < 6; reel++) {
      const scatterTarget = scatterAnticipationAfter(targetBoard, reel);
      const target = anticipationAfter(targetBoard, reel) ?? scatterTarget;
      if (target === reel && !motion.reduced) {
        if ((await Promise.all(landings)).some(done => !done) || !mounted.current || presentation.cancelled) return false;
        setTeaseReel(reel); reactCaptain(scatterTarget === reel ? 'surprise' : 'suspense'); laboratoryAudio.anticipate(reel);
        if (!await presentation.wait(motion.anticipation) || !mounted.current) return false;
      }
      landings.push(presentation.expectReel(reel, () => {
        setTeaseReel(previous => previous === reel ? null : previous);
        laboratoryAudio.stopReel(reel, targetBoard[reel].some(cell => cell.id === 'wild' || cell.id === 'scatter'));
      }));
      setBoard(previous => previous.map((column, index) => index === reel ? targetBoard[reel] : column));
      setLanded(reel + 1);
      if (reel < 5 && !await presentation.wait(motion.stopInterval)) return false;
      if (!mounted.current) return false;
    }
    if ((await Promise.all(landings)).some(done => !done) || !mounted.current || presentation.cancelled) return false;
    laboratoryAudio.endSpin(); setPhase('revealing');
    return true;
  }

  async function presentPurchasedBonus(mode: BonusMode, next: GameState) {
    activeSpin.current?.cancel();
    const presentation = new SpinPresentation(++spinSequence.current);
    activeSpin.current = presentation;
    const motion = spinMotionProfile(turbo, reducedMotion);
    // The purchased round already exists; this intro consumes no book event or free spin.
    setModal(null); setBonusPaused(true); setAutoRemaining(0);
    setGame({ ...next, mode: 'base', freeSpins: 0, lastWin: 0 });
    if (!await presentReelBoard(purchasedBonusTriggerBoard(mode), presentation, motion)) return;
    setBonusTrigger(true); reactCaptain('cast'); laboratoryAudio.play('cast');
    if (!await presentation.wait(Math.min(motion.bonusHold, 320)) || !mounted.current) return;
    await playBonusEntry(mode, () => { setGame(next); setCelebration({ kind: 'bonus-intro', value: next.freeSpins, mode }); });
    if (mounted.current) { setBonusTrigger(false); setPhase('idle'); }
  }

  async function runSpin(forced?: DemoScenario, sessionOverride?: GameState) {
    if ((forced || preview || sessionOverride) && !devGallery) return;
    if (actionLock.current || modal && !forced || celebration || curtain || sessionFault || startup && !forced) return;
    actionLock.current = true;
    let current = sessionOverride ?? game;
    let outcome: SpinResult;
    try {
      if (!forced && preview && millionDemo.current && millionDemo.current.index < millionDemo.current.outcomes.length) outcome = millionDemo.current.outcomes[millionDemo.current.index++];
      else if (forced || preview) outcome = spin(current, { feature: forced ? 'standard' : feature, ...(forced ? { forcedBoard: demoBoard(forced) } : {}) });
      else {
        setNetworkBusy(true);
        if (session.replayFinished) { session.restartReplay(); setBonusPaused(false); }
        if (!session.hasPending) await session.start(featureMode(feature), game.bet);
        if (!mounted.current) { actionLock.current = false; return; }
        current = { ...session.view.game };
        outcome = session.consume();
      }
    } catch (error) {
      sessionError(error); setNetworkBusy(false); actionLock.current = false; return;
    }
    setNetworkBusy(false);
    activeSpin.current?.cancel();
    const presentation = new SpinPresentation(++spinSequence.current);
    activeSpin.current = presentation;
    const motion = spinMotionProfile(turbo, reducedMotion);
    // Local debit is committed by RoundSession; live balances come exclusively from RGS.
    setGame({ ...current, balance: forced || preview ? Math.max(0, current.balance - outcome.cost) : current.balance, lastWin: 0, freeSpins: current.mode === 'base' ? 0 : Math.max(0, current.freeSpins - 1) });
    if (current.mode === 'base') setAutoRemaining(count => Math.max(0, count - 1));
    if (!await presentReelBoard(outcome.board, presentation, motion)) return;
    setResult(outcome);
    if (outcome.expandedReels.length) {
      reactCaptain('cast');
      if (!await presentation.wait(motion.curtainLead) || !mounted.current) return;
      const reveals: Promise<boolean>[] = [];
      for (const [curtainIndex, reel] of orderedCurtains(outcome.expandedReels).entries()) {
        // Each curtain keeps its full cloth performance. Their starts cascade,
        // avoiding four serial 3.3-second waits and repeated captain restarts.
        if (curtainIndex > 0 && !await presentation.wait(motion.curtainStagger)) return;
        if (!mounted.current || presentation.cancelled) return;
        reveals.push(presentation.expectEffect(`curtain:${reel}`));
        setExpanded(previous => [...previous, reel]); setOpeningReels(previous => [...previous, reel]);
      }
      if ((await Promise.all(reveals)).some(done => !done) || !mounted.current) return;
    }
    if (!mounted.current) return;
    // Keep the played world visible until its transition or summary covers it.
    setGame(outcome.bonusTriggered ? { ...outcome.state, mode: current.mode, freeSpins: 0 } : outcome.bonusEnded ? { ...outcome.state, mode: current.mode } : outcome.state);
    setActiveWinIndex(outcome.wins.length ? 0 : -1);
    reactCaptain(outcome.capped ? 'triumph' : outcome.payout >= current.bet * 20 ? 'cheer' : outcome.payout >= current.bet * 3 ? 'win' : outcome.payout > 0 ? 'approve' : 'disappointed');
    if (outcome.payout > 0) laboratoryAudio.play('win');
    if (outcome.extraSpins) {
      // Only the displayed counter waits for the Scatter-to-award beat. The
      // accepted game/RGS result and autoplay continuation are already final.
      setPendingRetriggerSpins(reducedMotion ? 0 : outcome.extraSpins);
      setBonusTrigger(true); setRetriggerAward(outcome.extraSpins); reactCaptain('cheer');
      laboratoryAudio.play('bonus');
      try {
        const finished = await presentRetriggerAward(motion.retriggerHold, reducedMotion,
          async ms => await presentation.wait(ms) && !presentation.cancelled && mounted.current && activeSpin.current === presentation,
          () => { if (!presentation.cancelled && mounted.current && activeSpin.current === presentation) setPendingRetriggerSpins(0); });
        if (!finished || !mounted.current) return;
      } finally {
        // An old cancelled presentation must not clear a newer spin's award.
        if (mounted.current && activeSpin.current === presentation) {
          setPendingRetriggerSpins(0); setRetriggerAward(0); setBonusTrigger(false);
        }
      }
    }
    if (outcome.bonusTriggered) {
      setAutoRemaining(0); setBonusPaused(true); setBonusTrigger(true); reactCaptain('cast');
      laboratoryAudio.play('cast');
      await pause(Math.min(motion.bonusHold, 320));
      if (!mounted.current) return;
      await playBonusEntry(outcome.bonusTriggered, () => { setGame(outcome.state); setCelebration({ kind: 'bonus-intro', value: 10, mode: outcome.bonusTriggered! }); });
      if (mounted.current) setBonusTrigger(false);
    } else if (outcome.bonusEnded) {
      setBonusPaused(true);
      await pause(outcome.payout > 0 ? motion.winHold : motion.bonusHold);
      if (!mounted.current) return;
      // The final board stays visible behind the local award card.
      await playBonusEntry(current.mode === 'base' ? 'devastation' : current.mode, () => {
        setGame(outcome.state);
        setCelebration({ kind: 'bonus-end', value: outcome.bonusTotalWin, capped: outcome.capped, mode: current.mode === 'base' ? undefined : current.mode });
      }, outcome.bonusTotalWin > 0 ? 'triumph' : 'look');
    } else if (outcome.payout >= current.bet * 20 && forced !== 'reaction') {
      await pause(motion.winHold);
      if (mounted.current) setCelebration({ kind: 'win', value: outcome.payout, capped: outcome.capped });
    } else {
      await pause(outcome.payout > 0 ? motion.winHold : motion.emptyHold);
    }
    if (!mounted.current) return;
    if (!forced && !preview) {
      try {
        await session.acknowledge();
        const overlay = outcome.bonusTriggered || outcome.bonusEnded || outcome.payout >= current.bet * 20;
        if (!overlay && session.complete) await finishRound();
      } catch (error) { sessionError(error); }
    }
    setPhase('idle'); actionLock.current = false;
  }

  useEffect(() => { runSpinRef.current = () => { void runSpin(); }; centerActionRef.current = centerAction; });
  useEffect(() => { if (!startup && replayQueued) { setReplayQueued(false); runSpinRef.current(); } }, [startup, replayQueued]);
  useEffect(() => {
    if (blocked || !spinningAutomatically) return;
    // Result animations already finished inside runSpin; this is only a breath.
    return startVisibleDelay(reducedMotion ? 80 : turbo ? 100 : 180, () => runSpinRef.current());
  }, [blocked, spinningAutomatically, game.totalSpins, autoRemaining, turbo, reducedMotion]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (restrictions.disabledSpacebar || event.code !== 'Space' || event.repeat || (event.target instanceof HTMLElement && /BUTTON|INPUT|SELECT|TEXTAREA|A/.test(event.target.tagName))) return;
      event.preventDefault();
      centerActionRef.current();
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, [restrictions.disabledSpacebar]);

  function changeBet(bet: number) {
    if (blocked || inBonus || preview || spinningAutomatically || session.replay || session.hasPending) return;
    if (!betLevels.includes(bet)) return;
    try { session.setBet(bet); } catch (error) { sessionError(error); return; }
    setGame({ ...session.view.game }); setResult(null); setExpanded([]); setActiveWinIndex(-1); laboratoryAudio.play('click');
  }
  function changePurchaseBet(bet: number) {
    if (modal !== 'bonus' || actionLock.current || startup || busy || celebration || sessionFault || inBonus || preview || spinningAutomatically || session.replay || session.hasPending) return;
    if (!betLevels.includes(bet)) return;
    try { session.setBet(bet); } catch (error) { sessionError(error); return; }
    setGame({ ...session.view.game }); setResult(null); setExpanded([]); setActiveWinIndex(-1); laboratoryAudio.play('click');
  }
  function toggleSound() { const next = !sound; setSound(next); try { storage?.setItem('pirate-abyss.sound.v2', next ? 'on' : 'off'); } catch { /* Preference remains active for this session. */ } laboratoryAudio.setEnabled(next); }
  function selectFeature(mode: FeatureMode) {
    if (actionLock.current || busy || inBonus || preview || spinningAutomatically || startup || celebration || sessionFault || modal !== 'bonus') return;
    try { session.setFeature(mode); setFeature(mode); laboratoryAudio.play('click'); } catch (error) { sessionError(error); }
  }
  async function purchaseBonus(mode: BonusMode) {
    if (actionLock.current || busy || inBonus || preview || spinningAutomatically || startup || celebration || sessionFault || modal !== 'bonus') return;
    actionLock.current = true; setNetworkBusy(true);
    try { await session.start(mode, game.bet); }
    catch (error) { sessionError(error); actionLock.current = false; setNetworkBusy(false); return; }
    if (!mounted.current) { actionLock.current = false; return; }
    setNetworkBusy(false);
    try { await presentPurchasedBonus(mode, { ...session.view.game }); }
    finally { actionLock.current = false; }
  }
  async function continueCelebration() {
    if (curtain || networkBusy || actionLock.current) return;
    const kind = celebration?.kind;
    setCelebration(null);
    if (!preview && session.complete) await finishRound();
    if (kind === 'bonus-intro' && !session.fault) setBonusPaused(false);
    // The native captain resumes the outcome reaction that was parked under
    // the fullscreen scene. Replacing it here discarded his stronger acting.
  }
  async function previewScene(scenario: DemoScenario) {
    if (!devGallery || busy || actionLock.current || inBonus || session.live || session.replay || session.hasPending) return;
    savedSession.current = { game, board, feature };
    const previewGame = createState(10000, game.bet);
    setPreview(true); setGame(previewGame); setModal(null); setAutoRemaining(0); setBonusPaused(true);
    await runSpin(scenario, previewGame);
  }
  async function previewMillion() {
    if (!devGallery || busy || actionLock.current || inBonus || preview || session.live || session.replay || session.hasPending) return;
    if (!navigator.locks) { notice(t('Браузер не поддерживает одноразовый показ.')); return; }
    const fixture = createMillionDemo();
    const claim = () => Boolean(storage && claimMillionDemo(storage));
    actionLock.current = true;
    let claimed = false;
    try { claimed = await navigator.locks.request('pirate-abyss-million-demo', claim); }
    catch { notice(t('Браузер не поддерживает одноразовый показ.')); }
    finally { actionLock.current = false; }
    if (!mounted.current) return;
    setMillionAvailable(false);
    if (!claimed) { notice(t('Одноразовый показ уже использован в этом браузере.')); return; }
    savedSession.current = { game, board, feature };
    millionDemo.current = fixture;
    setMillionPreview(true); setPreview(true); setGame(fixture.initial); setFeature('standard'); setModal(null); setAutoRemaining(0); setBonusPaused(true);
    await runSpin('devastation', fixture.initial);
  }
  async function previewPurchasedBonus(mode: BonusMode) {
    if (!devGallery || busy || actionLock.current || inBonus || preview || session.live || session.replay || session.hasPending) return;
    savedSession.current = { game, board, feature };
    setPreview(true); actionLock.current = true;
    try { await presentPurchasedBonus(mode, buyBonus(createState(10000, game.bet), mode)); }
    finally { actionLock.current = false; }
  }
  function endPreview() {
    if (busy || !savedSession.current) return;
    setGame(savedSession.current.game); setBoard(savedSession.current.board); setFeature(savedSession.current.feature ?? 'standard'); savedSession.current = null;
    millionDemo.current = null; setMillionPreview(false); 
    setPreview(false); setResult(null); setExpanded([]); setActiveWinIndex(-1); setCelebration(null); reactCaptain('idle'); setAutoRemaining(0); setBonusPaused(true);
  }
  function centerAction() {
    if (spinningAutomatically) { setAutoRemaining(0); setBonusPaused(true); return; }
    if (blocked) return;
    if (inBonus) { setBonusPaused(false); return; }
    if (preview) { endPreview(); return; }
    void runSpin();
  }
  const currentWin = !bonusTrigger && activeWinIndex >= 0 ? result?.wins[activeWinIndex] : undefined;
  const winPositions = new Set(currentWin?.positions.map(position => `${position.col}:${position.row}`) ?? []);
  const obscured = Boolean(startup || modal || celebration || curtain || sessionFault);
  // Only a local win leaves the cabin visible. Full-screen bonus stages can
  // suspend the covered marine/character renderers once the cloud wipe ends.
  const worldObscured = obscured && !curtain;
  // Diagnostics can never suspend a paid/spinning presentation or its callbacks.
  const probeAllowed = devGallery && renderProbeRequested() && !obscured && !busy && !spinningAutomatically && !inBonus;
  const probeMode = probeAllowed ? requestedProbe : 'full';
  const freezeWorld = probeMode === 'freeze-environment' || probeMode === 'freeze-all';
  const freezeCaptain = probeMode === 'freeze-character' || probeMode === 'freeze-all';
  const freezeSymbols = probeMode === 'freeze-symbols' || probeMode === 'freeze-all';
  useFrameDiagnostics(shellRef, devGallery, startup ? 'startup' : modal ?? (celebration ? `celebration:${celebration.kind}` : curtain ? 'bonus-entry' : `${inBonus ? 'bonus' : 'base'}:${phase}`));

  useEffect(() => {
    laboratoryAudio.setMusicScene(celebration?.kind === 'win' ? 'celebration' : inBonus || curtain || celebration ? 'bonus' : 'base');
  }, [celebration, inBonus, curtain]);

  return <div ref={shellRef} lang={language} data-startup={startup || undefined} data-spin-id={devGallery ? spinId : undefined} data-spin-phase={devGallery ? phase : undefined} data-bonus-mode={inBonus ? game.mode : undefined} data-bonus-motion={obscured ? 'paused' : 'running'} data-bonus-entry-active={curtain || undefined} data-bonus-trigger={bonusTrigger || undefined} className={`game-shell ${reducedMotion ? 'no-motion' : ''} ${inBonus ? 'in-bonus' : ''}`}>
    <div className="environment"><BackgroundScene animated={!reducedMotion && (!worldObscured || startup)} paused={freezeWorld} bonus={inBonus} reducedMotion={reducedMotion} /><CabinTreasureChest inBonus={inBonus} obscured={worldObscured || freezeWorld} reducedMotion={reducedMotion} /><CabinAtmosphere reducedMotion={reducedMotion} obscured={worldObscured || freezeWorld} inBonus={inBonus} /><CeilingDust reducedMotion={reducedMotion} obscured={worldObscured || freezeWorld} /></div>
    <BonusReelAtmosphere layer="world" inBonus={inBonus} mode={game.mode} phase={phase} spinId={spinId} landed={landed} expanded={expanded} openingReels={openingReels} board={result?.board} payout={result?.payout ?? 0} winning={Boolean(currentWin)} obscured={obscured} reducedMotion={reducedMotion} />
    <main className="lab-main" inert={obscured}>
      <aside className="alchemist-sidebar">
        <div className="game-brand"><h1><img src={`${ASSET_BASE}ui/logo.webp?v=cartoon12`} alt={t("Пиратская бездна")} /></h1></div>
        <div className="character-scene"><Character className="character-view" mood={mood} cue={characterCue} interactive={!blocked} animated={!startup && !modal && !celebration} paused={freezeCaptain} reducedMotion={reducedMotion} onLaugh={() => laboratoryAudio.laugh()} /></div>
      </aside>
      <section className="machine machine--connected" style={{ '--curtain-reveal-duration': `${reelCurtainDurationMs(turbo ? 1.25 : 1)}ms` } as CSSProperties} aria-label={t("Игровое поле: 6 барабанов, 5 рядов, 19 линий")}>
        <div className="wild-rail" aria-label={t("Четыре владыки Wild")}>
          <div className="rail-edge" />
          {WILD_ORDER.map((homeType, index) => {
            const col = index + 1;
            const type = reelCrestType(homeType, col, result?.board, expanded, openingReels.includes(col) ? col : null);
            return <div key={homeType} data-reel-crest={col} data-compass-marked={game.mode === 'captains_course' && game.courseTarget === col || undefined} data-crest-type={type} data-opening={openingReels.includes(col) || undefined} className={`wild-type ${game.activatedTypes.includes(type) ? 'activated' : ''} ${teaseReel === col ? 'expectant' : ''} ${expanded.includes(col) ? 'unsealed' : ''}`} style={{ '--wild': WILD_TYPES[type].color } as CSSProperties} title={t("{p0}: барабан {p1}, {p2}×", { p0: wildLabel(type), p1: col + 1, p2: WILD_TYPES[type].multipliers.join(', ') })}>
              <img className="rail-art" src={`${ASSET_BASE}effects/rail-${type}-cartoon-v36.webp`} alt="" />
              <img className="rail-jewel-light rail-jewel-light--crown" src={`${ASSET_BASE}effects/parts/spark.png`} alt="" />
              <img className="rail-jewel-light rail-jewel-light--left" src={`${ASSET_BASE}effects/parts/spark.png`} alt="" />
              <img className="rail-jewel-light rail-jewel-light--right" src={`${ASSET_BASE}effects/parts/spark.png`} alt="" />
              <div className="rail-medallion" aria-hidden="true"><span>{['I', 'II', 'III', 'IV'][WILD_ORDER.indexOf(type)]}</span></div>
              <div className="rail-ribbon">{wildLabel(type)}</div>
            </div>;
          })}<div className="rail-edge" />
          {game.mode === 'captains_course' && game.courseTarget && <CompassMarker target={game.courseTarget} reducedMotion={reducedMotion} />}
        </div>
        <div className="reel-frame">
          <BonusReelAtmosphere layer="reels" inBonus={inBonus} mode={game.mode} phase={phase} spinId={spinId} landed={landed} expanded={expanded} openingReels={openingReels} board={result?.board} payout={result?.payout ?? 0} winning={Boolean(currentWin)} obscured={obscured} reducedMotion={reducedMotion} />
          <ReelCurtainStage className="reels" data-testid="reels" aria-busy={phase === 'spinning'}>
            {board.map((column, col) => <ReelColumn key={col} col={col} column={column} rolling={col >= landed} anticipation={teaseReel === col} spinId={spinId} turbo={turbo} reducedMotion={reducedMotion} paused={freezeSymbols} covered={obscured || expanded.includes(col)} onStopped={reelStopped} onSettled={reelSettled} winRows={new Set(column.flatMap((cell, row) => (bonusTrigger ? cell.id === 'scatter' : winPositions.has(`${col}:${row}`)) ? [row] : []))} dimmed={bonusTrigger || Boolean(currentWin)}>
              {expanded.includes(col) && result && (() => {
                const wild = result.board[col].find(cell => cell.id === 'wild')!;
                return <div className="expanded-reel" data-expanded-reel={col} data-reveal-state={openingReels.includes(col) ? 'opening' : 'open'}><ReelCurtain type={wild.wildType!} multiplier={wild.multiplier!} phase={openingReels.includes(col) ? 'reveal' : 'idle'} animated={!reducedMotion} active={!obscured} timeScale={turbo ? 1.25 : 1} winning={Boolean(currentWin?.positions.some(position => position.col === col))} onComplete={() => {
                  if (activeSpin.current?.id !== spinId) return;
                  activeSpin.current.completeEffect(`curtain:${col}`, spinId);
                  setOpeningReels(previous => previous.filter(reel => reel !== col));
                }} onCue={cue => laboratoryAudio.curtainCue(cue, col)} /></div>;
              })()}
            </ReelColumn>)}
            {currentWin && <PaylineCanvas positions={currentWin.positions} label={t("Выигрышная линия {p0}", { p0: currentWin.line + 1 })} animated={!reducedMotion} active={!obscured} key={`${spinId}:${activeWinIndex}`} />}
          </ReelCurtainStage>
          <ReelFrame animated={!reducedMotion && !obscured && !freezeSymbols} />
          {retriggerAward > 0 && <RetriggerAward key={`${spinId}:${retriggerAward}`} count={retriggerAward} board={result?.board} durationMs={spinMotionProfile(turbo, reducedMotion).retriggerHold} reducedMotion={reducedMotion} paused={obscured} />}
        </div>
        <div className="win-readout" role="status" aria-live="polite">
          {session.replayFinished ? <button className="secondary-button" onClick={centerAction}>{t("Смотреть снова")}</button> : bonusTrigger && result && result.payout > 0 ? <div className="line-win" data-testid="trigger-payout"><small>{t("ВЫИГРЫШ")}</small><strong>{format(result.payout)}</strong><span>{currency}</span></div> : currentWin ? <div className="line-win" key={`${spinId}:${activeWinIndex}`} data-testid="line-payout"><small>{t("ЛИНИЯ")} {currentWin.line + 1}</small><strong>{format(currentWin.payout)}</strong><span>{currency}</span></div> : inBonus ? <div className="bonus-strip"><span>{t("ВРАЩЕНИЯ")} <b data-testid="free-spins">{displayedFreeSpins}</b></span><i /><span>{t("ВЫИГРЫШ")} <b>{format(game.bonusWin)}</b></span></div> : null}
        </div>
      </section>
    </main>
    <div className="control-wrap" inert={obscured}>
      <GameControls currency={currency} obscured={obscured}
        featureLabel={t('КУПИТЬ БОНУС')} featureAriaLabel={t('КУПИТЬ БОНУС')}
        featureActive={feature !== 'standard'} featureDisabled={blocked || inBonus || preview || spinningAutomatically || session.replay || session.hasPending}
        onFeature={() => setModal('bonus')}
        balance={session.replay ? game.bet * (session.pendingMode === 'devastation' || session.pendingMode === 'captains_course' ? 100 : session.pendingMode === 'reckoning' ? 200 : FEATURE_COST[feature]) : game.balance}
        balanceLabel={session.replay ? t('Цена раунда') : t('Баланс')}
        win={inBonus && !bonusTrigger ? game.bonusWin : game.lastWin} winLabel={inBonus && !bonusTrigger ? t('Бонус') : t('Выигрыш')}
        bet={game.bet} betMultiplier={inBonus ? 1 : FEATURE_COST[feature]} betLevels={betLevels}
        betDisabled={blocked || inBonus || preview || spinningAutomatically || session.replay || session.hasPending} onBetChange={changeBet}
        freeSpins={inBonus ? displayedFreeSpins : undefined}
        spinAction={spinningAutomatically ? 'stop' : busy ? 'busy' : inBonus ? 'resume' : preview ? 'back' : session.replay ? 'replay' : 'spin'}
        spinAriaLabel={spinningAutomatically ? inBonus ? (language === 'ru' ? 'Приостановить бесплатные вращения' : 'Pause free spins') : t('Остановить автоспины') : busy ? t('Вращение') : inBonus ? t('Продолжить бесплатные вращения') : preview ? t('Вернуться в игру') : session.replayFinished ? t('Смотреть повтор снова') : session.replay ? t('Воспроизвести повтор') : t('Вращать')}
        spinDisabled={blocked && !spinningAutomatically || !preview && !session.replay && !session.hasPending && !session.modes.includes(featureMode(feature))} onSpin={centerAction}
        settingsDisabled={busy} onSettings={() => setModal('settings')} sound={sound} onSound={toggleSound}
        turbo={turbo} turboDisabled={busy || Boolean(restrictions.disabledTurbo)} onTurbo={() => setTurbo(!turbo)}
        autoRemaining={autoRemaining} autoDisabled={inBonus || preview || session.replay || Boolean(restrictions.disabledAutoplay) || (blocked && !autoRemaining)} onAuto={() => autoRemaining ? setAutoRemaining(0) : setModal('auto')}/>
      <SessionComplianceMeta flags={restrictions} live={session.live} replay={session.replay} sessionStartedAt={session.sessionStartedAt} netPositionMicro={session.netPositionMicro} currency={currency} rtpPercent={TARGET_RTP * 100} />
      {preview && <span className="preview-status">{millionPreview ? t('ОДНОРАЗОВАЯ ДЕМОСЕРИЯ · 1 000 000 CR') : t("ПРОСМОТР СЦЕНЫ")}</span>}
    </div>

    {!sessionFault && modal === 'bonus' && <BonusPurchaseScreen currency={currency} allowedModes={session.modes} allowBuyFeature={!restrictions.disabledBuyFeature} betLevels={betLevels} onBetChange={changePurchaseBet} bet={game.bet} balance={game.balance} reducedMotion={reducedMotion} currentFeature={feature} disabled={busy || inBonus || preview || spinningAutomatically || session.replay || Boolean(sessionFault)} onSelectFeature={selectFeature} onPurchase={mode => void purchaseBonus(mode)} onClose={closeModal} />}
    {!sessionFault && modal === 'auto' && !session.replay && !restrictions.disabledAutoplay && <Dialog title={t("Автоматические вращения")} eyebrow={t("АВТОСПИНЫ")} onClose={closeModal}>
      <p className="dialog-intro">{t("Выберите число вращений. Остановить серию можно в любой момент; текущий спин завершится.")}</p><div className="selection-row">{[10, 25, 50].map(count => <button key={count} onClick={() => { setAutoRemaining(count); setModal(null); }}>{count}</button>)}</div><p className="source-note" style={{ textAlign: 'center' }}>{t("Серия останавливается при запуске бонуса или нехватке кредитов.")}</p>
    </Dialog>}
    {!sessionFault && modal === 'settings' && <Dialog title={t("Настройки")} eyebrow="PIRATE ABYSS" onClose={closeModal}>
      <div className="setting-row"><div><span>{t("Звуки бездны")}</span><small>{t("Океан, команда и звуки сокровищ")}</small></div><button role="switch" aria-checked={sound} aria-label={t("Звуки бездны")} className={`toggle ${sound ? 'on' : ''}`} onClick={toggleSound} /></div>
      <p className="source-note"><a href={assetUrl('alchemist/audio/CREDITS-v42.html')} target="_blank" rel="noopener noreferrer">{language === 'ru' ? 'Музыка и авторы' : 'Music credits'}</a></p>
      <div className="setting-row"><div><span>{t("Турбовращения")}</span><small>{t("Быстрые остановки барабанов")}</small></div><button role="switch" disabled={restrictions.disabledTurbo} aria-checked={turbo} aria-label={t("Турбовращения")} className={`toggle ${turbo ? 'on' : ''}`} onClick={() => setTurbo(!turbo)} /></div>
      <div className="setting-row"><div><span>{t("Меньше движения")}</span><small>{t("Спокойный фон и неподвижные персонажи")}</small></div><button role="switch" aria-checked={reducedMotion} aria-label={t("Меньше движения")} className={`toggle ${reducedMotion ? 'on' : ''}`} onClick={() => setReducedMotion(!reducedMotion)} /></div>
      <div className="settings-links"><button className="secondary-button" onClick={() => setModal('rules')}><Icon name="info" size={18} />{t("Правила и выплаты")}</button>{devGallery && <button className="secondary-button" disabled={inBonus || preview || spinningAutomatically || session.hasPending} onClick={() => setModal('scenes')}><Icon name="play" size={16} />{t("Демонстрация анимаций")}</button>}{devGallery && <button className="secondary-button" disabled={spinningAutomatically} onClick={() => setModal('assets')}><Icon name="settings" size={18} />{t("Мастерская ассетов")}</button>}</div>
      {!inBonus && !preview && !session.live && !session.replay && !session.hasPending && <div className="modal-actions"><button className="secondary-button" disabled={spinningAutomatically} onClick={() => { session.resetLocal(demoBoard('quiet')); syncSession(); setResult(null); setExpanded([]); setActiveWinIndex(-1); setFeature('standard'); setAutoRemaining(0); setModal(null); notice(t("Команда готова к рейду. Баланс восстановлен: 10 000 CR")); }}>{t("Новый демо-баланс · 10 000 CR")}</button></div>}
    </Dialog>}
    {!sessionFault && modal === 'assets' && devGallery && <AssetGallery onClose={closeModal} />}
    {!sessionFault && modal === 'scenes' && devGallery && <Dialog title={t("Истории бездны")} eyebrow={t("ЛЕГЕНДЫ ПРОКЛЯТОЙ КОМАНДЫ")} onClose={closeModal}>
      <p className="dialog-intro">{t("Демонстрационные сцены показывают ключевые события. Ваш баланс и текущая игра сохранятся.")}</p>
      {devGallery && <div className="scene-options">{(['devastation', 'reckoning'] as const).map(mode => <button key={mode} className="secondary-button" onClick={() => void previewPurchasedBonus(mode)}>{mode === 'devastation' ? t('Покупной рейд · 3 Scatter') : t('Покупные владыки · 4 Scatter')}<small>{t('Спин активации без списания средств.')}</small></button>)}</div>}
      <div className="scene-options">{([
        ['reaction', t("Пробуждение бездны"), t("Два владыки Wild раскрывают барабаны.")],
        ['bigwin', t("Сокровища капитана"), t("Вся команда и большой выигрыш.")],
        ['devastation', t("Проклятый рейд"), t("Три Scatter открывают бесплатные вращения.")],
        ['reckoning', t("Владыки бездны"), t("Четыре Scatter и пробуждение всей команды.")],
      ] as const).map(([scenario, title, description]) => <button key={scenario} onClick={() => void previewScene(scenario)}>{title}<small>{description}</small></button>)}</div>
      {devGallery && <div className="scene-options"><button disabled={!millionAvailable} onClick={() => void previewMillion()}>{t('Бонус 1 000 000 CR · один раз')}<small>{millionAvailable ? t('10 демоспинов при ставке 100 CR. Доступен один раз в этом браузере.') : navigator.locks ? t('Одноразовый показ уже использован в этом браузере.') : t('Браузер не поддерживает одноразовый показ.')}</small></button></div>}
    </Dialog>}
    {!sessionFault && modal === 'rules' && <Dialog title={t("Кодекс капитана")} eyebrow={t("ПРАВИЛА И ТАБЛИЦА ВЫПЛАТ")} onClose={closeModal}>
      <div className="rules-badges"><span>{t("6 барабанов × 5 рядов")}</span><span>{t("19 фиксированных линий")}</span><span>{t("До")} {formatNumber(MAX_WIN_MULTIPLIER)}×</span></div>
      <p>{t("Комбинации из 3–6 одинаковых символов оплачиваются слева направо, начиная с первого барабана. На каждой линии учитывается самая длинная комбинация. Все выплаты указаны в множителях базовой ставки. Стоимость режима оплачивается отдельно и не увеличивает базу расчёта выигрыша.")}</p>
      <h3>{t("Режимы, стоимость и возврат")}</h3>
      <p>{t("Теоретический RTP каждого режима —")} <strong>{formatNumber(96, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%</strong>{t(": «Обычный спин» (1× базовой ставки), «Охота за сокровищами» (3×), «Зов глубин» (60×), «Проклятый рейд» (100×) и «Владыки бездны» (200×). В каждом режиме максимальный выигрыш полного раунда —")} <strong>{t("15 000× базовой ставки")}</strong>{t(", включая все бесплатные вращения. RTP описывает долгосрочный математический возврат и не гарантирует результат отдельной игровой сессии.")}</p>
      <p>{t("«Охота за сокровищами» повышает вероятность запуска бонуса в 5 раз. «Зов глубин» гарантирует не менее трёх Wild на спине и исключает Scatter. В меню режим включается бесплатно; его стоимость списывается при следующем вращении. Покупка «Проклятого рейда» или «Владык бездны» сразу запускает соответствующие 10 бесплатных вращений.")}</p>
      <h3>{t("Управление")}</h3>
      <p>{t("Круглая стрелка запускает вращение; пробел выполняет то же действие, если это разрешено для сессии. Кнопки «+» и «−» меняют базовую ставку. Молния включает турбо. Кнопка автоматических вращений открывает выбор длины серии, а квадрат останавливает её после текущего спина. Значок динамика управляет звуком. В настройках доступны правила и уменьшение движения. «Бонусы» открывает меню стоимости режимов и бонусов. Во время бонуса ставка фиксирована.")}</p>
      <h3>{t("Четыре владыки Wild")}</h3><div className="rule-wilds rules-wild-gallery">{WILD_ORDER.map(type => <div key={type}>
        <img src={symbolImageUrl(`wild-${type}`)} alt={`Wild · ${wildLabel(type)}`} width={96} height={96} draggable={false} />
        <strong style={{ color: WILD_TYPES[type].color }}>Wild · {wildLabel(type)}</strong><small>{t("Барабан")} {WILD_TYPES[type].linkedReel + 1}<br />{WILD_TYPES[type].multipliers.join(' / ')}×</small>
      </div>)}</div>
      <p>{t("Wild заменяет обычные символы. Множители всех Wild в одной выигрышной комбинации")} <strong>{t("складываются")}</strong>{t(". На своём барабане владыка раскрывается на всю высоту, если раскрытие участвует в выигрыше. Несколько раскрытий учитываются совместно.")}</p>
      <p>{t("Wild и Scatter появляются только на барабанах 2–5. На одном барабане может быть один специальный символ. Scatter не заменяется Wild.")}</p>
      <div className="rules-scatter">
        <img src={`${ASSET_BASE}symbols/scatter.webp`} alt="Scatter" width={88} height={88} draggable={false} />
        <div><strong>Scatter</strong><span>{t("3 символа — Проклятый рейд")}<br />{t("4 символа — Владыки бездны")}</span></div>
      </div>
      <h3>{t("Проклятый рейд · 3 Scatter")}</h3><p>{t("10 бесплатных вращений с повышенной частотой Wild. Два Scatter добавляют 2 вращения, три — 4.")}</p>
      {session.showCompassRules && <><h3>{getCompassCopy().title}</h3><p>{getCompassCopy().detail}</p><p>{getCompassCopy().rules}</p></>}
      <h3>{t("Владыки бездны · 4 Scatter")}</h3><p>{t("10 бесплатных вращений и все правила «Проклятого рейда». Попав на свой барабан, тип Wild активируется до конца бонуса. После активации этот тип может раскрываться на любом центральном барабане, если участвует в выигрыше. Сохраняется активация типа, а не сам Wild на поле.")}</p>
      <h3>{t("Выплаты за символы")}</h3><table className="paytable rules-paytable"><thead><tr><th scope="col">{t("Символ")}</th><th scope="col">3</th><th scope="col">4</th><th scope="col">5</th><th scope="col">6</th></tr></thead><tbody>{SYMBOLS.map(symbol => <tr key={symbol.id}>
        <td><div className="rules-pay-symbol"><img src={symbolImageUrl(symbol.id)} alt={symbolLabel(symbol.id)} width={72} height={72} draggable={false} /><span>{symbolLabel(symbol.id)}</span></div></td>
        {symbol.payouts.map((value, index) => <td key={index}>{formatNumber(value)}×</td>)}
      </tr>)}</tbody></table>
      <h3>{t("19 выигрышных линий")}</h3><div className="lines-grid">{PAYLINES.map((line, index) => <div key={index} className="line-mini"><small>{String(index + 1).padStart(2, '0')}</small><PaylineCanvas mini positions={line.map((row, col) => ({ row, col }))} label={t("Линия {p0}", { p0: index + 1 })} /></div>)}</div>
      <p>{t("Общий выигрыш за раунд, включая бонус, ограничен 15 000× ставки. При достижении лимита оставшиеся бесплатные вращения завершаются. Ставка фиксируется до конца бонуса.")} {session.live ? t("Баланс и незавершённый раунд восстанавливаются с сервера.") : session.replay ? t("Повтор не изменяет баланс и не принимает ставки.") : t("Баланс и полный незавершённый раунд сохраняются в этом браузере.")}</p>
      <p className="source-note rules-legal">{t("При неисправности все выигрыши и игровые операции аннулируются. Требуется стабильное подключение к интернету. При потере соединения перезагрузите игру, чтобы завершить незаконченные раунды. Ожидаемый возврат рассчитан на множество игр. Изображение игры носит иллюстративный характер и не представляет физическое устройство. Выигрыши рассчитываются по сумме, полученной от удалённого игрового сервера, а не по событиям в браузере. TM и © 2026 Engine.")}</p>
    </Dialog>}

    {celebration && !sessionFault && <CelebrationScreen currency={currency} celebration={celebration} bet={game.bet} reducedMotion={reducedMotion} animationHeld={curtain && !entryRevealed} transitioning={curtain || networkBusy || phase !== 'idle'} onReady={() => setBonusSceneReady(true)} onContinue={continueCelebration} />}
    {!startup && sessionFault && <Dialog title={t("Раунд приостановлен")} eyebrow={t("ПРОВЕРКА СЕССИИ")} dismissible={false} onClose={closeModal}><p>{sessionFault}</p><p>{t("Автоматическая повторная ставка отключена. Сначала восстановите подтверждённое состояние.")}</p><div className="modal-actions">{session.live ? <button className="secondary-button" disabled={networkBusy} onClick={() => void recoverSession()}>{networkBusy ? t("Проверяем…") : t("Проверить состояние на сервере")}</button> : <button className="secondary-button" onClick={() => location.reload()}>{t("Перезагрузить сохранённый раунд")}</button>}</div></Dialog>}
    {startup && <StartupScreen errorMessage={loadError} sessionMode={session.replay ? 'replay' : session.live ? 'server' : 'local'} reducedMotion={reducedMotion} progress={loadProgress} failed={loadFailed} onRetry={() => location.reload()} onStart={() => { laboratoryAudio.setEnabled(sound); setStartup(false); reactCaptain('wave'); if (session.replay) { setBonusPaused(false); setReplayQueued(true); } }} />}
    {bonusEntry && <BonusEntryTransition timeScale={1} mode={bonusEntry.mode} origin={bonusEntry.origin} reducedMotion={reducedMotion} revealReady={bonusSceneReady} onPhase={phase => { if (phase === 'reveal') setEntryRevealed(true); laboratoryAudio.bonusTransitionCue(phase); }} onCovered={() => entryCallbacks.current?.covered()} onComplete={() => entryCallbacks.current?.complete()} />}
    {toast && <div className="toast" role="status">{toast}</div>}
    {devGallery && renderProbeRequested() && <RenderProbe shellRef={shellRef} mode={probeMode} onModeChange={setRequestedProbe} disabled={!probeAllowed} />}
  </div>;
}
