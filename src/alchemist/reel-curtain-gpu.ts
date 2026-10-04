import type { AnimationState, Skeleton, TrackEntry } from '@esotericsoftware/spine-core';
import { applySailClothLayout, type SailClothLayout } from './sail-cloth-layout';

export type ReelCurtainCue = 'release' | 'open' | 'award';
export type ReelCurtainPlaybackSnapshot = { type: 'blue' | 'red' | 'gold' | 'green'; animation: 'reveal' | 'idle' | 'win'; trackTime: number };
/** A lost renderer's pose belongs only to the request that was interrupted. */
export class ReelCurtainRecovery {
  private snapshot: ReelCurtainPlaybackSnapshot | undefined;
  private readonly request: string;

  constructor(snapshot: ReelCurtainPlaybackSnapshot | undefined, type: string, phase: string) {
    this.snapshot = snapshot?.type === type ? snapshot : undefined;
    this.request = `${type}:${phase}`;
  }

  forRequest(type: string, phase: string) {
    if (`${type}:${phase}` !== this.request) this.snapshot = undefined;
    return this.snapshot;
  }
}
export type ReelCurtainLayout = SailClothLayout & {
  mode: 'reel'; width: number;
  anchors: Record<string, { fractionY?: number; tileIndex?: number; tileHeight?: number }>;
};
const anchorBindings = new WeakMap<Skeleton, { layout: ReelCurtainLayout; anchors: { bone: NonNullable<ReturnType<Skeleton['findBone']>>; anchor: ReelCurtainLayout['anchors'][string] }[] }>();
function boundAnchors(skeleton: Skeleton, layout: ReelCurtainLayout) {
  let binding = anchorBindings.get(skeleton);
  if (!binding || binding.layout !== layout) {
    const anchors = Object.entries(layout.anchors).flatMap(([name, anchor]) => {
      const bone = skeleton.findBone(name); return bone ? [{ bone, anchor }] : [];
    });
    binding = { layout, anchors }; anchorBindings.set(skeleton, binding);
  }
  return binding.anchors;
}

export function reelCurtainViewport(width: number, height: number, dpr: number, nativeWidth = 320) {
  width = Math.max(1, width); height = Math.max(1, height);
  return { width, height, resolution: Math.min(Math.max(dpr || 1, 1), 2), scale: width / nativeWidth,
    x: width / 2, y: height / 2, worldHeight: height / width * nativeWidth };
}

/** Reset before animation, then adapt after it; resize cannot accumulate offsets. */
export function resetReelCurtainAnchors(skeleton: Skeleton, layout: ReelCurtainLayout) {
  for (const { bone } of boundAnchors(skeleton, layout)) bone.setToSetupPose();
}
export function adaptReelCurtain(skeleton: Skeleton, layout: ReelCurtainLayout, worldHeight: number) {
  for (const { bone, anchor } of boundAnchors(skeleton, layout)) {
    if (anchor.tileIndex !== undefined) bone.y = -worldHeight / 2 + (anchor.tileIndex + .5) * (anchor.tileHeight ?? 320);
    else bone.y += (worldHeight - layout.baseHeight) * (anchor.fractionY ?? 0);
  }
  applySailClothLayout(skeleton, worldHeight, layout);
}

/** Keep an already queued idle track at the exact reveal handoff, including its elapsed time. */
export class ReelCurtainTrack {
  private requested = '';
  private entry: TrackEntry | null = null;
  private completed = false;
  private awarded = false;
  private animated = true;
  private active = true;
  private readonly state: AnimationState;
  private readonly cue: (cue: ReelCurtainCue) => void;
  private readonly complete: () => void;
  private readonly visible: () => boolean;

  constructor(state: AnimationState, cue: (cue: ReelCurtainCue) => void, complete: () => void, visible: () => boolean) {
    this.state = state; this.cue = cue; this.complete = complete; this.visible = visible;
    state.data.defaultMix = .16;
    state.data.setMix('reveal', 'idle', 0);
    state.addListener({
      event: (track, event) => {
        const name = event.data.name;
        if (track === this.entry && this.requested === 'reveal' && name === 'award') this.awarded = true;
        if (track === this.entry && this.requested === 'reveal' && this.animated && this.active && this.visible()
          && (name === 'release' || name === 'open' || name === 'award')) this.cue(name);
      },
      complete: track => { if (this.requested === 'reveal' && track === this.entry) this.finish(); },
    });
  }

  get selectionPending() { return this.requested === 'reveal' && this.animated && !this.completed && !this.awarded; }

  private finish() {
    if (this.completed) return;
    this.completed = true;
    this.complete();
  }

  configure(animation: 'reveal' | 'idle' | 'win', animated: boolean, active: boolean, timeScale: number) {
    this.animated = animated; this.active = active;
    this.state.timeScale = Math.max(.01, timeScale);
    if (this.requested !== animation) {
      const loop = animation !== 'reveal', current = this.state.getCurrent(0);
      const keep = current?.animation?.name === animation && current.loop === loop;
      this.entry = keep ? current : this.state.setAnimation(0, animation, loop);
      this.requested = animation;
      if (animation === 'reveal') {
        this.completed = false;
        this.awarded = false;
        if (!keep) this.state.addAnimation(0, 'idle', true, this.entry.animationEnd);
      }
    }
    // Preserve the existing reduced-motion contract: show the revealed scene
    // and resolve the game effect, without replaying sound cues.
    if (animation === 'reveal' && !animated && active && !this.completed && this.entry) {
      this.entry.trackTime = this.entry.animationEnd;
      this.state.update(0);
      this.finish();
    }
  }
}

/** A renderer recovery cannot replay game effects already delivered by the GPU. */
export class ReelCurtainSignals {
  private key = '';
  private completed = false;
  private cues = new Set<ReelCurtainCue>();
  reset(key: string) {
    if (this.key === key) return;
    this.key = key; this.completed = false; this.cues.clear();
  }
  cue(value: ReelCurtainCue, callback?: (value: ReelCurtainCue) => void) {
    if (this.cues.has(value)) return;
    this.cues.add(value); callback?.(value);
  }
  complete(callback?: () => void) {
    if (this.completed) return;
    this.completed = true; callback?.();
  }
}
