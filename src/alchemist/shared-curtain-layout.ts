type Bounds = { left: number; top: number; width: number; height: number };
/** Undo only the common board CSS scale; each rig retains its local viewport. */
export function sharedCurtainOffset(board: Bounds, cell: Bounds, width: number, height: number) {
  return { x: (cell.left - board.left) * width / Math.max(1, board.width),
    y: (cell.top - board.top) * height / Math.max(1, board.height) };
}
/** Match the existing CSS inset's three decimal percentage precision. */
export function sharedCurtainClipHeight(height: number, progress: number) {
  return height * (1 - Number(((1 - Math.max(0, Math.min(1, progress))) * 100).toFixed(3)) / 100);
}
