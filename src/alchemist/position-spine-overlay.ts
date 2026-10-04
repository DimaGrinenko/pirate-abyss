type Overlay = { style: Pick<CSSStyleDeclaration, 'left' | 'top' | 'transform'> };
type Pose = { x: number; y: number; scaleX: number; scaleY: number };
const poses = new WeakMap<Overlay, Pose>();

/** Follow a native bone without moving a layout box on each animation frame.
 * Translation precedes the unchanged centering/scale, so every text corner
 * remains at its previous screen coordinate, including mirrored Y cameras. */
export function positionSpineOverlay(element: Overlay, x: number, y: number, scaleX: number, scaleY: number) {
  let previous = poses.get(element);
  if (previous && previous.x === x && previous.y === y && previous.scaleX === scaleX && previous.scaleY === scaleY) return false;
  if (!previous) {
    element.style.left = '0px'; element.style.top = '0px';
    previous = { x, y, scaleX, scaleY }; poses.set(element, previous);
  } else { previous.x = x; previous.y = y; previous.scaleX = scaleX; previous.scaleY = scaleY; }
  element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${scaleX}, ${scaleY})`;
  return true;
}
