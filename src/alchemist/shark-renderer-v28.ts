import { sharkVolumeMeshes } from './shark-volume-v28';

export type SharkPose = { x: number; y: number; width: number; yaw: number; pitch: number; angle: number; alpha: number };
type Vertex = { x: number; y: number; z: number; u: number; v: number; motion: number };
type Face = { vertices: [Vertex, Vertex, Vertex]; material: 0 | 1 };
type Geometry = { faces: Face[]; body: Float32Array };
type Point = [number, number];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
const extent = .69;

function geometry(aspect: number): Geometry {
  const faces: Face[] = [], body: number[] = [];
  const { grid, depth, triangles } = sharkVolumeMeshes.near;
  // Both sides are one closed alpha-conforming hull. A single shared snout UV
  // seam replaces the outer edge pixels which previously doubled the jaw.
  for (const side of [1, -1]) {
    const vertices: Vertex[] = grid.map(([u, v], i) => ({ x: u - .5, y: (v - .5) * aspect, z: side * depth[i], u: u < .88 ? u : .88 + (u - .88) * .6, v, motion: 1 }));
    for (const ids of triangles) {
      const face: Face = { vertices: (side === 1 ? ids : [ids[0], ids[2], ids[1]]).map(i => vertices[i]) as [Vertex, Vertex, Vertex], material: side === 1 ? 0 : 1 };
      const [a, b, c] = face.vertices;
      const ax = b.x - a.x, ay = b.y - a.y, az = b.z - a.z, bx = c.x - a.x, by = c.y - a.y, bz = c.z - a.z;
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx, length = Math.hypot(nx, ny, nz) || 1;
      for (const v of face.vertices) body.push(v.x, v.y, v.z, v.u, v.v, v.motion, nx / length, ny / length, nz / length);
      faces.push(face);
    }
  }
  return { faces, body: new Float32Array(body) };
}

const vertexSource = `
attribute vec3 position;
attribute vec2 uv;
attribute float motion;
attribute vec3 normal;
uniform vec4 rotation;
uniform vec2 bank;
uniform float time;
uniform float moving;
uniform float aspect;
varying vec2 textureUv;
varying float light;
varying vec3 hullPosition;
float eased(float t) { t=clamp(t,0.0,1.0); return t*t*(3.0-2.0*t); }
vec2 bend(vec2 p, vec2 pivot, float angle, float weight) {
  vec2 d=p-pivot; float c=cos(angle), s=sin(angle);
  return p+(vec2(d.x*c-d.y*s,d.x*s+d.y*c)-d)*weight;
}
void main() {
  vec3 p=position;
  if(motion*moving>.5) {
    vec2 q=vec2(p.x+.5,p.y/aspect+.5);
    float tail=1.0-eased((uv.x-.16)/.21);
    q=bend(q,vec2(.285,.505),.15*sin(time*4.8),tail);
    q.y+=.009*(1.0-eased((uv.x-.25)/.43))*sin(time*4.8-uv.x*3.6);
    float fin=eased((uv.y-.53)/.18)*eased((uv.x-.36)/.09)*(1.0-eased((uv.x-.65)/.1));
    q=bend(q,vec2(.635,.535),.072*sin(time*3.4-.8),fin);
    float dorsal=(1.0-eased((uv.y-.27)/.13))*eased((uv.x-.45)/.08)*(1.0-eased((uv.x-.65)/.09));
    q=bend(q,vec2(.57,.35),.045*sin(time*3.4+1.4),dorsal);
    p.xy=vec2(q.x-.5,(q.y-.5)*aspect);
    p.z+=.027*(1.0-eased((uv.x-.16)/.27))*sin(time*4.8-uv.x*5.0)+.013*fin*sin(time*3.4-.8);
  }
  vec3 rotated=vec3(p.x*rotation.x+p.z*rotation.y,p.y,-p.x*rotation.y+p.z*rotation.x);
  rotated.yz=vec2(rotated.y*rotation.z-rotated.z*rotation.w,rotated.y*rotation.w+rotated.z*rotation.z);
  vec2 screen=vec2(rotated.x*bank.x-rotated.y*bank.y,rotated.x*bank.y+rotated.y*bank.x);
  gl_Position=vec4(screen.x*2.5/.69,-screen.y*2.5/.69,-rotated.z,2.5-rotated.z);
  vec3 n=vec3(normal.x*rotation.x+normal.z*rotation.y,normal.y,-normal.x*rotation.y+normal.z*rotation.x);
  n.yz=vec2(n.y*rotation.z-n.z*rotation.w,n.y*rotation.w+n.z*rotation.z);
  light=.98+.05*max(0.0,dot(n,vec3(-.36,-.57,.74)));
  textureUv=uv; hullPosition=position;
}`;
const fragmentSource = `
precision mediump float;
uniform sampler2D artwork;
uniform sampler2D frontArt;
varying vec2 textureUv;
varying float light;
varying vec3 hullPosition;
void main() {
  vec4 paint=texture2D(artwork,textureUv);
  if(paint.a<.04) discard;
  // One continuous mouth/ivory material on the existing hull. The portrait's
  // eyes are never sampled: the two original eyes remain on the two cheeks.
  // This mapping is fixed in object space and never changes with the camera.
  vec2 faceUv=vec2(.5-hullPosition.z/.52,max(.49,.55+hullPosition.y/.42));
  vec4 frontal=texture2D(frontArt,faceUv);
  float weight=smoothstep(.235,.27,hullPosition.x)*smoothstep(-.045,-.01,hullPosition.y);
  paint.rgb=mix(paint.rgb,frontal.rgb,frontal.a*weight);
  gl_FragColor=vec4(paint.rgb*light*paint.a,paint.a);
}`;

