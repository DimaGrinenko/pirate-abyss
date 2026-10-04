import { useEffect, useRef } from 'react';
import { assetUrl } from './assets';
import { CABIN_WINDOW_REGISTRATION_FILE } from './environment-assets';
import { decodedImage } from './asset-readiness';
import { DemandFrameLoop } from './demand-frame-loop';
import { SideFishSchool } from './fish-side-motion-v38';
import { MARINE_SIDE_ATLAS, MARINE_SIDE_REGIONS, sideFishGrid } from './marine-side-art-v38';
import { fishOutsideWindow, fishWindowLayout, visibleFishSurface } from './fish-window-layout';
import type { FishWaterPolygon } from './fish-spacing';
import { loadFishRouteData, type FishRoute as Route } from './fish-route-data';
import { renderDiagnosticsEnabled } from './render-diagnostics';
import { EffectResourceRetirement } from './effect-resource-retirement';
import { FishWebglError, fishWebglError } from './fish-webgl-diagnostics';
import './fish-volume-window.css';

type Point = [number, number];
const image = (name: string) => decodedImage(assetUrl(`alchemist/environment/${name}`));
let artPromise: Promise<{ routes: Route[]; masks: Record<string, FishWaterPolygon>; navigation: Record<string, FishWaterPolygon>; bitmaps: HTMLImageElement[]; mask: HTMLCanvasElement; layout: ReturnType<typeof fishWindowLayout> }> | undefined;
function loadArt() {
  return artPromise ??= Promise.all([
    loadFishRouteData(),
    fetch(assetUrl(`alchemist/environment/${CABIN_WINDOW_REGISTRATION_FILE}`)).then(r=>r.json()),
    image(MARINE_SIDE_ATLAS),image('window-foreground-v13.png'),
  ]).then(([rig,registration,first,foreground])=>{
    const layout=fishWindowLayout(registration.polygons),mask=document.createElement('canvas');mask.width=layout.surface.width;mask.height=layout.surface.height;
    const ctx=mask.getContext('2d')!;ctx.translate(-layout.surface.x,-layout.surface.y);ctx.fillStyle='#fff';
    for(const polygon of Object.values(registration.polygons) as Point[][]){ctx.beginPath();polygon.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();}
    ctx.globalCompositeOperation='destination-out';const f=registration.foreground;ctx.drawImage(foreground,f.x,f.y,f.width,f.height);
    return{routes:rig.routes as Route[],masks:registration.polygons,navigation:rig.navigationBoundaries,bitmaps:[first],mask,layout};
  }).catch(error=>{artPromise=undefined;throw error;});
}

const vertexSource=`
attribute vec3 aPosition; attribute vec2 aUv; attribute vec3 aNormal;
uniform vec2 uSize,uPosition,uCanvas,uOrigin,uMaskCanvas,uMaskOrigin; uniform vec4 uRegion;
uniform float uTime,uFacing,uRoll,uLayer;
varying vec2 vUv,vWorld;
void main(){
 vec2 p=aPosition.xy;
 // The whole head/torso is one untouched raster. Only the tail quarter moves.
 float tail=1.0-smoothstep(.12,.38,aUv.x);
 float wave=sin(uTime*4.8);
 p.y+=wave*tail*tail*.024;
 p.x+=sin(uTime*4.8-.7)*tail*tail*.007;
 p*=uSize;p.x*=uFacing;
 float c=cos(uRoll),s=sin(uRoll);vec2 xy=vec2(c*p.x-s*p.y,s*p.x+c*p.y)+uPosition;
 vWorld=(xy-uMaskOrigin)/uMaskCanvas;vUv=uRegion.xy+aUv*uRegion.zw;
 gl_Position=vec4(((xy-uOrigin)/uCanvas*2.0-1.0)*vec2(1.0,-1.0),uLayer+aNormal.x,1.0);
}`;
const fragmentSource=`precision mediump float;uniform sampler2D uArt,uMask;uniform float uAlpha;varying vec2 vUv,vWorld;
void main(){vec4 paint=texture2D(uArt,vUv);float opacity=texture2D(uMask,vWorld).a*uAlpha;float alpha=paint.a*opacity;if(alpha<.025)discard;gl_FragColor=vec4(paint.rgb*opacity,alpha);}`;

