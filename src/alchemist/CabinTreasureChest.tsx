import { memo, useEffect, useRef } from 'react';
import { assetUrl } from './assets';
import { DemandFrameLoop } from './demand-frame-loop';
import { decodedImage } from './asset-readiness';
import { cabinLidFaces, type ChestPoint as Point } from './cabin-chest-geometry';
import './cabin-treasure-chest.css';

const names=['body','outer','inner','endCap','coin','diamond','ruby','emerald'] as const;
// Keep the backing store local to this small prop, not the entire 1672x941 room.
const paintBounds={x:1238,y:565,width:270,height:287};
type Part=typeof names[number];
let loaded:Promise<Record<Part,HTMLImageElement>>|undefined;
function load(){return loaded??=Promise.all(names.map(async name=>[name,await decodedImage(assetUrl(name==='endCap'?'alchemist/environment/cabin-chest-v36/end-cap.webp':`alchemist/environment/cabin-chest-v24/${name}.webp`))] as const)).then(parts=>Object.fromEntries(parts) as Record<Part,HTMLImageElement>).catch(error=>{loaded=undefined;throw error;});}
const smooth=(v:number)=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t);};
function triangle(ctx:CanvasRenderingContext2D,img:HTMLImageElement,source:Point[],target:Point[]){
 const [a,b,c]=target,[s0,s1,s2]=source,dx1=s1[0]-s0[0],dy1=s1[1]-s0[1],dx2=s2[0]-s0[0],dy2=s2[1]-s0[1],d=dx1*dy2-dx2*dy1;
 const aa=((b[0]-a[0])*dy2-(c[0]-a[0])*dy1)/d,bb=((b[1]-a[1])*dy2-(c[1]-a[1])*dy1)/d,cc=(dx1*(c[0]-a[0])-dx2*(b[0]-a[0]))/d,dd=(dx1*(c[1]-a[1])-dx2*(b[1]-a[1]))/d;
 ctx.save();ctx.beginPath();target.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.clip();ctx.transform(aa,bb,cc,dd,a[0]-aa*s0[0]-cc*s0[1],a[1]-bb*s0[0]-dd*s0[1]);ctx.drawImage(img,0,0);ctx.restore();
}
function lid(ctx:CanvasRenderingContext2D,art:Record<Part,HTMLImageElement>,angle:number){
 for(const face of cabinLidFaces(angle)){
  const img=art[face.part],uv=face.uv.map(([u,v])=>[u*img.naturalWidth,v*img.naturalHeight] as Point);
  triangle(ctx,img,[uv[0],uv[1],uv[2]],[face.points[0],face.points[1],face.points[2]]);
  if(face.points.length===4)triangle(ctx,img,[uv[0],uv[2],uv[3]],[face.points[0],face.points[2],face.points[3]]);
 }
}

