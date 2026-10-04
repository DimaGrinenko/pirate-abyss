import { useEffect, useRef } from 'react';
import { useAlchemistSpine } from './spineEffectsRuntime';
import { GpuBigwinScene } from './GpuBigwinScene';
import { matchingBigwinPlayback } from './bigwin-gpu-layout';
import type { BigwinPlayback } from './bigwin-gpu-layout';
import { afterVisiblePaint } from './visible-paint';

export type SpineEffectsProps = {
  kind: 'ambient' | 'curtain' | 'bigwin';
  active?: boolean;
  paused?: boolean;
  timeScale?: number;
  onComplete?: () => void;
  onReady?: () => void;
  reducedMotion?: boolean;
  tier?: 'big' | 'super' | 'mega' | 'epic' | 'legendary' | 'max';
  phase?: 'entrance' | 'celebrate' | 'exit';
  onEvent?: (name: string) => void;
};
export const BIGWIN_ENTRANCE_MS = 1800;
export const BIGWIN_BUILD_MS = 1600;
export const CURTAIN_DURATION_MS = 2600;
export const CURTAIN_COVERED_AT_MS = 780;

function CanvasSpineEffects({ kind, active = true, paused = false, timeScale = 1, onComplete, onReady, reducedMotion = false, tier = 'big', phase = 'entrance', onEvent, playback }: SpineEffectsProps & { playback?: BigwinPlayback }) {
  const completedFallback = useRef<string | null>(null);
  const readyDelivered = useRef(false);
  const readyCallback = useRef(onReady);
  readyCallback.current = onReady;
  const recovered = kind === 'bigwin' ? matchingBigwinPlayback(playback, tier, phase) : undefined;
  const recoveredIdle = recovered?.animation === `${tier}-idle`;
  const { canvasRef, ready, failed } = useAlchemistSpine({
    id: kind === 'bigwin' ? 'bigwin-v2' : kind === 'curtain' ? 'curtain-v2' : kind,
    animation: kind === 'curtain' ? 'transition' : kind === 'bigwin' ? recovered?.animation ?? `${tier}-${phase}` : 'idle',
    nextAnimation: kind === 'bigwin' && phase !== 'exit' && !recoveredIdle ? `${tier}-idle` : undefined,
    animationKey: kind === 'bigwin' ? `${tier}:${phase}` : undefined,
    active: active && !paused, timeScale, animated: kind === 'curtain' || !reducedMotion,
    loop: kind === 'ambient' || recoveredIdle, initialTrackTime: recovered?.trackTime,
    width: kind === 'ambient' ? 1600 : 1200, height: kind === 'bigwin' ? 675 : kind === 'curtain' ? 1000 : 900,
    stretch: kind === 'ambient', fit: kind === 'curtain' ? 'cover' : 'contain', onComplete, onEvent,
  });
  useEffect(() => {
    if (!active || (!ready && !failed) || readyDelivered.current) return;
    // Canvas paints its held pose during loading. If both renderers fail, the
    // live amount and DOM scenery still release the same operable lifecycle.
    return afterVisiblePaint(() => { readyDelivered.current = true; readyCallback.current?.(); });
  }, [active, ready, failed]);
  useEffect(() => {
    // A failed renderer must never trap the player in a closing celebration.
    if (!failed || !active || kind !== 'bigwin') { completedFallback.current = null; return; }
    const key = `${tier}:${phase}`;
    if (completedFallback.current === key || !onComplete) return;
    completedFallback.current = key;
    onComplete();
  }, [failed, active, kind, tier, phase, onComplete]);
  if (!active) return null;
  return <canvas ref={canvasRef} aria-hidden="true" data-spine={kind} data-spine-ready={ready} data-spine-error={failed || undefined} data-celebration-phase={kind === 'bigwin' ? phase : undefined} data-bigwin-renderer={kind === 'bigwin' ? 'canvas' : undefined}
    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', display: 'block' }} />;
}

export function SpineEffects(props: SpineEffectsProps) {
  if (props.kind === 'bigwin') return <GpuBigwinScene {...props} renderFallback={callbacks => <CanvasSpineEffects {...props} {...callbacks} />} />;
  return <CanvasSpineEffects {...props} />;
}
export default SpineEffects;
