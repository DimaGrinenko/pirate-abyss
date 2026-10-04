// One camera for the coherent captain and all twenty Spine performances.
// The fixed bounds enclose hands, feather and lantern without changing scale.
// The v31 cutlass reaches x=-918.93 during triumph. Preserve the body camera
// while keeping its entire sweep inside the transparent gesture gutter.
export const CHARACTER_VIEW = { left: -924, right: 620, bottom: 0, top: 1560 } as const;
// Centre of the painted boot contact span in the native setup pose. The same
// anchor centres both the circular deck and the character host, not the sword.
export const CAPTAIN_STANCE_CENTER = -16.621673583984375;
export const CAPTAIN_PLATFORM = { left: CAPTAIN_STANCE_CENTER - 410, top: 155, width: 820 } as const;
// The raster fallback uses the same camera, including the poster's letterbox.
// Its world-to-pixel transform is independent from the body host's aspect ratio.
export const CAPTAIN_POSTER_SIZE = { width: 768, height: 813 } as const;

// Native v15 lantern flame at the 0.5 s summon release. The gesture changes its
// world position even when the underlying connected arm geometry is retained.
// The native-pose test keeps the ceremony's origin registered to the lantern.
export const CAPTAIN_SUMMON_FLAME = { x: 423.64858722443216, y: 547.1179771303914 } as const;

// Preserve the accepted body size and placement. The raised hand gets a
// transparent canvas gutter instead of shrinking the whole captain to fit.
const BODY_COMPOSITION = { left: CAPTAIN_STANCE_CENTER - 591, right: CAPTAIN_STANCE_CENTER + 591 } as const;
export function captainPlacement(width: number, height: number) {
  const compositionWidth = BODY_COMPOSITION.right - BODY_COMPOSITION.left;
  const scale = Math.min(width / compositionWidth, height / (CHARACTER_VIEW.top - CHARACTER_VIEW.bottom));
  const gutterLeft = (BODY_COMPOSITION.left - CHARACTER_VIEW.left) * scale;
  const gutterRight = (CHARACTER_VIEW.right - BODY_COMPOSITION.right) * scale;
  return {
    scale,
    gutterLeft,
    gutterRight,
    canvasWidth: width + gutterLeft + gutterRight,
    originX: width / 2 - (BODY_COMPOSITION.left + compositionWidth / 2) * scale,
    originY: height + CHARACTER_VIEW.bottom * scale,
  };
}

export function captainPosterPlacement(width: number, height: number) {
  const live = captainPlacement(width, height);
  const posterScale = Math.min(CAPTAIN_POSTER_SIZE.width / (CHARACTER_VIEW.right - CHARACTER_VIEW.left),
    CAPTAIN_POSTER_SIZE.height / (CHARACTER_VIEW.top - CHARACTER_VIEW.bottom));
  const posterOriginX = CAPTAIN_POSTER_SIZE.width / 2 - (CHARACTER_VIEW.left + CHARACTER_VIEW.right) / 2 * posterScale;
  const posterOriginY = CAPTAIN_POSTER_SIZE.height / 2 + (CHARACTER_VIEW.bottom + CHARACTER_VIEW.top) / 2 * posterScale;
  const pixelScale = live.scale / posterScale;
  return {
    left: live.originX - posterOriginX * pixelScale,
    top: live.originY - posterOriginY * pixelScale,
    width: CAPTAIN_POSTER_SIZE.width * pixelScale,
    height: CAPTAIN_POSTER_SIZE.height * pixelScale,
  };
}
