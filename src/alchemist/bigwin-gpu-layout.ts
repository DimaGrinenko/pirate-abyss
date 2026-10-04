import type { Skeleton } from '@esotericsoftware/spine-core';

export type BigwinPortraitLayout = {
  height?: number;
  bones: Record<string, { dx?: number; dy?: number; scale?: number }>;
  slots: Record<string, [string, string]>;
};

export type BigwinPlayback = { phaseKey: string; animation: string; trackTime: number };

/** A lost old phase must never seek a new phase or a different tier. */
export function matchingBigwinPlayback(playback: BigwinPlayback | undefined, tier: string, phase: string) {
  if (!playback || playback.phaseKey !== `${tier}:${phase}` || !Number.isFinite(playback.trackTime)) return undefined;
  if (playback.animation === `${tier}-${phase}` || (phase !== 'exit' && playback.animation === `${tier}-idle`)) return playback;
  return undefined;
}

/** Same 1200×675 / portrait authored camera and DPR as the Canvas renderer. */
export function bigwinGpuLayout(width: number, height: number, devicePixelRatio: number, portraitHeight = 2400) {
  const w = Math.max(1, width), h = Math.max(1, height), portrait = w / h < .72;
  return {
    width: w, height: h, portrait, resolution: Math.min(devicePixelRatio || 1, 2),
    scale: Math.min(w / 1200, h / (portrait ? portraitHeight : 675)), x: w / 2, y: h / 2,
  };
}

/** Restore before applying animation so paused/resized portrait offsets cannot accumulate. */
export function resetBigwinResponsiveBones(skeleton: Skeleton, layout: BigwinPortraitLayout) {
  for (const name of Object.keys(layout.bones)) skeleton.findBone(name)?.setToSetupPose();
}

export function applyBigwinResponsiveLayout(skeleton: Skeleton, layout: BigwinPortraitLayout, portrait: boolean) {
  for (const [slot, names] of Object.entries(layout.slots)) skeleton.setAttachment(slot, names[portrait ? 1 : 0]);
  if (portrait) for (const [name, placement] of Object.entries(layout.bones)) {
    const bone = skeleton.findBone(name);
    if (!bone) continue;
    bone.x += placement.dx ?? 0; bone.y += placement.dy ?? 0;
    bone.scaleX *= placement.scale ?? 1; bone.scaleY *= placement.scale ?? 1;
  }
}

/** Resolve this immutable layout once per skeleton, instead of searching every
 * bone/slot and allocating entries on every animation frame. Attachments are
 * still resolved through the current skin so a skin change remains correct. */
export function createBigwinResponsivePose(skeleton: Skeleton, layout: BigwinPortraitLayout) {
  const bones = Object.entries(layout.bones).flatMap(([name, placement]) => {
    const bone = skeleton.findBone(name);
    return bone ? [{ bone, dx: placement.dx ?? 0, dy: placement.dy ?? 0, scale: placement.scale ?? 1 }] : [];
  });
  const slots = Object.entries(layout.slots).map(([name, names]) => {
    const slot = skeleton.findSlot(name);
    if (!slot) throw new Error(`Slot not found: ${name}`);
    return { slot, names };
  });
  return {
    reset() { for (const { bone } of bones) bone.setToSetupPose(); },
    apply(portrait: boolean) {
      for (const { slot, names } of slots) {
        const name = names[portrait ? 1 : 0];
        const attachment = name ? skeleton.getAttachment(slot.data.index, name) : null;
        if (name && !attachment) throw new Error(`Attachment not found: ${name}, for slot: ${slot.data.name}`);
        slot.setAttachment(attachment);
      }
      if (portrait) for (const { bone, dx, dy, scale } of bones) {
        bone.x += dx; bone.y += dy; bone.scaleX *= scale; bone.scaleY *= scale;
      }
    },
  };
}

/** Phase callbacks stay at-most-once even if a lost GL context starts Canvas recovery. */
export class BigwinPhaseDelivery {
  private phase = '';
  private completed = false;
  private readonly cues = new Set<string>();

  begin(phase: string) {
    if (this.phase === phase) return;
    this.phase = phase; this.completed = false; this.cues.clear();
  }

  complete(phase: string) {
    if (phase !== this.phase || this.completed) return false;
    this.completed = true; return true;
  }

  cue(phase: string, name: string) {
    if (phase !== this.phase || this.cues.has(name)) return false;
    this.cues.add(name); return true;
  }
}
