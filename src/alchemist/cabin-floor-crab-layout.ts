export type FloorRect = { left: number; top: number; right: number; bottom: number };
export type CrabLane = FloorRect & { size: number; travel: number; placement: 'below' | 'side' };

/** All inputs use environment-local CSS pixels. Floor registration constrains
 * the feet, not the top of the character's transparent sprite square. */
export function floorCrabLanes(width: number, height: number, board: FloorRect, hud: FloorRect, readout?: FloorRect): CrabLane[] {
  const scale = Math.max(width / 1672, height / 941);
  const ox = (width - 1672 * scale) / 2, oy = (height - 941 * scale) / 2;
  // Clear wood between the left boulders and right chest/coral. Original art
  // floor starts around y720 here; feet keep another 22 native pixels clear.
  const floorLeft = Math.max(8, ox + 620 * scale), floorRight = Math.min(width - 8, ox + 1220 * scale);
  const floorY = oy + 742 * scale;
  const bottom = Math.min(hud.top - 6, height - 8);
  const top = board.bottom + 13; // Include the frame's actual painted outer rim.
  const center = (board.left + board.right) / 2;
  const reserve = Math.min(260, (board.right - board.left) * .42);
  const labelLeft = Math.min(center - reserve / 2, readout ? readout.left - 9 : Infinity);
  const labelRight = Math.max(center + reserve / 2, readout ? readout.right + 9 : -Infinity);
  const candidates: (FloorRect & { placement: CrabLane['placement'] })[] = [
    { left: Math.max(floorLeft, board.left + 8), right: Math.min(floorRight, labelLeft), top, bottom, placement: 'below' },
    { left: Math.max(floorLeft, labelRight), right: Math.min(floorRight, board.right - 8), top, bottom, placement: 'below' },
    // A short viewport may leave only a side strip beside the lower frame.
    // These strips are geometrically outside the frame, never drawn over it.
    { left: floorLeft, right: Math.min(floorRight, board.left - 16), top: Math.max(8, floorY - 56), bottom, placement: 'side' },
    { left: Math.max(floorLeft, board.right + 16), right: floorRight, top: Math.max(8, floorY - 56), bottom, placement: 'side' },
  ];
  const result: CrabLane[] = [];
  for (const candidate of candidates) {
    const span = candidate.right - candidate.left, available = candidate.bottom - candidate.top;
    // The feet are at 84% of the stage; 16% is empty sprite margin. Applying
    // floorY to the stage TOP used to wrongly hide both crabs in wide Chrome.
    const floorAllowance = (candidate.bottom - floorY) / .16;
    const size = Math.min(68, available, span * .65, floorAllowance);
    if (span < 44 || size < 20) continue;
    const lane = { ...candidate, top: candidate.bottom - size, size, travel: Math.max(0, span - size) };
    if (result.some(other => lane.left < other.right + 4 && lane.right > other.left - 4 && lane.top < other.bottom + 4 && lane.bottom > other.top - 4)) continue;
    result.push(lane);
    if (result.length === 2) break;
  }
  return result;
}
