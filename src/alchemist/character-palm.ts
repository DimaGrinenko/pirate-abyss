/** The new palm briefly turns edge-on while changing its painted pose. */
type PalmSkeleton = {
  findBone(name: string): { scaleX: number } | null;
  findSlot(name: string): { color: { a: number } } | null;
};

/** Run after AnimationState.apply and before updating world transforms. */
export function applyCaptainPalmTurn(skeleton: PalmSkeleton): void {
  applyPalm(skeleton.findBone('palmTurn'), skeleton.findSlot('v11-arm-hand-wave'), skeleton.findSlot('v11-arm-hand-relaxed'));
}

/** Bind immutable rig references once instead of searching bones/slots in
 * every animation frame. The values themselves still follow native timelines. */
export function createCaptainPalmTurn(skeleton: PalmSkeleton): () => void {
  const bone = skeleton.findBone('palmTurn'), open = skeleton.findSlot('v11-arm-hand-wave'), relaxed = skeleton.findSlot('v11-arm-hand-relaxed');
  return () => applyPalm(bone, open, relaxed);
}

function applyPalm(bone: ReturnType<PalmSkeleton['findBone']>, open: ReturnType<PalmSkeleton['findSlot']>, relaxed: ReturnType<PalmSkeleton['findSlot']>): void {
  if (!bone || !open || !relaxed) return;

  const total = open.color.a + relaxed.color.a;
  if (total < 1e-6) return;
  const openFraction = Math.max(0, Math.min(1, open.color.a / total));
  const mixedWidth = 1 - .62 * Math.sin(Math.PI * openFraction) ** 2;
  // Absolute bound, rather than multiplication: repeated paused renders
  // preserve the authored turn and cannot progressively collapse the palm.
  bone.scaleX = Math.max(.38, Math.min(bone.scaleX, mixedWidth));
  // Select one opaque painting at the narrowest part of the turn. Crossfading
  // different finger outlines produces a translucent double hand.
  open.color.a = openFraction >= .5 ? total : 0;
  relaxed.color.a = openFraction >= .5 ? 0 : total;
}