function gpuPainter(mesh: Geometry, body: HTMLImageElement, front: HTMLImageElement, aspect: number, changed?: () => void) {
  // Keep shader/materials warm without retaining the largest encounter buffer.
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
  if (!gl) return null;
  let available = false, disposed = false;
  let rotation: WebGLUniformLocation | null, bank: WebGLUniformLocation | null, clock: WebGLUniformLocation | null, moving: WebGLUniformLocation | null;
  const disposers: (() => void)[] = [];
  const release = () => { available = false; for (const dispose of disposers.splice(0).reverse()) dispose(); };
  const render = (yaw: number, pitch: number, angle: number, time: number, staticPose: boolean) => {
    gl.viewport(0, 0, canvas.width, canvas.height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniform4f(rotation, Math.cos(yaw), Math.sin(yaw), Math.cos(pitch), Math.sin(pitch)); gl.uniform2f(bank, Math.cos(angle), Math.sin(angle)); gl.uniform1f(clock, time); gl.uniform1f(moving, staticPose ? 0 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.body.length / 9);
  };
  const initialize = () => {
    release();
    const shader = (type: number, source: string) => {
      const result = gl.createShader(type); if (!result) throw new Error('Shark shader allocation failed');
      disposers.push(() => gl.deleteShader(result)); gl.shaderSource(result, source); gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result) ?? 'Shark shader unavailable');
      return result;
    };
    const program = gl.createProgram(); if (!program) throw new Error('Shark program allocation failed');
    disposers.push(() => gl.deleteProgram(program));
    gl.attachShader(program, shader(gl.VERTEX_SHADER, vertexSource)); gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fragmentSource)); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shark program unavailable');
    gl.useProgram(program);
    rotation = gl.getUniformLocation(program, 'rotation'); bank = gl.getUniformLocation(program, 'bank'); clock = gl.getUniformLocation(program, 'time'); moving = gl.getUniformLocation(program, 'moving');
    gl.uniform1f(gl.getUniformLocation(program, 'aspect'), aspect); gl.uniform1i(gl.getUniformLocation(program, 'artwork'), 0); gl.uniform1i(gl.getUniformLocation(program, 'frontArt'), 1);
    const buffer = gl.createBuffer(); if (!buffer) throw new Error('Shark geometry allocation failed');
    disposers.push(() => gl.deleteBuffer(buffer)); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, mesh.body, gl.STATIC_DRAW);
    [body, front].forEach((bitmap, index) => {
      const texture = gl.createTexture(); if (!texture) throw new Error('Shark texture allocation failed');
      disposers.push(() => gl.deleteTexture(texture)); gl.activeTexture(gl.TEXTURE0 + index); gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
    });
    gl.activeTexture(gl.TEXTURE0);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.frontFace(gl.CW); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0, 0, 0, 0);
    for (const [name, count, offset] of [['position', 3, 0], ['uv', 2, 12], ['motion', 1, 20], ['normal', 3, 24]] as const) {
      const location = gl.getAttribLocation(program, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, count, gl.FLOAT, false, 36, offset);
    }
    // Submit once at 32px during setup, so the first visible shark does not
    // have to trigger the driver's first draw/compilation of these materials.
    render(0, 0, 0, 0, true); available = true;
  };
  const lost = (event: Event) => { event.preventDefault(); release(); changed?.(); };
  const restored = () => {
    if (disposed) return;
    try { initialize(); } catch { release(); }
    changed?.();
  };
  canvas.addEventListener('webglcontextlost', lost); canvas.addEventListener('webglcontextrestored', restored);
  const dispose = () => {
    disposed = true; canvas.removeEventListener('webglcontextlost', lost); canvas.removeEventListener('webglcontextrestored', restored);
    release(); canvas.width = canvas.height = 1; gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
  try { initialize(); } catch (error) { dispose(); throw error; }
  return {
    get available() { return available; },
    get backingSize() { return canvas.width; },
    prepare(pixelWidth: number) {
      if (!available) return false;
      const size = Math.min(1024, Math.max(256, 2 ** Math.ceil(Math.log2(pixelWidth * extent * 2))));
      if (size > canvas.width) { canvas.width = canvas.height = size; render(0, 0, 0, 0, true); }
      return true;
    },
    park() { if (canvas.width !== 32) canvas.width = canvas.height = 32; },
    paint(ctx: CanvasRenderingContext2D, pose: SharkPose, time: number, staticPose: boolean) {
      if (!available) return false;
      const transform = ctx.getTransform(), required = pose.width * Math.hypot(transform.a, transform.b) * extent * 2;
      const size = Math.min(1024, Math.max(256, 2 ** Math.ceil(Math.log2(required))));
      if (size > canvas.width) canvas.width = canvas.height = size;
      render(pose.yaw, pose.pitch, pose.angle, time, staticPose);
      ctx.save(); ctx.globalAlpha = pose.alpha; ctx.drawImage(canvas, pose.x - pose.width * extent, pose.y - pose.width * extent, pose.width * extent * 2, pose.width * extent * 2); ctx.restore();
      return true;
    },
    dispose,
  };
}