/** Small cabin prop only: no rewards, engine state or payout events. */
export const CabinTreasureChest=memo(function CabinTreasureChest({inBonus,obscured,reducedMotion}:{inBonus:boolean;obscured:boolean;reducedMotion:boolean}){
 const canvasRef=useRef<HTMLCanvasElement>(null),latest=useRef({inBonus,obscured,reducedMotion});latest.current={inBonus,obscured,reducedMotion};const playback=useRef<DemandFrameLoop|null>(null),refreshPlayback=useRef<(()=>void)|null>(null);
 useEffect(()=>{
  const canvas=canvasRef.current,ctx=canvas?.getContext('2d');if(!canvas||!ctx)return;
  let disposed=false,time=0,closing=.86,previous=false,lastOpening=0,exitStart=0,intersecting=true,observer:ResizeObserver|undefined,intersection:IntersectionObserver|undefined,visibility:()=>void=()=>{};
  let layoutWidth=Math.max(1,canvas.clientWidth),layoutHeight=Math.max(1,canvas.clientHeight);
  let lastPaint:{width:number;height:number;dpr:number;opening:number;bonus:boolean;coins:number;trickle:boolean}|undefined;
  void load().then(art=>{
   if(disposed)return;
   const draw=(delta:number)=>{
    const state=latest.current;if(state.inBonus!==previous){previous=state.inBonus;if(previous){time=0;closing=0;}else{closing=0;exitStart=lastOpening;}}
    if(!state.obscured&&!state.reducedMotion){if(state.inBonus)time+=delta;else closing+=delta;}
    const cw=layoutWidth,ch=layoutHeight,dpr=Math.min(devicePixelRatio||1,1.25),w=Math.round(cw*dpr),h=Math.round(ch*dpr);
    const cycle=time%14,opening=state.reducedMotion?(state.inBonus?1:0):state.inBonus?smooth(cycle/.95)*(1-smooth((cycle-10)/1.1)):exitStart*(1-smooth(closing/.8));
    lastOpening=opening;
    if(!state.inBonus&&opening===0)playback.current?.setPlayback(false,!document.hidden&&intersecting);
    // Keep the original clock/speed, but retain identical canvas pixels while
    // the lid holds still and the bounded floor mound has already settled.
    // Last coin: birth 2.525s + flight .76s + bounce .22s = 3.505s.
    const coins=!state.inBonus?0:state.reducedMotion||time>=3.505?2:time>=1.04?1:0;
    const trickle=state.inBonus&&!state.reducedMotion&&time>14&&cycle>=1.1&&cycle<=2.64;
    if(lastPaint&&lastPaint.width===cw&&lastPaint.height===ch&&lastPaint.dpr===dpr&&lastPaint.opening===opening&&lastPaint.bonus===state.inBonus&&lastPaint.coins===coins&&lastPaint.trickle===trickle&&coins!==1&&!trickle)return;
    lastPaint={width:cw,height:ch,dpr,opening,bonus:state.inBonus,coins,trickle};
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);
    const scale=Math.min(cw/paintBounds.width,ch/paintBounds.height);ctx.setTransform(scale*dpr,0,0,scale*dpr,-paintBounds.x*scale*dpr,-paintBounds.y*scale*dpr);
    const angle=opening*1.52;
    // Body and all opaque lid surfaces share the registered rear hinge.
    // The roof occludes the coins while closed; opening exposes the interior.
    ctx.drawImage(art.body,1334,654,146,134);
    lid(ctx,art,angle);
    // A bounded set settles on the floor; subsequent openings reuse that set.
    if((time>1||state.reducedMotion)&&state.inBonus){
     for(let i=0;i<34;i++){
      const born=1.04+i*.045,age=state.reducedMotion?10:time-born;if(age<0)continue;
      const duration=.58+(i%5)*.06,t=Math.min(1,age/duration),sx=1374+i%6*7,sy=682,endX=1260+(i*47%206),endY=802+(i*13%35);
      const x=sx+(endX-sx)*t,y=sy+(endY-sy)*t-82*Math.sin(Math.PI*t),after=Math.max(0,age-duration),bounce=after<.22?Math.sin(after/.22*Math.PI)*(3+i%4):0;
      const name:Part=i%5===0?'diamond':i%11===0?'ruby':i%13===0?'emerald':'coin',img=art[name],size=name==='coin'?8+i%4*2:10+i%3*2;
      ctx.save();ctx.translate(x,y-bounce);ctx.rotate(t*(i%2?4:-4)+(t===1?0:age*3));ctx.scale(t<1?Math.max(.3,Math.abs(Math.cos(age*8+i))):1,name==='coin'&&t===1?.58:1);ctx.drawImage(img,-size/2,-size/2,size,size*img.naturalHeight/img.naturalWidth);ctx.restore();
     }
     // Further openings add a small fresh trickle to the same bounded mound.
     if(time>14&&!state.reducedMotion)for(let i=0;i<9;i++){
      const age=cycle-1.1-i*.065;if(age<0||age>1.02)continue;
      const t=Math.min(1,age/.78),x=1400+(1280+i*18-1400)*t,y=684+(811+i%3*7-684)*t-74*Math.sin(Math.PI*t),size=9+i%3*2;
      ctx.save();ctx.globalAlpha=1-smooth((age-.82)/.2);ctx.translate(x,y);ctx.rotate(age*8);const img=i%4===0?art.diamond:art.coin;ctx.drawImage(img,-size/2,-size/2,size,size);ctx.restore();
     }
    }
   };
   const loop=new DemandFrameLoop({request:callback=>requestAnimationFrame(callback),cancel:handle=>cancelAnimationFrame(handle)},draw);playback.current=loop;
   visibility=()=>loop.setPlayback(!latest.current.obscured&&!latest.current.reducedMotion&&(latest.current.inBonus||latest.current.inBonus!==previous||lastOpening>0),!document.hidden&&intersecting);refreshPlayback.current=visibility;
   observer=new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect){layoutWidth=Math.max(1,rect.width);layoutHeight=Math.max(1,rect.height);}loop.invalidate();});observer.observe(canvas);
   // The portrait camera clips this right-wall prop completely. Keep its
   // decoded parts and exact local phase, but do not run invisible coin/lid
   // work. Returning to view paints any pending bonus/state change first.
   intersection=new IntersectionObserver(entries=>{
    intersecting=entries.some(entry=>entry.isIntersecting);
    canvas.dataset.chestVisibility=intersecting?'visible':'offscreen';
    visibility();
    if(intersecting)loop.invalidate();
   });intersection.observe(canvas);
   document.addEventListener('visibilitychange',visibility);visibility();loop.invalidate();
  }).catch(()=>{/* The untouched painted prop remains the safe fallback. */});
  return()=>{disposed=true;refreshPlayback.current=null;playback.current?.dispose();playback.current=null;observer?.disconnect();intersection?.disconnect();document.removeEventListener('visibilitychange',visibility);};
 },[]);
 useEffect(()=>{refreshPlayback.current?.();playback.current?.invalidate();},[inBonus,obscured,reducedMotion]);
 return <div className="cabin-treasure-chest" aria-hidden="true"><canvas ref={canvasRef}/></div>;
});
