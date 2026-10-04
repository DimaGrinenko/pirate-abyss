import {useEffect,useRef,useState} from 'react';
import {decodedImage} from './asset-readiness';
import {AnimationFrameLoop} from './animation-frame-loop';
import {chestLidAngle} from './guardian-chest-v40';
import {createGuardianChestRenderer,type GuardianChestRenderer,type GuardianChestTextures} from './guardian-chest-renderer-v40';
import {GUARDIAN_CHEST_MATERIALS,GUARDIAN_CHEST_POSTER} from './guardian-chest-assets-v40';
const loop=new AnimationFrameLoop({
  request:callback=>requestAnimationFrame(callback),cancel:handle=>cancelAnimationFrame(handle),hidden:()=>document.hidden,
  subscribeVisibility:callback=>{document.addEventListener('visibilitychange',callback);return()=>document.removeEventListener('visibilitychange',callback);},
});
export function GuardianChest({held=false,reducedMotion=false,timeScale=1}:{held?:boolean;reducedMotion?:boolean;timeScale?:number}) {
  const canvas=useRef<HTMLCanvasElement>(null),clock=useRef(0),refresh=useRef<()=>void>(()=>undefined);
  const state=useRef({held,reducedMotion,timeScale});state.current={held,reducedMotion,timeScale};
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    let disposed=false,painted=false,contextLost=false,stop:(()=>void)|undefined,renderer:GuardianChestRenderer|undefined,images:GuardianChestTextures|undefined;
    const element=canvas.current;if(!element)return;
    const fail=()=>{stop?.();stop=undefined;renderer?.dispose();renderer=undefined;painted=false;if(!disposed)setReady(false);};
    const paint=()=>{
      if(!renderer||contextLost)return false;
      const rect=element.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
      const width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);
      if(!width||!height)return false;
      const angle=chestLidAngle(clock.current,state.current.reducedMotion);
      if(!renderer.draw(width,height,angle)){fail();return false;}
      element.dataset.lidAngle=angle.toFixed(2);if(!painted){painted=true;setReady(true);}return true;
    };
    const update=()=>{
      stop?.();stop=undefined;if(disposed||contextLost||document.hidden||!renderer)return;
      try{
        if(!paint())return;
        if(clock.current<1.36&&!state.current.held&&!state.current.reducedMotion&&state.current.timeScale>0)stop=loop.subscribe(delta=>{
          clock.current=Math.min(1.36,clock.current+delta*Math.min(4,state.current.timeScale));
          if(!paint()||clock.current>=1.36){stop?.();stop=undefined;}
        },fail);
      }catch{fail();}
    };
    const initialize=()=>{
      if(disposed||contextLost||!images)return;
      try{renderer=createGuardianChestRenderer(element,images);update();}catch{fail();}
    };
    const lose=(event:Event)=>{event.preventDefault();contextLost=true;fail();};
    const restore=()=>{contextLost=false;initialize();};
    element.addEventListener('webglcontextlost',lose);element.addEventListener('webglcontextrestored',restore);
    refresh.current=update;const observer=new ResizeObserver(update);observer.observe(element);document.addEventListener('visibilitychange',update);
    void Promise.all(Object.entries(GUARDIAN_CHEST_MATERIALS).map(async([key,url])=>[key,await decodedImage(url)] as const)).then(entries=>{
      if(disposed)return;
      images=Object.fromEntries(entries) as GuardianChestTextures;initialize();
    }).catch(fail);
    return()=>{disposed=true;stop?.();renderer?.dispose();observer?.disconnect();document.removeEventListener('visibilitychange',update);element.removeEventListener('webglcontextlost',lose);element.removeEventListener('webglcontextrestored',restore);refresh.current=()=>undefined;};
  },[]);
  useEffect(()=>{refresh.current();},[held,reducedMotion,timeScale]);
  return <div className="guardian-chest" aria-hidden="true" data-chest-renderer={ready?'depth-webgl':'poster'}>
    {!ready&&<img src={GUARDIAN_CHEST_POSTER} alt="" draggable={false}/>}
    <canvas ref={canvas} style={{visibility:ready?'visible':'hidden'}}/>
  </div>;
}