/** Fixed side-view painted fish: rigid complete faces, a gently bending tail,
 * and depth arrivals wholly inside water. No yaw or interpolated scale flipping. */
export function FishVolumeWindow({animated,bonus,reducedMotion,timeScale=1,onReady}:{animated:boolean;bonus:boolean;reducedMotion:boolean;timeScale?:number;onReady:(ready:boolean)=>void}){
  const canvasRef=useRef<HTMLCanvasElement>(null),latest=useRef({animated,bonus,reducedMotion,timeScale,onReady});latest.current={animated,bonus,reducedMotion,timeScale,onReady};
  const loopRef=useRef<DemandFrameLoop|null>(null);
  const syncPlaybackRef=useRef<(()=>void)|null>(null);
  const contextRetirement=useRef<EffectResourceRetirement|null>(null);
  if(!contextRetirement.current)contextRetirement.current=new EffectResourceRetirement();
  useEffect(()=>{
    const canvas=canvasRef.current;if(!canvas)return;
    const contextLease=contextRetirement.current!;contextLease.claim();
    const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true});
    if(!gl){latest.current.onReady(false);canvas.style.visibility='hidden';canvas.dataset.fishRenderer='unavailable';console.warn('[FishVolumeWindow] WebGL unavailable; keeping the authored fish fallback.');return;}
    let disposed=false,warned=false,generation=0,time=0,intersecting=true,observer:ResizeObserver|undefined;
    const resourceDisposers:(()=>void)[]=[];
    const release=()=>{syncPlaybackRef.current=null;loopRef.current?.dispose();loopRef.current=null;observer?.disconnect();observer=undefined;for(const dispose of resourceDisposers.splice(0).reverse())dispose();};
    const fail=(error:unknown)=>{
      if(disposed)return;generation++;release();latest.current.onReady(false);canvas.style.visibility='hidden';
      // A failed renderer retains the context for browser restoration, but it
      // does not need to retain a full-size invisible color/depth surface.
      canvas.width=canvas.height=1;
      canvas.dataset.fishRenderer=error instanceof FishWebglError&&error.contextLost?'context-lost':'failed';
      canvas.dataset.fishError=error instanceof Error?error.message:String(error);
      if(!warned){warned=true;console.warn('[FishVolumeWindow] Volume renderer stopped; keeping the authored fish fallback.',error);}
    };
    const initialize=()=>{
      const ownGeneration=++generation;release();
      canvas.dataset.fishRenderer='waiting-assets';
      void loadArt().then(art=>{
      if(disposed||ownGeneration!==generation)return;
      if(gl.isContextLost())throw fishWebglError(gl,'initialization');
      const surface=art.layout.surface;
      const windowBounds=Object.values(art.layout.windows);
      const host=canvas.parentElement,viewport=host?.parentElement;
      if(!host||!viewport)throw Error('Fish cabin viewport unavailable');
      let crop=visibleFishSurface(surface,surface,1,1),viewportVisible=true;
      canvas.style.inset='auto';
      const shader=(type:number,source:string)=>{
        const stage=type===gl.VERTEX_SHADER?'vertex':'fragment',sh=gl.createShader(type);
        if(!sh)throw fishWebglError(gl,`${stage} shader allocation`);
        resourceDisposers.push(()=>gl.deleteShader(sh));gl.shaderSource(sh,source);gl.compileShader(sh);
        if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw fishWebglError(gl,`${stage} shader compilation`,gl.getShaderInfoLog(sh));
        return sh;
      };
      const vs=shader(gl.VERTEX_SHADER,vertexSource),fs=shader(gl.FRAGMENT_SHADER,fragmentSource),program=gl.createProgram();if(!program)throw fishWebglError(gl,'program allocation');resourceDisposers.push(()=>gl.deleteProgram(program));gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw fishWebglError(gl,'program linking',gl.getProgramInfoLog(program));gl.useProgram(program);
      const mesh=sideFishGrid(),vb=gl.createBuffer(),ib=gl.createBuffer();if(vb)resourceDisposers.push(()=>gl.deleteBuffer(vb));if(ib)resourceDisposers.push(()=>gl.deleteBuffer(ib));if(!vb||!ib)throw fishWebglError(gl,'geometry buffer allocation');gl.bindBuffer(gl.ARRAY_BUFFER,vb);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,ib);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,mesh.indices,gl.STATIC_DRAW);
      for(const[name,size,offset]of [['aPosition',3,0],['aUv',2,3],['aNormal',3,5]] as const){const id=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(id);gl.vertexAttribPointer(id,size,gl.FLOAT,false,32,offset*4);}
      const uniforms=Object.fromEntries(['uSize','uPosition','uCanvas','uOrigin','uMaskCanvas','uMaskOrigin','uRegion','uTime','uFacing','uRoll','uLayer','uArt','uMask','uAlpha'].map(n=>[n,gl.getUniformLocation(program,n)]));
      const texture=(source:TexImageSource)=>{const t=gl.createTexture();if(!t)throw fishWebglError(gl,'texture allocation');resourceDisposers.push(()=>gl.deleteTexture(t));gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);return t;};
      const textures=art.bitmaps.map(texture),mask=texture(art.mask),school=new SideFishSchool(art.routes,art.masks,art.navigation);
      const draws=art.routes.map(route=>{
        const region=MARINE_SIDE_REGIONS[route.species],bitmap=art.bitmaps[0];
        return {uv:[region[0]/bitmap.naturalWidth,region[1]/bitmap.naturalHeight,region[2]/bitmap.naturalWidth,region[3]/bitmap.naturalHeight],radius:Math.hypot(route.width*.56,route.height*.56)+2,bounds:art.layout.windows[route.window??'main']??surface,phase:route.phase};
      });
      gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.uniform1i(uniforms.uArt,0);gl.uniform1i(uniforms.uMask,1);gl.uniform2f(uniforms.uMaskCanvas,surface.width,surface.height);gl.uniform2f(uniforms.uMaskOrigin,surface.x,surface.y);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,mask);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[0]);gl.clearColor(0,0,0,0);
      // Constant mirrored routes use the same complete quad in either direction.
      gl.disable(gl.CULL_FACE);
      const resize=()=>{
        // Layout reads happen only on resize, never inside the animation loop.
        const hostRect=host.getBoundingClientRect(),viewportRect=viewport.getBoundingClientRect();
        const scale=Math.min(Math.max(1,host.clientWidth)/1672,Math.max(1,host.clientHeight)/941);
        // A two-pixel guard retains mask AA at the clipped edge.
        const visible={x:(viewportRect.left-hostRect.left-2)/scale,y:(viewportRect.top-hostRect.top-2)/scale,width:(viewportRect.width+4)/scale,height:(viewportRect.height+4)/scale};
        crop=visibleFishSurface(surface,visible,scale,Math.min(devicePixelRatio||1,1.25),windowBounds);viewportVisible=crop.visible;
        canvas.style.left=`${crop.surface.x*scale}px`;canvas.style.top=`${crop.surface.y*scale}px`;canvas.style.width=`${crop.surface.width*scale}px`;canvas.style.height=`${crop.surface.height*scale}px`;
        if(canvas.width!==crop.bufferWidth||canvas.height!==crop.bufferHeight){canvas.width=crop.bufferWidth;canvas.height=crop.bufferHeight;gl.viewport(0,0,canvas.width,canvas.height);}
        gl.uniform2f(uniforms.uCanvas,crop.surface.width,crop.surface.height);gl.uniform2f(uniforms.uOrigin,crop.surface.x,crop.surface.y);
        if(renderDiagnosticsEnabled(import.meta.env.DEV)){canvas.dataset.fishSurface=`${crop.bufferWidth}x${crop.bufferHeight}`;canvas.dataset.fishFullSurface=`${crop.fullBufferWidth}x${crop.fullBufferHeight}`;canvas.dataset.fishCrop=JSON.stringify(crop.surface);}
        syncPlaybackRef.current?.();loopRef.current?.invalidate();
      };
      const draw=(delta:number)=>{
        if(disposed)return;const state=latest.current,step=state.animated&&!state.reducedMotion?delta*Math.max(0,state.timeScale):0;time+=step;
        gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        if(!viewportVisible)return;
        const poses=school.update(step,state.bonus,state.reducedMotion);
        if(state.bonus&&school.concealed){loopRef.current?.setPlayback(false,!document.hidden);return;}
        poses.forEach((pose,i)=>{
          const draw=draws[i];
          if(!pose.visible||fishOutsideWindow(pose.x,pose.y,draw.radius,crop.surface))return;
          gl.uniform4f(uniforms.uRegion,draw.uv[0],draw.uv[1],draw.uv[2],draw.uv[3]);
          gl.uniform2f(uniforms.uPosition,pose.x,pose.y);gl.uniform2f(uniforms.uSize,pose.width,pose.height);gl.uniform1f(uniforms.uRoll,pose.angle);gl.uniform1f(uniforms.uFacing,pose.facing);gl.uniform1f(uniforms.uTime,state.reducedMotion?0:time+draw.phase);gl.uniform1f(uniforms.uAlpha,pose.alpha);gl.uniform1f(uniforms.uLayer,.3-i*.015);gl.drawElements(gl.TRIANGLES,mesh.indices.length,gl.UNSIGNED_SHORT,0);
        });
      };
      const measureAnimation=renderDiagnosticsEnabled(import.meta.env.DEV);
      let measuredFrames=0,renderMs=0,previousSample=0,intervalMs=0;
      const loop=new DemandFrameLoop({request:callback=>requestAnimationFrame(callback),cancel:handle=>cancelAnimationFrame(handle)},delta=>{
        try{
          const started=measureAnimation&&delta>0?performance.now():0;
          if(delta===0){measuredFrames=0;renderMs=0;previousSample=0;intervalMs=0;}
          draw(delta);
          if(started){
            renderMs+=performance.now()-started;if(previousSample)intervalMs+=started-previousSample;previousSample=started;
            if(++measuredFrames===60){canvas.dataset.renderMs=(renderMs/measuredFrames).toFixed(2);canvas.dataset.frameIntervalMs=(intervalMs/59).toFixed(2);canvas.dataset.renderSamples='60';canvas.dataset.renderMetric='CPU update and GPU submission';measuredFrames=0;renderMs=0;previousSample=0;intervalMs=0;}
          }
        }catch(error){fail(error);}
      });loopRef.current=loop;
      const visibility=()=>loop.setPlayback(latest.current.animated&&!latest.current.reducedMotion&&!(latest.current.bonus&&school.concealed),!document.hidden&&intersecting&&viewportVisible);syncPlaybackRef.current=visibility;
      document.addEventListener('visibilitychange',visibility);resourceDisposers.push(()=>document.removeEventListener('visibilitychange',visibility));
      const intersection=new IntersectionObserver(entries=>{intersecting=entries.some(entry=>entry.isIntersecting);visibility();});intersection.observe(canvas);resourceDisposers.push(()=>intersection.disconnect());
      observer=new ResizeObserver(()=>{try{resize();}catch(error){fail(error);}});observer.observe(host);observer.observe(viewport);
      resize();draw(0);const firstPaintError=gl.getError();if(firstPaintError!==gl.NO_ERROR)throw fishWebglError(gl,'first paint',undefined,firstPaintError);
      canvas.style.visibility='visible';canvas.dataset.fishRenderer='ready';delete canvas.dataset.fishError;warned=false;latest.current.onReady(true);visibility();loop.invalidate();
      }).catch(error=>{if(ownGeneration===generation)fail(error);});
    };
    const lost=(event:Event)=>{event.preventDefault();fail(fishWebglError(gl,'context loss event',(event as WebGLContextEvent).statusMessage));},restored=()=>{if(!disposed)initialize();};
    canvas.addEventListener('webglcontextlost',lost);canvas.addEventListener('webglcontextrestored',restored);initialize();
    return()=>{
      disposed=true;generation++;canvas.removeEventListener('webglcontextlost',lost);canvas.removeEventListener('webglcontextrestored',restored);release();
      // Gallery unmounts retire their context without waiting for GC. A same-
      // canvas effect restart claims it first, cancelling this retirement.
      canvas.width=canvas.height=1;
      contextLease.retire(()=>{try{gl.getExtension('WEBGL_lose_context')?.loseContext();}catch{/* Already-lost contexts are already retired. */}});
    };
  },[]);
  useEffect(()=>{syncPlaybackRef.current?.();loopRef.current?.invalidate();},[animated,reducedMotion,bonus]);
  return <canvas ref={canvasRef} className="fish-volume-window" aria-hidden="true" data-fish-geometry="painted-side-v38" data-fish-spacing="interior-depth-v40"/>;
}
