import { SHARK_FRAMES } from './shark-frames-v40';

export type SharkPose = {x:number;y:number;width:number;yaw:number;pitch:number;angle:number;alpha:number};
const clamp=(x:number,min:number,max:number)=>Math.max(min,Math.min(max,x));
type Point=[number,number];

/** One whole authored animal is selected, never two blended faces. The single
 * front view is not mirrored when heading crosses90degrees. */
export function sharkFrame(yaw:number) {
  const angle=clamp(-yaw*180/Math.PI,0,180),view=Math.min(angle,180-angle);
  let index=0;
  for(let i=1;i<SHARK_FRAMES.length;i++)if(Math.abs(SHARK_FRAMES[i].angle-view)<Math.abs(SHARK_FRAMES[index].angle-view))index=i;
  return {index,mirror:angle>90&&index!==SHARK_FRAMES.length-1,frame:SHARK_FRAMES[index]};
}

export function sharkRegistration(pose:SharkPose) {
  const selected=sharkFrame(pose.yaw),front=Math.sin(clamp(-pose.yaw,0,Math.PI));
  // Head height is the anatomical reference: never stretch a frontal frame
  // to the side silhouette's full width. Source head pixels remain rigid.
  const scale=pose.width*.28*(1+.075*front)/selected.frame.headHeight;
  return {...selected,scale,headX:pose.x+Math.cos(pose.yaw)*pose.width*.27,headY:pose.y+pose.width*(.012-Math.sin(pose.pitch)*.27)};
}

export function sharkNoseContact(pose:SharkPose):Point {
  const r=sharkRegistration(pose),f=r.frame,dx=(f.noseX-f.headX)*r.scale*(r.mirror?-1:1),dy=(f.noseY-f.headY)*r.scale,c=Math.cos(pose.angle),s=Math.sin(pose.angle);
  return [r.headX+dx*c-dy*s,r.headY+dx*s+dy*c];
}

/** Continuous world motion and a small connected tail bend are evaluated each
 * paint. The face and front half are one unchanged rectangular raster sample. */
export function createSharkPainter(atlas:HTMLImageElement) {
  const scratch=document.createElement('canvas');scratch.width=512;scratch.height=320;
  const working=scratch.getContext('2d')!;
  const triangle=(ctx:CanvasRenderingContext2D,source:readonly Point[],dest:readonly Point[])=>{
    const [a,b,c]=source,[p,q,r]=dest,dx1=b[0]-a[0],dy1=b[1]-a[1],dx2=c[0]-a[0],dy2=c[1]-a[1],det=dx1*dy2-dx2*dy1;
    const aa=((q[0]-p[0])*dy2-(r[0]-p[0])*dy1)/det,bb=((q[1]-p[1])*dy2-(r[1]-p[1])*dy1)/det,cc=(dx1*(r[0]-p[0])-dx2*(q[0]-p[0]))/det,dd=(dx1*(r[1]-p[1])-dx2*(q[1]-p[1]))/det;
    const cx=(p[0]+q[0]+r[0])/3,cy=(p[1]+q[1]+r[1])/3;
    ctx.save();ctx.beginPath();dest.forEach(([x,y],i)=>{const d=Math.hypot(x-cx,y-cy)||1,xx=x+(x-cx)/d*.8,yy=y+(y-cy)/d*.8;if(i)ctx.lineTo(xx,yy);else ctx.moveTo(xx,yy);});ctx.closePath();ctx.clip();
    ctx.transform(aa,bb,cc,dd,p[0]-aa*a[0]-cc*a[1],p[1]-bb*a[0]-dd*a[1]);ctx.drawImage(atlas,0,0);ctx.restore();
  };
  return {
    kind:'directional-raster' as const,
    get backingSize(){return scratch.width;},
    prepare(pixelWidth:number){return Number.isFinite(pixelWidth)&&pixelWidth>0;},
    park(){scratch.width=scratch.height=1;},
    dispose(){scratch.width=scratch.height=1;},
    paint(ctx:CanvasRenderingContext2D,pose:SharkPose,time:number,staticPose:boolean) {
      if(pose.alpha<=0||pose.width<=0)return;
      const r=sharkRegistration(pose),f=r.frame;
      ctx.save();ctx.globalAlpha=pose.alpha;ctx.translate(r.headX,r.headY);ctx.rotate(pose.angle);ctx.scale((r.mirror?-1:1)*r.scale,r.scale);ctx.translate(-f.headX,-f.headY);
      if(staticPose||f.tailEnd===0)ctx.drawImage(atlas,f.x,f.y,f.width,f.height,0,0,f.width,f.height);
      else {
        if(scratch.width!==512||scratch.height!==320){scratch.width=512;scratch.height=320;}
        working.clearRect(0,0,512,320);
        const tail=f.tailEnd,amplitude=f.headHeight*.03*Math.sin(time*4.8),dy=(x:number)=>amplitude*(1-x/tail)**2;
        const steps=6;
        for(let i=0;i<steps;i++){
          const x0=tail*i/steps,x1=tail*(i+1)/steps,y0=dy(x0),y1=dy(x1);
          triangle(working,[[f.x+x0,f.y],[f.x+x1,f.y],[f.x+x1,f.y+f.height]],[[x0,y0],[x1,y1],[x1,f.height+y1]]);
          triangle(working,[[f.x+x0,f.y],[f.x+x1,f.y+f.height],[f.x+x0,f.y+f.height]],[[x0,y0],[x1,f.height+y1],[x0,f.height+y0]]);
        }
        working.drawImage(atlas,f.x+tail,f.y,f.width-tail,f.height,tail,0,f.width-tail,f.height);
        // Composite opacity only once, after connected triangles are opaque;
        // otherwise the background bleeds into every antialiased mesh seam.
        ctx.drawImage(scratch,0,0,f.width,f.height,0,0,f.width,f.height);
      }
      ctx.restore();
    },
  };
}
