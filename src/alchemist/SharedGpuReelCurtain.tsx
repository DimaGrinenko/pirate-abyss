import { useEffect, useRef, useState } from 'react';
import type { Spine } from '@esotericsoftware/spine-pixi-v7';
import { VisiblePaintedSpine } from './VisiblePaintedSpine';
import type { ReelCurtainProps } from './ReelCurtain';
import { ReelCurtainAward } from './ReelCurtainAward';
import { adaptReelCurtain, ReelCurtainTrack, resetReelCurtainAnchors, type ReelCurtainPlaybackSnapshot } from './reel-curtain-gpu';
import { loadGpuCurtain } from './reel-curtain-gpu-assets';
import { applyReelCurtainEntrance, reelCurtainEntranceProgress } from './reel-curtain-entrance';
import type { CurtainView, SharedCurtainStage } from './shared-curtain-stage';
import { positionSpineOverlay } from './position-spine-overlay';

export function SharedGpuReelCurtain(props: ReelCurtainProps & {
  stage: SharedCurtainStage;
  onFailure: (snapshot?: ReelCurtainPlaybackSnapshot) => void;
}) {
  const { stage, type, multiplier, phase = 'idle', animated = true, active = true, winning = false, timeScale = 1, onFailure } = props;
  const host = useRef<HTMLDivElement>(null), overlay = useRef<HTMLDivElement>(null), selection = useRef<HTMLSpanElement>(null);
  const latest = useRef(props); latest.current = props;
  const configureRef = useRef<(() => void) | null>(null);
  const completed = useRef(false), awarded = useRef(false);
  const [readyType, setReadyType] = useState('');

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false, failed = false, ready = false;
    let lease: ReturnType<SharedCurtainStage['register']> | undefined;
    let spine: Spine | undefined;
    let view: CurtainView;
    const snapshot = (): ReelCurtainPlaybackSnapshot | undefined => {
      const current = spine?.state.getCurrent(0), name = current?.animation?.name;
      return current && (name === 'reveal' || name === 'idle' || name === 'win')
        ? { type, animation: name, trackTime: current.trackTime } : undefined;
    };
    const fail = () => {
      if (disposed || failed) return;
      failed = true;
      const playback = snapshot();
      configureRef.current = null;
      if (lease) { lease.dispose(); lease = undefined; }
      else if (spine && !spine.destroyed) spine.destroy({ children: true, texture: false, baseTexture: false });
      spine = undefined;
      onFailure(playback);
    };
    void loadGpuCurtain(type).then(({ data, layout }) => {
      if (disposed || failed) return;
      const actor = new VisiblePaintedSpine(data); spine = actor;
      const awardBone = actor.skeleton.findBone('award');
      let previousPhase: ReelCurtainProps['phase'];
      const track = new ReelCurtainTrack(actor.state, cue => {
        if (cue === 'award') { awarded.current = true; if (selection.current) selection.current.dataset.selecting = 'false'; }
        latest.current.onCue?.(cue);
      }, () => {
        completed.current = true;
        if (selection.current) selection.current.dataset.selecting = 'false';
        latest.current.onComplete?.();
      }, () => !document.hidden);
      actor.beforeUpdateWorldTransforms = () => adaptReelCurtain(actor.skeleton, layout, view.worldHeight);
      lease = stage.register({
        element, spine: actor, nativeWidth: layout.width,
        playing: () => latest.current.animated !== false && latest.current.active !== false,
        update: (delta, viewport) => {
          view = viewport;
          resetReelCurtainAnchors(actor.skeleton, layout);
          actor.update(delta);
          const current = actor.state.getCurrent(0), animation = current?.animation?.name;
          applyReelCurtainEntrance(element, animation, current?.trackTime ?? 0, latest.current.animated !== false);
          if (element.dataset.spineAnimation !== animation) element.dataset.spineAnimation = animation;
          if (awardBone && overlay.current) {
            positionSpineOverlay(overlay.current, view.x + awardBone.worldX * view.scale, view.y + awardBone.worldY * view.scale, awardBone.a, -awardBone.d);
          }
          return reelCurtainEntranceProgress(animation, current?.trackTime ?? 0, latest.current.animated !== false);
        },
        rendered: () => { if (!disposed && !failed && !ready) { ready = true; setReadyType(type); } },
        failed: fail,
      });
      const configure = () => {
        if (disposed || failed) return;
        const current = latest.current, currentPhase = current.phase ?? 'idle';
        if (previousPhase !== currentPhase) { completed.current = false; awarded.current = false; previousPhase = currentPhase; }
        track.configure(currentPhase === 'reveal' ? 'reveal' : current.winning ? 'win' : 'idle', current.animated !== false, current.active !== false, current.timeScale ?? 1);
        if (selection.current) selection.current.dataset.selecting = String(track.selectionPending);
        lease?.invalidate();
      };
      configureRef.current = configure;
      configure(); lease.paint();
    }).catch(fail);
    return () => {
      disposed = true; configureRef.current = null;
      if (lease) lease.dispose(); else if (spine && !spine.destroyed) spine.destroy({ children: true, texture: false, baseTexture: false });
      spine = undefined;
    };
  }, [stage, type, onFailure]);

  useEffect(() => { configureRef.current?.(); }, [phase, animated, active, winning, timeScale]);
  return <div ref={host} className={`alchemist-reel-curtain alchemist-reel-curtain--${type}`} data-phase={phase}
    data-animated={animated} data-ready={readyType === type} data-failed={false} data-winning={winning}
    data-curtain-renderer="webgl-shared" data-spine={`reel-${type}`}>
    <ReelCurtainAward type={type} multiplier={multiplier} overlayRef={overlay} selectionRef={selection}
      selecting={phase === 'reveal' && animated && !completed.current && !awarded.current} />
  </div>;
}
