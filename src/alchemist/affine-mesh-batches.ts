import type { NumberArrayLike } from '@esotericsoftware/spine-core';

type Transform = [number, number, number, number, number, number];
export type AffineMeshBatch = {
  triangles: number[];
  /** Oriented boundary loops, indexed into the original mesh vertices. */
  boundary: number[][] | null;
  transform: Transform;
};
const ERROR = 1e-4;

/** Merge only adjacent triangles with the same UV-to-world affine mapping.
 * The anchor transform is verified against every vertex of every candidate;
 * tolerances cannot accumulate along a chain of adjacent triangles. UV topology
 * is immutable, while the grouping is checked again for each native pose. */
export class AffineMeshBatches {
  private readonly neighbors: number[][];
  private readonly edges = new Map<string, { triangle: number; from: number; to: number }[]>();
  private readonly boundaries = new Map<string, number[][] | null>();
  private readonly inverse: (Transform | null)[];
  private readonly triangleCount: number;
  private readonly assigned: Uint8Array;
  private readonly pool: AffineMeshBatch[] = [];
  private readonly batches: AffineMeshBatch[] = [];
  readonly uv: NumberArrayLike;
  readonly indices: NumberArrayLike;
  maximumError = 0;

  constructor(uv: NumberArrayLike, indices: NumberArrayLike) {
    this.uv = uv; this.indices = indices;
    this.triangleCount = indices.length / 3;
    this.assigned = new Uint8Array(this.triangleCount);
    this.neighbors = Array.from({ length: this.triangleCount }, () => []);
    this.inverse = [];
    for (let triangle = 0; triangle < this.triangleCount; triangle++) {
      const at = triangle * 3, i = indices[at] * 2, j = indices[at + 1] * 2, k = indices[at + 2] * 2;
      const u1 = uv[j] - uv[i], v1 = uv[j + 1] - uv[i + 1], u2 = uv[k] - uv[i], v2 = uv[k + 1] - uv[i + 1];
      const determinant = u1 * v2 - u2 * v1;
      this.inverse.push(determinant === 0 ? null : [v2 / determinant, -v1 / determinant, -u2 / determinant, u1 / determinant, uv[i], uv[i + 1]]);
      for (let edge = 0; edge < 3; edge++) {
        const from = indices[at + edge], to = indices[at + (edge + 1) % 3];
        const key = from < to ? `${from}:${to}` : `${to}:${from}`;
        const entries = this.edges.get(key) ?? [];
        entries.push({ triangle, from, to }); this.edges.set(key, entries);
      }
    }
    for (const entries of this.edges.values()) {
      // Non-manifold or inconsistently wound edges remain separate triangles.
      if (entries.length === 2 && entries[0].from === entries[1].to && entries[0].to === entries[1].from) {
        this.neighbors[entries[0].triangle].push(entries[1].triangle);
        this.neighbors[entries[1].triangle].push(entries[0].triangle);
      }
    }
  }

  private transform(triangle: number, points: NumberArrayLike, target: Transform): boolean {
    const inverse = this.inverse[triangle];
    if (!inverse) { target.fill(0); return false; }
    const at = triangle * 3, i = this.indices[at] * 2, j = this.indices[at + 1] * 2, k = this.indices[at + 2] * 2;
    const x1 = points[j] - points[i], y1 = points[j + 1] - points[i + 1], x2 = points[k] - points[i], y2 = points[k + 1] - points[i + 1];
    const a = inverse[0] * x1 + inverse[1] * x2, b = inverse[0] * y1 + inverse[1] * y2;
    const c = inverse[2] * x1 + inverse[3] * x2, d = inverse[2] * y1 + inverse[3] * y2;
    target[0] = a; target[1] = b; target[2] = c; target[3] = d;
    target[4] = points[i] - a * inverse[4] - c * inverse[5];
    target[5] = points[i + 1] - b * inverse[4] - d * inverse[5];
    return true;
  }

  private error(triangle: number, points: NumberArrayLike, matrix: Transform) {
    let error = 0;
    for (let i = triangle * 3; i < triangle * 3 + 3; i++) {
      const v = this.indices[i] * 2, u = this.uv[v], w = this.uv[v + 1];
      error = Math.max(error, Math.hypot(matrix[0] * u + matrix[2] * w + matrix[4] - points[v], matrix[1] * u + matrix[3] * w + matrix[5] - points[v + 1]));
    }
    return error;
  }

  private boundary(triangles: number[]): number[][] | null {
    const key = triangles.slice().sort((a,b) => a-b).join(',');
    if (this.boundaries.has(key)) return this.boundaries.get(key)!;
    if (this.boundaries.size >= 256) this.boundaries.delete(this.boundaries.keys().next().value!);
    const members = new Set(triangles), next = new Map<number, number>();
    for (const entries of this.edges.values()) {
      const local = entries.filter(edge => members.has(edge.triangle));
      if (!local.length) continue;
      if (local.length === 2 && local[0].from === local[1].to && local[0].to === local[1].from) continue;
      if (local.length !== 1 || next.has(local[0].from)) { this.boundaries.set(key, null); return null; }
      next.set(local[0].from, local[0].to);
    }
    const loops: number[][] = [];
    while (next.size) {
      const start = next.keys().next().value!;
      const loop: number[] = []; let at = start;
      do {
        loop.push(at);
        const to = next.get(at);
        if (to === undefined) { this.boundaries.set(key, null); return null; }
        next.delete(at); at = to;
      } while (at !== start);
      if (loop.length < 3) { this.boundaries.set(key, null); return null; }
      loops.push(loop);
    }
    // A malformed closed mesh must fail back to its original triangle draws.
    const result = loops.length ? loops : null;
    this.boundaries.set(key, result);
    return result;
  }

  /** The returned scratch batches are valid until the next update. Rendering
   * consumes them immediately; stable native poses do not allocate per frame. */
  update(points: NumberArrayLike): AffineMeshBatch[] {
    const assigned = this.assigned, batches = this.batches;
    assigned.fill(0);
    let batchCount = 0;
    this.maximumError = 0;
    for (let triangle = 0; triangle < this.triangleCount; triangle++) {
      if (assigned[triangle]) continue;
      let batch = this.pool[batchCount];
      if (!batch) this.pool[batchCount] = batch = { triangles: [], boundary: null, transform: [0,0,0,0,0,0] };
      const matrix = batch.transform, valid = this.transform(triangle, points, matrix);
      const triangles = batch.triangles, previousLength = triangles.length;
      let sameTopology = triangles[0] === triangle, triangleCount = 1;
      triangles[0] = triangle; assigned[triangle] = 1;
      if (valid) {
        for (let head = 0; head < triangleCount; head++) {
          for (const neighbor of this.neighbors[triangles[head]]) {
            if (assigned[neighbor] || !this.inverse[neighbor]) continue;
            const error = this.error(neighbor, points, matrix);
            if (!Number.isFinite(error) || error > ERROR) continue;
            this.maximumError = Math.max(this.maximumError, error);
            assigned[neighbor] = 1;
            if (triangles[triangleCount] !== neighbor) sameTopology = false;
            triangles[triangleCount++] = neighbor;
          }
        }
      }
      triangles.length = triangleCount;
      // Native bones still evaluate every pose and every candidate vertex is
      // checked above. Only an unchanged membership/order reuses its contour.
      if (!sameTopology || previousLength !== triangleCount) batch.boundary = triangleCount > 1 ? this.boundary(triangles) : null;
      batches[batchCount++] = batch;
    }
    batches.length = batchCount;
    return batches;
  }
}
