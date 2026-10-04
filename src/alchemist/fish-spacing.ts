export type FishWaterPolygon = readonly (readonly [number, number])[];
export type FishSpacingRoute = { name: string; window?: string; width: number; height: number };
export type FishSpacingPose = { x: number; y: number };
type Body = { x: number; y: number; vx: number; vy: number; targetX: number; targetY: number; rx: number; ry: number; water: Water; group: string };
type Water = { left: Float64Array; right: Float64Array; minY: number; maxY: number; minX: number };
const clamp = (v: number, low: number, high: number) => Math.max(low, Math.min(high, v));
const waterCache = new WeakMap<FishWaterPolygon, Map<string, Water>>();

/** Conservative screen-space envelopes, including the closed mesh's yaw,
 * perspective, pitch, roll and fin/tail deformation. Audited against vertices;
 * neither alpha nor depth is used to excuse one visible fish crossing another. */
export function fishSpacingEnvelope(route: Pick<FishSpacingRoute, 'width' | 'height'>) {
  return { rx: route.width * .70, ry: route.height * .72 };
}

function waterFor(polygon: FishWaterPolygon, rx: number, ry: number): Water {
  const key = `${rx}:${ry}`, existing = waterCache.get(polygon)?.get(key);
  if (existing) return existing;
  const minY = Math.ceil(Math.min(...polygon.map(p => p[1])) + ry + 2);
  const maxY = Math.floor(Math.max(...polygon.map(p => p[1])) - ry - 2);
  const left = new Float64Array(Math.max(1, maxY + 2)).fill(Infinity);
  const right = new Float64Array(left.length).fill(-Infinity);
  // A rectangle enclosing the footprint must fit the navigable water. Edge
  // extrema occur at polygon vertices or the rectangle's top/bottom. Compute
  // this once: there are no polygon scans or allocations in the animation loop.
  const sliceResult = [0, 0];
  const slice = (y: number) => {
    let lo = Infinity, hi = -Infinity;
    for (let j = 0, k = polygon.length - 1; j < polygon.length; k = j++) {
      const a = polygon[k], b = polygon[j];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
        const x = a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]);
        lo = Math.min(lo, x); hi = Math.max(hi, x);
      }
    }
    sliceResult[0] = lo; sliceResult[1] = hi;
    return sliceResult;
  };
  let first = maxY, last = minY;
  for (let y = minY; y <= maxY; y++) {
    let lo = -Infinity, hi = Infinity;
    const samples = [y - ry - 1, y + ry + 1];
    for (const point of polygon) if (point[1] > samples[0] && point[1] < samples[1]) samples.push(point[1]);
    for (const yy of samples) { const s = slice(yy); lo = Math.max(lo, s[0] + rx + 1); hi = Math.min(hi, s[1] - rx - 1); }
    if (lo <= hi) { left[y] = lo; right[y] = hi; first = Math.min(first, y); last = Math.max(last, y); }
  }
  if (first >= last) throw Error('Fish body does not fit its navigable window');
  // Keep avoidance active beyond the navigable-water edge until even the
  // broad painted window/foreground boundary has completely hidden the body.
  const water = { left, right, minY: first, maxY: last, minX: Math.min(...polygon.map(p => p[0])) - 64 };
  let cache = waterCache.get(polygon);
  if (!cache) { cache = new Map(); waterCache.set(polygon, cache); }
  cache.set(key, water);
  return water;
}

/** Positive means separated on this support axis. A nonnegative value proves
 * that the two complete ellipses are disjoint, including their safety gap. */
export function fishEllipseClearance(a: FishSpacingPose & { rx: number; ry: number }, b: FishSpacingPose & { rx: number; ry: number }, gap = 2) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let nx = dx / ((a.rx + b.rx) ** 2), ny = dy / ((a.ry + b.ry) ** 2);
  const length = Math.hypot(nx, ny);
  if (length < 1e-9) return -(a.ry + b.ry + gap);
  nx /= length; ny /= length;
  return Math.max(Math.abs(dx) - a.rx - b.rx - gap, Math.abs(dy) - a.ry - b.ry - gap,
    dx * nx + dy * ny - Math.hypot(a.rx * nx, a.ry * ny) - Math.hypot(b.rx * nx, b.ry * ny) - gap);
}

/** Fifteen bodies, grouped by porthole (66 + 3 possible pairs). A damped
 * tracker anticipates neighbours; a bounded position solve enforces clearance.
 * The art's route/yaw/animation stays intact. This changes only swim centres. */
export class FishSchoolSpacing {
  private bodies: Body[];
  private ready = false;
  private wasInPassage = false;
  private oldX: Float64Array;
  private oldY: Float64Array;
  private accelX: Float64Array;
  private accelY: Float64Array;
  private pairs: [number, number][] = [];
  maxCorrection = 0;

  constructor(routes: readonly FishSpacingRoute[], navigation: Record<string, FishWaterPolygon>) {
    this.bodies = routes.map(route => {
      const size = fishSpacingEnvelope(route), group = route.window ?? 'main';
      if (!navigation[group]) throw Error(`Missing fish navigation for ${group}`);
      return { ...size, x: 0, y: 0, vx: 0, vy: 0, targetX: 0, targetY: 0, group, water: waterFor(navigation[group], size.rx, size.ry) };
    });
    for (let i = 0; i < routes.length; i++) for (let j = i + 1; j < routes.length; j++) if (this.bodies[i].group === this.bodies[j].group) this.pairs.push([i, j]);
    this.oldX = new Float64Array(routes.length); this.oldY = new Float64Array(routes.length);
    this.accelX = new Float64Array(routes.length); this.accelY = new Float64Array(routes.length);
  }

