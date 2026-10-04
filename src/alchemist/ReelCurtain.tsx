import { useCallback, useEffect, useRef, useState } from 'react';
import { useAlchemistSpine } from './spineEffectsRuntime';
import { GpuReelCurtain } from './GpuReelCurtain';
import { ReelCurtainAward } from './ReelCurtainAward';
import { ReelCurtainRecovery, ReelCurtainSignals, type ReelCurtainPlaybackSnapshot } from './reel-curtain-gpu';
import { assetUrl } from './assets';
import { reelCurtainDurationMs, reelCurtainTimeScale } from './reel-curtain-timing';
import './effects.css';
import './reel-curtains-v5.css';
export const REEL_CURTAIN_DURATION_MS = reelCurtainDurationMs();
export type ReelCurtainProps = {
  type: 'blue' | 'red' | 'gold' | 'green';
  multiplier: number;
  phase?: 'reveal' | 'idle';
  animated?: boolean;
  active?: boolean;
  winning?: boolean;
  onComplete?: () => void;
  onCue?: (cue: 'release' | 'open' | 'award') => void;
  timeScale?: number;
};
/** A distinct cartoon world per expanded reel; anchored parts retain their proportions. */
function CanvasReelCurtain({ type, multiplier, phase = 'idle', animated = true, active = true, winning = false, onComplete, onCue, timeScale = 1, initialPlayback }: ReelCurtainProps & { initialPlayback?: ReelCurtainPlaybackSnapshot }) {
  const completed = useRef(false);
  const selectionRef = useRef<HTMLSpanElement>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const finishReveal = useCallback(() => {
    if (completed.current) return;
    completed.current = true;
    if (selectionRef.current) selectionRef.current.dataset.selecting = 'false';
    completeRef.current?.();
  }, []);
  useEffect(() => { completed.current = false; }, [phase, type]);
  const cueRef = useRef(onCue);
  cueRef.current = onCue;
  const handleEvent = useCallback((name: string) => {
    if (name === 'award' && selectionRef.current) selectionRef.current.dataset.selecting = 'false';
    if (name === 'release' || name === 'open' || name === 'award') cueRef.current?.(name);
  }, []);
  const recovery = useRef(new ReelCurtainRecovery(initialPlayback, type, phase));
  const playback = recovery.current.forRequest(type, phase);
  const recoveredReveal = phase === 'reveal' && playback?.animation === 'idle';
  const animation = phase === 'reveal' && !recoveredReveal ? 'reveal' : winning ? 'win' : 'idle';
  const { canvasRef, overlayRef, ready, failed } = useAlchemistSpine({
    id: `reel-${type}`, animation,
    nextAnimation: phase === 'reveal' && !recoveredReveal ? 'idle' : undefined,
    loop: phase !== 'reveal' || recoveredReveal, width: 320, height: 1600,
    initialTrackTime: playback?.animation === animation ? playback.trackTime : undefined,
    animated, active, onComplete: phase === 'reveal' && !recoveredReveal ? finishReveal : undefined, timeScale, overlayBone: 'award',
    onEvent: phase === 'reveal' ? handleEvent : undefined,
  });
  useEffect(() => {
    if (active && phase === 'reveal' && (failed || !animated || recoveredReveal)) finishReveal();
  }, [phase, failed, animated, active, recoveredReveal, finishReveal]);
  useEffect(() => {
    if (selectionRef.current) selectionRef.current.dataset.selecting = String(phase === 'reveal' && animated && !failed && !completed.current);
  }, [phase, type, animated, failed]);
  return <div className={`alchemist-reel-curtain alchemist-reel-curtain--${type}`} data-phase={phase} data-animated={animated} data-ready={ready} data-failed={failed} data-winning={winning}>
    {failed && <img className="alchemist-reel-curtain__fallback" src={assetUrl(`alchemist/effects/reel-${type}-fallback.webp`)} alt="" draggable={false} />}
    <canvas ref={canvasRef} data-spine={`reel-${type}`} data-spine-ready={ready} data-spine-error={failed || undefined} aria-hidden="true" />
    <ReelCurtainAward type={type} multiplier={multiplier} overlayRef={overlayRef} selectionRef={selectionRef}
      selecting={phase === 'reveal' && animated && !failed && !completed.current} />
  </div>;
}
export function ReelCurtain(props: ReelCurtainProps) {
  const [recovery, setRecovery] = useState<{ snapshot?: ReelCurtainPlaybackSnapshot } | null>(null);
  const signals = useRef(new ReelCurtainSignals());
  signals.current.reset(`${props.type}:${props.phase ?? 'idle'}`);
  const latest = useRef(props); latest.current = props;
  const complete = useCallback(() => signals.current.complete(latest.current.onComplete), []);
  const cue = useCallback((value: 'release' | 'open' | 'award') => signals.current.cue(value, latest.current.onCue), []);
  const recover = useCallback((snapshot?: ReelCurtainPlaybackSnapshot) => setRecovery({ snapshot }), []);
  const timeScale = reelCurtainTimeScale(props.timeScale);
  return recovery
    ? <CanvasReelCurtain {...props} timeScale={timeScale} onComplete={complete} onCue={cue} initialPlayback={recovery.snapshot} />
    : <GpuReelCurtain {...props} timeScale={timeScale} onComplete={complete} onCue={cue} onFailure={recover} />;
}
export default ReelCurtain;
