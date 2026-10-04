import { sharkVolumeMeshes } from './shark-volume-v36';

export type SharkPose = { x: number; y: number; width: number; yaw: number; pitch: number; angle: number; alpha: number };
export const SHARK_NOSE = { x: .505, y: .025 } as const;
type Vertex = { x: number; y: number; z: number; u: number; v: number; motion: number };
type Face = { vertices: [Vertex, Vertex, Vertex]; material: 0 | 1 | 2 };
type Geometry = { faces: Face[]; body: Float32Array };
type Point = [number, number];
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const t = clamp(n); return t * t * (3 - 2 * t); };
const extent = .69;

export function createSharkGeometry(aspect: number): Geometry {
  const faces: Face[] = [], body: number[] = [], neck=.18, boundary=new Map<string,Vertex>();
  const addFace = (vertices: [Vertex, Vertex, Vertex], material: Face['material']) => {
    const [a,b,c] = vertices, ax=b.x-a.x, ay=b.y-a.y, az=b.z-a.z, bx=c.x-a.x, by=c.y-a.y, bz=c.z-a.z;
    const nx=ay*bz-az*by, ny=az*bx-ax*bz, nz=ax*by-ay*bx, length=Math.hypot(nx,ny,nz);
    if(length<1e-10)return;
    for(const v of vertices)body.push(v.x,v.y,v.z,v.u,v.v,v.motion,nx/length,ny/length,nz/length);
    faces.push({vertices,material});
  };
  const remember=(v:Vertex)=>boundary.set([v.y,v.z].map(x=>x.toFixed(7)).join(','),v);
  const clip=(vertices:Vertex[])=>{
    const output:Vertex[]=[];
    for(let i=0;i<vertices.length;i++) {
      const a=vertices[i],b=vertices[(i+1)%vertices.length],insideA=a.x<=neck,insideB=b.x<=neck;
      if(insideA)output.push(a);
      if(insideA!==insideB) {
        const t=(neck-a.x)/(b.x-a.x),v={x:neck,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,u:a.u+(b.u-a.u)*t,v:a.v+(b.v-a.v)*t,motion:1};
        output.push(v);remember(v);
      }
    }
    return output;
  };
  const {grid,depth,triangles}=sharkVolumeMeshes.near;
  for(const side of [1,-1]) {
    const vertices:Vertex[]=grid.map(([u,v],i)=>({x:u-.5,y:(v-.5)*aspect,z:side*depth[i],u,v,motion:1}));
    for(const ids of triangles) {
      const points=clip((side===1?ids:[ids[0],ids[2],ids[1]]).map(i=>vertices[i]));
      for(let i=1;i<points.length-1;i++)addFace([points[0],points[i],points[i+1]],side===1?0:1);
    }
  }
  const circle=[...boundary.values()].sort((a,b)=>Math.atan2(a.z/.205,(a.y-.025)/.17)-Math.atan2(b.z/.205,(b.y-.025)/.17));
  const rings=[{x:neck,scale:0,mix:0},{x:.22,scale:1,mix:.4},{x:.27,scale:1,mix:1},{x:.33,scale:1,mix:1},{x:.39,scale:.94,mix:1},{x:.447,scale:.79,mix:1},{x:.48,scale:.54,mix:1},{x:.498,scale:.27,mix:1},{x:.505,scale:0,mix:1}];
  const position=(ring:typeof rings[number],point:Vertex)=>{
    const original=Math.atan2(point.z/.205,(point.y-.025)/.17),index=circle.indexOf(point),uniform=-Math.PI+Math.PI*2*index/circle.length;
    const angle=original+(uniform-original)*ring.mix;
    return {x:ring.x,y:point.y+( .025+Math.cos(angle)*.17*ring.scale-point.y)*ring.mix,z:point.z+(Math.sin(angle)*.205*ring.scale-point.z)*ring.mix};
  };
  const faceVertex=(p:{x:number;y:number;z:number},side:number):Vertex=>{
    const azimuth=Math.atan2(Math.abs(p.z), (p.x-.31)*.205/.17)*side;
    return {...p,u:.5-azimuth/(Math.PI*2)*.88,v:.52+(p.y-.025)/.17*.35,motion:0};
  };
  const headFace=(points:{x:number;y:number;z:number}[])=>{
    const side=points.reduce((v,p)=>v+p.z,0)>=0?1:-1;
    const vertices=points.map(p=>faceVertex(p,side)) as [Vertex,Vertex,Vertex];
    const [a,b,c]=vertices,nx=(b.y-a.y)*(c.z-a.z)-(b.z-a.z)*(c.y-a.y),ny=(b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z),nz=(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
    if(nx*((a.x+b.x+c.x)/3-.31)+ny*((a.y+b.y+c.y)/3-.025)+nz*(a.z+b.z+c.z)/3<0)[vertices[1],vertices[2]]=[vertices[2],vertices[1]];
    addFace(vertices,2);
  };
  for(let r=0;r<rings.length-1;r++)for(let i=0;i<circle.length;i++) {
    const j=(i+1)%circle.length,a=position(rings[r],circle[i]),b=position(rings[r],circle[j]),c=position(rings[r+1],circle[j]),d=position(rings[r+1],circle[i]);
    headFace([a,b,c]);headFace([a,c,d]);
  }
  return {faces,body:new Float32Array(body)};
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
varying float surface;
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
    float fin=eased((uv.y-.53)/.18)*eased((uv.x-.36)/.09)*(1.0-eased((uv.x-.63)/.05));
    q=bend(q,vec2(.635,.535),.072*sin(time*3.4-.8),fin);
    float dorsal=(1.0-eased((uv.y-.27)/.13))*eased((uv.x-.45)/.08)*(1.0-eased((uv.x-.61)/.07));
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
  textureUv=uv; hullPosition=position; surface=motion;
}`;
const fragmentSource = `
precision mediump float;
uniform sampler2D artwork;
uniform sampler2D frontArt;
varying vec2 textureUv;
varying float light;
varying vec3 hullPosition;
varying float surface;
void main() {
  vec2 bodyUv=textureUv;
  vec4 paint=texture2D(artwork,bodyUv);
  if(surface<.5) {
    paint=vec4(texture2D(frontArt,textureUv).rgb,1.0);
  }
  if(paint.a<.04) discard;
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

function canvasPainter(mesh: Geometry, body: HTMLImageElement, front: HTMLImageElement, aspect: number) {
  const textures = [body, body, front];
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const sampler=document.createElement('canvas');sampler.width=sampler.height=1;const sampleContext=sampler.getContext('2d',{willReadFrequently:true})!;
  // Topology and texture coordinates do not change during swimming. Retain
  // those plans and vertex projections instead of rebuilding thousands of
  // short-lived arrays/objects for every shark in every fallback frame.
  type Projection = { vertex: Vertex; point: Point; depth: number };
  const projections = new Map<Vertex, Projection>();
  const plans = mesh.faces.map(face => {
    const targets = face.vertices.map(vertex => {
      let projection = projections.get(vertex);
      if (!projection) { projection = { vertex, point: [0, 0], depth: 0 }; projections.set(vertex, projection); }
      return projection;
    });
    const bitmap = textures[face.material], [s0, s1, s2] = face.vertices.map(v => [v.u * bitmap.width, v.v * bitmap.height]);
    const dx1 = s1[0] - s0[0], dy1 = s1[1] - s0[1], dx2 = s2[0] - s0[0], dy2 = s2[1] - s0[1];
    const det=dx1*dy2-dx2*dy1;let solid:string|undefined;
    if(Math.abs(det)<1e-7){sampleContext.clearRect(0,0,1,1);sampleContext.drawImage(bitmap,(s0[0]+s1[0]+s2[0])/3,(s0[1]+s1[1]+s2[1])/3,1,1,0,0,1,1);const color=sampleContext.getImageData(0,0,1,1).data;solid=`rgb(${color[0]} ${color[1]} ${color[2]})`;}
    return {bitmap,targets,s0,dx1,dy1,dx2,dy2,det,solid,depth:0};
  });
  const vertices = [...projections.values()], visible: typeof plans = [];
  const byDepth = (a: typeof plans[number], b: typeof plans[number]) => a.depth - b.depth;
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
      for (const projection of vertices) {
        const vertex = projection.vertex;
        let { x, y, z } = vertex;
        if (!staticPose && vertex.motion > 0) {
          const u = vertex.u, v = vertex.v; let px = x + .5, py = y / aspect + .5;
          const bend = (ox: number, oy: number, angle: number, weight: number) => { const dx = px - ox, dy = py - oy, c = Math.cos(angle), s = Math.sin(angle); px += (dx * c - dy * s - dx) * weight; py += (dx * s + dy * c - dy) * weight; };
          bend(.285, .505, .15 * Math.sin(time * 4.8), 1 - smooth((u - .16) / .21));
          py += .009 * (1 - smooth((u - .25) / .43)) * Math.sin(time * 4.8 - u * 3.6);
          const fin = smooth((v - .53) / .18) * smooth((u - .36) / .09) * (1 - smooth((u - .63) / .05));
          bend(.635, .535, .072 * Math.sin(time * 3.4 - .8), fin);
          bend(.57, .35, .045 * Math.sin(time * 3.4 + 1.4), (1 - smooth((v - .27) / .13)) * smooth((u - .45) / .08) * (1 - smooth((u - .61) / .07)));
          x = px - .5; y = (py - .5) * aspect; z += .027 * (1 - smooth((u - .16) / .27)) * Math.sin(time * 4.8 - u * 5) + .013 * fin * Math.sin(time * 3.4 - .8);
        }
        const rx = x * cy + z * sy, rz = -x * sy + z * cy, ry = y * cp - rz * sp, depth = y * sp + rz * cp, k = 2.5 / (2.5 - depth);
        projection.point[0] = rx * k * renderWidth; projection.point[1] = ry * k * renderWidth; projection.depth = depth;
      }
      visible.length = 0;
      // Refill in authored order so stable sort retains the same ordering for
      // coplanar faces, regardless of the preceding frame's viewing angle.
      for (const plan of plans) {
        const targets = plan.targets, a = targets[0].point, b = targets[1].point, c = targets[2].point;
        if ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]) <= .001) continue;
        plan.depth = 0 + targets[0].depth + targets[1].depth + targets[2].depth;
        visible.push(plan);
      }
      visible.sort(byDepth);
      ctx.save(); ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(pose.angle);
      for (const { bitmap, targets, s0, dx1, dy1, dx2, dy2, det, solid } of visible) {
        const a = targets[0].point, b = targets[1].point, c = targets[2].point;
        if(solid){ctx.beginPath();ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);ctx.lineTo(c[0],c[1]);ctx.closePath();ctx.fillStyle=solid;ctx.fill();continue;}
        const aa = ((b[0] - a[0]) * dy2 - (c[0] - a[0]) * dy1) / det, bb = ((b[1] - a[1]) * dy2 - (c[1] - a[1]) * dy1) / det;
        const cc = (dx1 * (c[0] - a[0]) - dx2 * (b[0] - a[0])) / det, dd = (dx1 * (c[1] - a[1]) - dx2 * (b[1] - a[1])) / det;
        const centerX = (a[0]+b[0]+c[0])/3,centerY=(a[1]+b[1]+c[1])/3;
        const area = Math.abs((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]));
        const perimeter = Math.hypot(b[0]-a[0],b[1]-a[1])+Math.hypot(c[0]-b[0],c[1]-b[1])+Math.hypot(a[0]-c[0],a[1]-c[1]);
        const overlap=Math.min(.9,area/(perimeter*3));
        ctx.save();ctx.beginPath();
        for(let i=0;i<3;i++){const point=targets[i].point,length=Math.hypot(point[0]-centerX,point[1]-centerY)||1,x=point[0]+(point[0]-centerX)/length*overlap,y=point[1]+(point[1]-centerY)/length*overlap;if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
        ctx.closePath(); ctx.clip(); ctx.transform(aa, bb, cc, dd, a[0] - aa * s0[0] - cc * s0[1], a[1] - bb * s0[0] - dd * s0[1]); ctx.drawImage(bitmap, 0, 0); ctx.restore();
      }
      ctx.restore();
      destination.save(); destination.globalAlpha = pose.alpha; destination.drawImage(canvas, pose.x - pose.width * extent, pose.y - pose.width * extent, pose.width * extent * 2, pose.width * extent * 2); destination.restore();
    },
    dispose() { canvas.width = canvas.height = 1; },
  };
}

export function createSharkPainter(bitmap: HTMLImageElement, front: HTMLImageElement, changed?: () => void, allowGpu = true) {
  const aspect = bitmap.naturalHeight / bitmap.naturalWidth, mesh = createSharkGeometry(aspect);
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