  private contain(body: Body, passage: boolean) {
    const w = body.water;
    body.y = clamp(body.y, w.minY, w.maxY);
    const row = Math.floor(body.y), next = Math.min(row + 1, w.maxY), fraction = body.y - row;
    const lo = w.left[row] + (w.left[next] - w.left[row]) * fraction;
    const hi = w.right[row] + (w.right[next] - w.right[row]) * fraction;
    body.x = clamp(body.x, passage ? -Infinity : lo, hi);
  }

  private solve(passage: boolean, iterations: number) {
    let largest = 0;
    for (let pass = 0; pass < iterations; pass++) {
      let error = 0;
      for (const [i, j] of this.pairs) {
        const a = this.bodies[i], b = this.bodies[j];
        if (passage && a.x + a.rx < a.water.minX && b.x + b.rx < b.water.minX) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        if (Math.abs(dx) >= a.rx + b.rx + 3 || Math.abs(dy) >= a.ry + b.ry + 3) continue;
        let nx = dx / ((a.rx + b.rx) ** 2), ny = dy / ((a.ry + b.ry) ** 2), length = Math.hypot(nx, ny);
        if (length < 1e-9) { nx = 0; ny = (i + j) % 2 ? 1 : -1; length = 1; }
        nx /= length; ny /= length;
        const overlap = Math.hypot(a.rx * nx, a.ry * ny) + Math.hypot(b.rx * nx, b.ry * ny) + 3.002 - dx * nx - dy * ny;
        if (overlap <= 0) continue;
        const correction = overlap * .5;
        a.x -= nx * correction; a.y -= ny * correction;
        b.x += nx * correction; b.y += ny * correction;
        this.contain(a, passage); this.contain(b, passage);
        error = Math.max(error, overlap); largest = Math.max(largest, correction);
      }
      if (error < .002) break;
    }
    return largest;
  }

  /** Poses are world coordinates and mutable caller-owned records. Passage
   * relaxes only the left boundary, allowing a physical exit behind foreground. */
  apply(poses: FishSpacingPose[], delta: number, passage = false, settled = false) {
    // Pausing an already visible school freezes its solved pose. The only
    // static reposition after startup is a reduced-motion return from outside.
    if (!this.ready || (settled && !passage && this.wasInPassage)) {
      for (let i = 0; i < this.bodies.length; i++) {
        const b = this.bodies[i], p = poses[i]; b.x = b.targetX = p.x; b.y = b.targetY = p.y; b.vx = b.vy = 0; this.contain(b, passage);
      }
      this.solve(passage, 180); this.ready = true;
    } else if (delta > 0 && !settled) {
      // Small substeps preserve the same response through delayed display frames.
      const steps = Math.ceil(Math.min(delta, .1) / (1 / 60)), dt = Math.min(delta, .1) / steps;
      this.accelX.fill(0); this.accelY.fill(0);
      for (const [i, j] of this.pairs) {
        const a = this.bodies[i], b = this.bodies[j];
        const dx = b.x + b.vx * .65 - a.x - a.vx * .65, dy = b.y + b.vy * .65 - a.y - a.vy * .65;
        const sx = a.rx + b.rx + 13, sy = a.ry + b.ry + 13;
        const proximity = dx * dx / (sx * sx) + dy * dy / (sy * sy);
        if (proximity >= 1) continue;
        let nx = dx / (sx * sx), ny = dy / (sy * sy), length = Math.hypot(nx, ny);
        if (length < 1e-8) { nx = 0; ny = i % 2 ? -1 : 1; length = 1; }
        const force = (1 - proximity) * 80 / length;
        this.accelX[i] -= nx * force; this.accelY[i] -= ny * force;
        this.accelX[j] += nx * force; this.accelY[j] += ny * force;
      }
      for (let step = 0; step < steps; step++) {
        for (let i = 0; i < this.bodies.length; i++) {
          const b = this.bodies[i], p = poses[i], t = (step + 1) / steps;
          const targetX = b.targetX + (p.x - b.targetX) * t, targetY = b.targetY + (p.y - b.targetY) * t;
          const targetVx = clamp((p.x - b.targetX) / delta, -500, 500), targetVy = clamp((p.y - b.targetY) / delta, -100, 100);
          b.vx += (9 * (targetX - b.x) + 6 * (targetVx - b.vx) + this.accelX[i]) * dt;
          b.vy += (9 * (targetY - b.y) + 6 * (targetVy - b.vy) + this.accelY[i]) * dt;
          const speed = Math.hypot(b.vx, b.vy), cap = passage ? 500 : 80;
          if (speed > cap) { b.vx *= cap / speed; b.vy *= cap / speed; }
          this.oldX[i] = b.x; this.oldY[i] = b.y;
          b.x += b.vx * dt; b.y += b.vy * dt; this.contain(b, passage);
        }
        this.maxCorrection = Math.max(this.maxCorrection, this.solve(passage, 64));
        for (let i = 0; i < this.bodies.length; i++) {
          const b = this.bodies[i]; b.vx = (b.x - this.oldX[i]) / dt; b.vy = (b.y - this.oldY[i]) / dt;
        }
      }
      for (let i = 0; i < this.bodies.length; i++) { this.bodies[i].targetX = poses[i].x; this.bodies[i].targetY = poses[i].y; }
    }
    for (let i = 0; i < this.bodies.length; i++) { poses[i].x = this.bodies[i].x; poses[i].y = this.bodies[i].y; }
    this.wasInPassage = passage;
  }
}
