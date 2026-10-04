import {SHARK_FRAMES} from './shark-frames-v41';
export type SharkPose={x:number;y:number;width:number;yaw:number;pitch:number;angle:number;alpha:number};
type Point=[number,number];
const clamp=(v:number,min:number,max:number)=>Math.max(min,Math.min(max,v));

/** Fractional heading samples the baked, feature-registered turn continuously.
 * Front is one shared image; only the side view is mirrored after 90 degrees. */
export function sharkFrame(yaw:number){
  const angle=clamp(-yaw*180/Math.PI,0,180),view=Math.min(angle,180-angle),index=Math.floor(view),nextIndex=Math.min(90,index+1);
  return{index,nextIndex,weight:view-index,mirror:angle>90,frame:SHARK_FRAMES[index],next:SHARK_FRAMES[nextIndex]};
}
export function sharkRegistration(pose:SharkPose){
  const selected=sharkFrame(pose.yaw),front=Math.sin(clamp(-pose.yaw,0,Math.PI)),scale=pose.width*.28*(1+.075*front)/72;
  return{...selected,scale,headX:pose.x+Math.cos(pose.yaw)*pose.width*.27,headY:pose.y+pose.width*(.012-Math.sin(pose.pitch)*.27)};
}
export function sharkNoseContact(pose:SharkPose):Point{
  const r=sharkRegistration(pose),f=r.frame,g=r.next,t=r.weight;
  const nose=(frame:typeof f)=>frame.angle===90?[frame.headX,frame.headY+.6]:[frame.noseX,frame.noseY];
  const a=nose(f),b=nose(g),dx=((a[0]+(b[0]-a[0])*t)-f.headX)*r.scale*(r.mirror?-1:1),dy=((a[1]+(b[1]-a[1])*t)-f.headY)*r.scale,c=Math.cos(pose.angle),s=Math.sin(pose.angle);
  return[r.headX+dx*c-dy*s,r.headY+dx*s+dy*c];
}

/** Two small retained surfaces. Morph registration is baked offline, so no
 * optical flow, landmark solve or mesh generation runs during gameplay. */
export function createSharkPainter(atlas:HTMLImageElement){
  const source=document.createElement('canvas'),scratch=document.createElement('canvas');source.width=scratch.width=288;source.height=scratch.height=160;
  const sc=source.getContext('2d')!,ctx=scratch.getContext('2d')!;
  function triangle(src:Point[],dst:Point[]){
    const[a,b,c]=src,[p,q,r]=dst,dx1=b[0]-a[0],dy1=b[1]-a[1],dx2=c[0]-a[0],dy2=c[1]-a[1],det=dx1*dy2-dx2*dy1;
    const aa=((q[0]-p[0])*dy2-(r[0]-p[0])*dy1)/det,bb=((q[1]-p[1])*dy2-(r[1]-p[1])*dy1)/det,cc=(dx1*(r[0]-p[0])-dx2*(q[0]-p[0]))/det,dd=(dx1*(r[1]-p[1])-dx2*(q[1]-p[1]))/det;
    const cx=(p[0]+q[0]+r[0])/3,cy=(p[1]+q[1]+r[1])/3;ctx.save();ctx.beginPath();
    dst.forEach(([x,y],i)=>{const d=Math.hypot(x-cx,y-cy)||1,xx=x+(x-cx)/d*.65,yy=y+(y-cy)/d*.65;if(i)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy);});ctx.closePath();ctx.clip();
    ctx.transform(aa,bb,cc,dd,p[0]-aa*a[0]-cc*a[1],p[1]-bb*a[0]-dd*a[1]);ctx.drawImage(source,0,0);ctx.restore();
  }
  const restore=()=>{if(source.width!==288){source.width=scratch.width=288;source.height=scratch.height=160;}};
  return{
    kind:'continuous-raster' as const,
    get backingSize(){return source.width;},
    prepare(pixelWidth:number){if(Number.isFinite(pixelWidth)&&pixelWidth>0){restore();return true;}return false;},
    park(){source.width=source.height=scratch.width=scratch.height=1;},
    dispose(){source.width=source.height=scratch.width=scratch.height=1;},
    paint(destination:CanvasRenderingContext2D,pose:SharkPose,time:number,staticPose:boolean){
      if(pose.alpha<=0||pose.width<=0)return;restore();
      const r=sharkRegistration(pose),f=r.frame,g=r.next,t=r.weight;
      sc.clearRect(0,0,288,160);sc.globalCompositeOperation='lighter';
      for(const [frame,weight]of [[f,1-t],[g,t]] as const){
        if(weight<=0)continue;sc.globalAlpha=weight;sc.save();
        if(r.mirror&&frame.angle===90){sc.translate(frame.headX*2,0);sc.scale(-1,1);}
        sc.drawImage(atlas,frame.x,frame.y,288,160,0,0,288,160);sc.restore();
      }
      sc.globalAlpha=1;sc.globalCompositeOperation='source-over';ctx.clearRect(0,0,288,160);
      const tail=f.tailEnd+(g.tailEnd-f.tailEnd)*t;
      if(staticPose||tail<1)ctx.drawImage(source,0,0);
      else{
        const amplitude=72*.023*Math.sin(time*4.1),dy=(x:number)=>amplitude*(1-x/tail)**2;
        for(let i=0;i<6;i++){const x0=tail*i/6,x1=tail*(i+1)/6,y0=dy(x0),y1=dy(x1);triangle([[x0,0],[x1,0],[x1,160]],[[x0,y0],[x1,y1],[x1,160+y1]]);triangle([[x0,0],[x1,160],[x0,160]],[[x0,y0],[x1,160+y1],[x0,160+y0]]);}
        ctx.drawImage(source,tail,0,288-tail,160,tail,0,288-tail,160);
      }
      destination.save();destination.globalAlpha=pose.alpha;destination.translate(r.headX,r.headY);destination.rotate(pose.angle);destination.scale((r.mirror?-1:1)*r.scale,r.scale);destination.translate(-f.headX,-f.headY);destination.drawImage(scratch,0,0);destination.restore();
    },
  };
}