/** Bake the same object-space material once for the Canvas fallback. No extra
 * facial geometry or angle-dependent layers are introduced on older devices. */
function fallbackTextures(mesh: Geometry, body: HTMLImageElement, front: HTMLImageElement, aspect: number) {
  const read = (bitmap: HTMLImageElement) => {
    const canvas = document.createElement('canvas'); canvas.width = bitmap.naturalWidth; canvas.height = bitmap.naturalHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(bitmap, 0, 0);
    return { canvas, ctx, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height) };
  };
  const original = read(body), portrait = read(front), pages = [read(body), read(body)];
  const sample = (pixels: ImageData, u: number, v: number, channel: number) => {
    const x = clamp(u) * (pixels.width - 1), y = clamp(v) * (pixels.height - 1), ix = Math.floor(x), iy = Math.floor(y), dx = x - ix, dy = y - iy;
    const color = (sx: number, sy: number) => pixels.data[(Math.min(pixels.height - 1, sy) * pixels.width + Math.min(pixels.width - 1, sx)) * 4 + channel];
    return (color(ix, iy) * (1 - dx) + color(ix + 1, iy) * dx) * (1 - dy) + (color(ix, iy + 1) * (1 - dx) + color(ix + 1, iy + 1) * dx) * dy;
  };
  for (const face of mesh.faces) {
    if (face.vertices.every(vertex => vertex.x < .2)) continue;
    const [a, b, c] = face.vertices, page = pages[face.material], { width, height, data } = page.pixels;
    const points = face.vertices.map(vertex => [(vertex.x + .5) * width, (vertex.y / aspect + .5) * height]);
    const [p, q, r] = points, area = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    if (Math.abs(area) < 1e-7) continue;
    const left = Math.max(0, Math.floor(Math.min(...points.map(point => point[0])))), right = Math.min(width - 1, Math.ceil(Math.max(...points.map(point => point[0]))));
    const top = Math.max(0, Math.floor(Math.min(...points.map(point => point[1])))), bottom = Math.min(height - 1, Math.ceil(Math.max(...points.map(point => point[1]))));
    for (let py = top; py <= bottom; py++) for (let px = left; px <= right; px++) {
      const vb = ((px + .5 - p[0]) * (r[1] - p[1]) - (py + .5 - p[1]) * (r[0] - p[0])) / area;
      const vc = ((q[0] - p[0]) * (py + .5 - p[1]) - (q[1] - p[1]) * (px + .5 - p[0])) / area, va = 1 - vb - vc;
      if (Math.min(va, vb, vc) < -.015) continue;
      const x = a.x * va + b.x * vb + c.x * vc, y = a.y * va + b.y * vb + c.y * vc, z = a.z * va + b.z * vb + c.z * vc;
      const u = a.u * va + b.u * vb + c.u * vc, v = a.v * va + b.v * vb + c.v * vc, fu = .5 - z / .52, fv = Math.max(.49, .55 + y / .42);
      const weight = smooth((x - .235) / .035) * smooth((y + .045) / .035) * sample(portrait.pixels, fu, fv, 3) / 255, index = (py * width + px) * 4;
      for (let channel = 0; channel < 3; channel++) data[index + channel] = sample(original.pixels, u, v, channel) * (1 - weight) + sample(portrait.pixels, fu, fv, channel) * weight;
      data[index + 3] = sample(original.pixels, u, v, 3);
    }
  }
  return pages.map(page => { page.ctx.putImageData(page.pixels, 0, 0); return page.canvas; });
}

