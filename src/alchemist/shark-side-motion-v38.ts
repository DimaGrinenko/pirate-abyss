import type { SharkPose } from './shark-renderer-v38';
export const SHARK_SIDE_ROUTES = [
  {y:370,bob:9,width:137,alpha:.96,speed:44,facing:1},
  {y:210,bob:7,width:99,alpha:.82,speed:38,facing:-1},
  {y:497,bob:6,width:78,alpha:.67,speed:35,facing:1},
  {y:275,bob:4,width:65,alpha:.56,speed:41,facing:-1},
] as const;
const modulo=(x:number,m:number)=>(x%m+m)%m;
const ease=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(t*(t*6-15)+10);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export class SideSharkSchool {
  readonly poses:SharkPose[]=SHARK_SIDE_ROUTES.map(r=>({x:r.facing===1?-140:528,y:r.y,width:r.width,yaw:r.facing===1?0:Math.PI,pitch:0,angle:0,alpha:0}));
  private present=SHARK_SIDE_ROUTES.map(()=>false);
  private target=false;
  private clock=0;
  private age=0;
  private velocity=1;
  get phase():'off'|'entering'|'patrol'|'leaving'{return !this.target?(this.present.some(Boolean)?'leaving':'off'):this.age<8?'entering':'patrol';}
  update(delta:number,active:boolean,reducedMotion:boolean,lastRendered?:readonly SharkPose[]){
    if(active!==this.target){
      const wasOff=this.phase==='off';this.target=active;this.age=0;
      this.poses.forEach((pose,i)=>{
        const route=SHARK_SIDE_ROUTES[i];
        if(active&&wasOff){pose.x=route.facing===1?-140:528;this.present[i]=true;}
        else if(this.present[i]&&lastRendered){pose.x=lastRendered[i].x;pose.y=lastRendered[i].y;pose.width=lastRendered[i].width;pose.angle=lastRendered[i].angle;pose.alpha=lastRendered[i].alpha;}
      });
    }
    if(reducedMotion){this.poses.forEach((p,i)=>{p.x=[200,153,245,205][i];p.y=SHARK_SIDE_ROUTES[i].y;p.alpha=active?SHARK_SIDE_ROUTES[i].alpha:0;this.present[i]=active;});return this.poses;}
    const dt=Number.isFinite(delta)?Math.max(0,Math.min(.1,delta)):0;
    this.clock+=dt;this.age+=dt;
    this.velocity+=((active?1:6)-this.velocity)*(1-Math.exp(-dt*5));
    if(active)this.velocity=1;
    this.poses.forEach((pose,i)=>{
      const route=SHARK_SIDE_ROUTES[i],radius=route.width*.56+3,left=-radius-32,right=388+radius+32,length=right-left;
      if(!this.present[i]&&active&&this.age>i*.25){this.present[i]=true;pose.x=route.facing===1?left:right;}
      const entryAge=this.age-3.1-i*.22;
      if(this.present[i]&&dt>0&&(!active||entryAge>=0)){
        // Start with a brisk approach, settling smoothly to the patrol speed.
        const approach=active?1+1.4*(1-ease(entryAge/3)):this.velocity;
        pose.x+=route.facing*route.speed*approach*dt;
        if((route.facing===1&&pose.x>=right)||(route.facing===-1&&pose.x<=left)){
          if(active)pose.x=left+modulo(pose.x-left,length);else this.present[i]=false;
        }
      }
      if(active){pose.y=route.y+Math.sin(this.clock*.4+i*1.7)*route.bob;pose.width=route.width;pose.angle=Math.sin(this.clock*.38+i)*.016;}
      else pose.width+=(route.width-pose.width)*(1-Math.exp(-dt*3));
      pose.yaw=route.facing===1?0:Math.PI;pose.pitch=0;
      pose.alpha=!this.present[i]?0:active?route.alpha:pose.alpha+(route.alpha-pose.alpha)*(1-Math.exp(-dt*3));
    });return this.poses;
  }
}

/** An oblique side-on bump preserves the whole face throughout the approach.
 * A local increase of size brings the animal to the pane; no nose-on yaw. */
export function sideSharkGlassCharge(pose:SharkPose,age:number){
  if(age<0||age>=3.8)return;
  const focus=ease(age/1.1)*(1-ease((age-2.3)/1.5)),charge=ease((age-1.1)/.55)*(1-ease((age-1.7)/.62));
  pose.x=mix(pose.x,188,focus);pose.y=mix(pose.y,374,focus);pose.width*=1+.35*charge;
  pose.angle+=Math.sin(Math.PI*Math.max(0,Math.min(1,(age-1.65)/.75)))*.06;pose.alpha=mix(pose.alpha,1,focus);
}