function canvasPainter(mesh: Geometry, body: HTMLImageElement, front: HTMLImageElement, aspect: number) {
  const textures = fallbackTextures(mesh, body, front, aspect);
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  return {
    kind: 'canvas' as const,
    get backingSize() { return canvas.width; },
    prepare(pixelWidth: number) {
      const size = Math.min(1024, Math.max(256, 2 ** Math.ceil(Math.log2(pixelWidth * extent * 2))));
      if (size > canvas.width) canvas.width = canvas.height = size;
    },
    park() { if (canvas.width !== 1) canvas.width = canvas.height = 1; },
    paint(destination: CanvasRenderingContext2D, pose: SharkPose, time: number, staticPose: boolean) {
      const transform = destination.getTransform(), size = Math.min(1024, Math.max(256, 2 ** Math.ceil(Math.log2(pose.width * Math.hypot(transform.a, transform.b) * extent * 2))));
      if (size > canvas.width) canvas.width = canvas.height = size;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const renderWidth = canvas.width / (extent * 2);
      const cy = Math.cos(pose.yaw), sy = Math.sin(pose.yaw), cp = Math.cos(pose.pitch), sp = Math.sin(pose.pitch);
      const project = (vertex: Vertex) => {
        let { x, y, z } = vertex;
        if (!staticPose && vertex.motion) {
          const u = vertex.u, v = vertex.v; let px = x + .5, py = y / aspect + .5;
          const bend = (ox: number, oy: number, angle: number, weight: number) => { const dx = px - ox, dy = py - oy, c = Math.cos(angle), s = Math.sin(angle); px += (dx * c - dy * s - dx) * weight; py += (dx * s + dy * c - dy) * weight; };
          bend(.285, .505, .15 * Math.sin(time * 4.8), 1 - smooth((u - .16) / .21));
          py += .009 * (1 - smooth((u - .25) / .43)) * Math.sin(time * 4.8 - u * 3.6);
          const fin = smooth((v - .53) / .18) * smooth((u - .36) / .09) * (1 - smooth((u - .65) / .1));
          bend(.635, .535, .072 * Math.sin(time * 3.4 - .8), fin);
          bend(.57, .35, .045 * Math.sin(time * 3.4 + 1.4), (1 - smooth((v - .27) / .13)) * smooth((u - .45) / .08) * (1 - smooth((u - .65) / .09)));
          x = px - .5; y = (py - .5) * aspect; z += .027 * (1 - smooth((u - .16) / .27)) * Math.sin(time * 4.8 - u * 5) + .013 * fin * Math.sin(time * 3.4 - .8);
        }
        const rx = x * cy + z * sy, rz = -x * sy + z * cy, ry = y * cp - rz * sp, depth = y * sp + rz * cp, k = 2.5 / (2.5 - depth);
        return { point: [rx * k * renderWidth, ry * k * renderWidth] as Point, depth };
      };
      const cache = new Map<Vertex, ReturnType<typeof project>>();
      const faces = mesh.faces.map(face => {
        const targets = face.vertices.map(vertex => { let point = cache.get(vertex); if (!point) { point = project(vertex); cache.set(vertex, point); } return point; });
        return { face, targets, depth: targets.reduce((sum, vertex) => sum + vertex.depth, 0) };
      }).filter(({ targets }) => { const [a, b, c] = targets.map(v => v.point); return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) > .001; }).sort((a, b) => a.depth - b.depth);
      ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(pose.angle);
      for (const { face, targets } of faces) {
        const bitmap = textures[face.material], [s0, s1, s2] = face.vertices.map(v => [(v.x + .5) * bitmap.width, (v.y / aspect + .5) * bitmap.height]), [a, b, c] = targets.map(v => v.point);
        const dx1 = s1[0] - s0[0], dy1 = s1[1] - s0[1], dx2 = s2[0] - s0[0], dy2 = s2[1] - s0[1], det = dx1 * dy2 - dx2 * dy1;
        if (Math.abs(det) < 1e-7) continue;
        const aa = ((b[0] - a[0]) * dy2 - (c[0] - a[0]) * dy1) / det, bb = ((b[1] - a[1]) * dy2 - (c[1] - a[1]) * dy1) / det;
        const cc = (dx1 * (c[0] - a[0]) - dx2 * (b[0] - a[0])) / det, dd = (dx1 * (c[1] - a[1]) - dx2 * (b[1] - a[1])) / det;
        const center: Point = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3];
        const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]));
        const perimeter = Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]) + Math.hypot(a[0] - c[0], a[1] - c[1]);
        const overlap = Math.min(.7, area / (perimeter * 4));
        ctx.save(); ctx.beginPath();
        [a, b, c].forEach((point, i) => { const length = Math.hypot(point[0] - center[0], point[1] - center[1]) || 1, x = point[0] + (point[0] - center[0]) / length * overlap, y = point[1] + (point[1] - center[1]) / length * overlap; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.closePath(); ctx.clip(); ctx.transform(aa, bb, cc, dd, a[0] - aa * s0[0] - cc * s0[1], a[1] - bb * s0[0] - dd * s0[1]); ctx.drawImage(bitmap, 0, 0); ctx.restore();
      }
      ctx.restore();
      destination.save(); destination.globalAlpha = pose.alpha; destination.drawImage(canvas, pose.x - pose.width * extent, pose.y - pose.width * extent, pose.width * extent * 2, pose.width * extent * 2); destination.restore();
    },
    dispose() { canvas.width = canvas.height = 1; for (const texture of textures) texture.width = texture.height = 1; },
  };
}

export function createSharkPainter(bitmap: HTMLImageElement, front: HTMLImageElement, changed?: () => void, allowGpu = true) {
  const aspect = bitmap.naturalHeight / bitmap.naturalWidth, mesh = geometry(aspect);
  let gpu: ReturnType<typeof gpuPainter> = null, fallback: ReturnType<typeof canvasPainter> | undefined;
  const gpuChanged = () => {
    if (gpu?.available) { fallback?.dispose(); fallback = undefined; }
    changed?.();
  };
  if (allowGpu) try { gpu = gpuPainter(mesh, bitmap, front, aspect, gpuChanged); } catch { /* Use the same closed geometry when GPU setup is unavailable. */ }
  return {
    get kind() { return gpu?.available ? 'webgl' : 'canvas'; },
    get backingSize() { return gpu?.available ? gpu.backingSize : fallback?.backingSize ?? 1; },
    prepare(pixelWidth: number) {
      if (gpu?.prepare(pixelWidth)) {
        fallback?.dispose(); fallback = undefined;
      } else {
        // If GPU setup is unavailable, bake the fallback during the existing
        // entrance interval, before any shark reaches the visible window.
        fallback ??= canvasPainter(mesh, bitmap, front, aspect); fallback.prepare(pixelWidth);
      }
    },
    park() { gpu?.park(); fallback?.park(); },
    paint(ctx: CanvasRenderingContext2D, pose: SharkPose, time: number, staticPose: boolean) {
      if (gpu?.paint(ctx, pose, time, staticPose)) { fallback?.dispose(); fallback = undefined; return; }
      fallback ??= canvasPainter(mesh, bitmap, front, aspect); fallback.paint(ctx, pose, time, staticPose);
    },
    dispose() { gpu?.dispose(); fallback?.dispose(); },
  };
}
