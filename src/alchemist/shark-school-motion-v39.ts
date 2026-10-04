import type { SharkPose } from './shark-renderer-v39';

const TAU = Math.PI * 2;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const t = clamp(v); return t ** 3 * (t * (t * 6 - 15) + 10); };
const mix = (a: number, b: number, v: number) => a + (b - a) * v;
const HEADING_SCALE = Math.tanh(2.6);

/** Distinct projected-height corridors include fins and the leader's enlarged
 * glass charge. Depth opacity alone cannot prevent silhouettes intersecting. */
export const SHARK_PATROLS = [
  { frequency: TAU / 15.5, phase: -.8, amplitude: 55, y: 370, bob: 12, width: 137, alpha: .96 },
  { frequency: TAU / 20, phase: 1.85, amplitude: 40, y: 210, bob: 9, width: 99, alpha: .82 },
  { frequency: TAU / 23.2, phase: 3.1, amplitude: 30, y: 497, bob: 8, width: 78, alpha: .67 },
  { frequency: TAU / 18.6, phase: 4.6, amplitude: 37, y: 275, bob: 5, width: 65, alpha: .56 },
] as const;

export function sharkPatrol(time: number, index: number, pose: SharkPose): void {
  const route = SHARK_PATROLS[index], angle = time * route.frequency + route.phase, sine = Math.sin(angle);
  const direction = Math.tanh(Math.cos(angle) * 2.6) / HEADING_SCALE;
  pose.x = (index === 2 ? 238 : 190) + route.amplitude * sine; pose.y = route.y + route.bob * Math.cos(angle + .4);
  pose.width = route.width; pose.yaw = -Math.acos(direction); pose.pitch = Math.sin(angle + .7) * .05;
  pose.angle = sine * .045; pose.alpha = route.alpha;
}

export function sharkGlassCharge(pose: SharkPose, age: number): void {
  if (age < 0 || age >= 3.8) return;
  const focus = ease(age / 1.1) * (1 - ease((age - 2.3) / 1.5));
  const charge = ease((age - 1.1) / .55) * (1 - ease((age - 1.7) / .62));
  pose.x = mix(pose.x, 202, focus); pose.y = mix(pose.y, 374, focus);
  pose.yaw = mix(pose.yaw, -Math.PI / 2, focus); pose.pitch = mix(pose.pitch, -.055, focus);
  pose.width *= 1 + .47 * charge;
  pose.angle += Math.sin(Math.PI * clamp((age - 1.65) / .75)) * .095;
  pose.alpha = mix(pose.alpha, 1, focus);
}

const blank = (): SharkPose => ({x:0,y:0,width:0,yaw:0,pitch:0,angle:0,alpha:0});
const keys = ['x','y','width','yaw','pitch','angle','alpha'] as const;
/** Sharks stay in registered water. Arrival and departure use depth, rather
 * than traversing the wooden frame. The ordinary school gets 3.6s to drain;
 * retreat finishes before its existing 3.1s return hold expires. */
export class TurningSharkSchool {
  readonly poses = SHARK_PATROLS.map(blank);
  private from = SHARK_PATROLS.map(blank);
  private target = false;
  private clock = 0;
  private age = 0;
  private arrivalDelay = 3.6;
  private state: 'off'|'entering'|'patrol'|'leaving' = 'off';
  private destination = blank();
  private reduced = false;
  get phase() { return this.state; }
  update(delta:number,active:boolean,reducedMotion:boolean,lastRendered?:readonly SharkPose[]) {
    if(active !== this.target) {
      const wasOff = this.state === 'off'; this.target=active; this.age=0;
      this.arrivalDelay=wasOff?3.6:0;
      this.state=active?'entering':'leaving';
      this.poses.forEach((pose,i)=>{
        if(wasOff) { sharkPatrol(this.clock,i,pose);pose.width*=.25;pose.alpha=0; }
        else if(lastRendered) Object.assign(pose,lastRendered[i]);
        Object.assign(this.from[i],pose);
      });
    }
    if(reducedMotion) {
      this.state=active?'patrol':'off';
      this.poses.forEach((p,i)=>{sharkPatrol(4,i,p);p.yaw=i%2?-Math.PI+.2:-.2;p.alpha=active?SHARK_PATROLS[i].alpha:0;});
      this.reduced=true;return this.poses;
    }
    if(this.reduced&&active){this.state='entering';this.age=0;this.arrivalDelay=0;this.poses.forEach((p,i)=>Object.assign(this.from[i],p));}
    this.reduced=false;
    const dt=Number.isFinite(delta)?Math.max(0,Math.min(.1,delta)):0;
    if(dt===0||this.state==='off')return this.poses;
    this.clock+=dt;this.age+=dt;
    this.poses.forEach((pose,i)=>{
      if(this.state==='patrol') { sharkPatrol(this.clock,i,pose);return; }
      const start=this.from[i], end=this.destination;
      if(active) {
        sharkPatrol(this.clock,i,end);
        const progress=ease((this.age-this.arrivalDelay-i*.18)/2.1);
        for(const key of keys)pose[key]=mix(start[key],end[key],progress);
      } else {
        // Preserve the charged contact pose on interruption. A gentle backward
        // swim recedes along its own corridor without an instantaneous turn.
        const progress=ease(this.age/2.6);
        Object.assign(pose,start);
        pose.width=start.width*mix(1,.25,progress);
        pose.alpha=start.alpha*(1-progress);
        pose.pitch=mix(start.pitch,0,progress);
        pose.angle=mix(start.angle,0,progress);
      }
    });
    if(active&&this.age>=this.arrivalDelay+2.1+(SHARK_PATROLS.length-1)*.18)this.state='patrol';
    if(!active&&this.age>=2.6){this.state='off';for(const p of this.poses)p.alpha=0;}
    return this.poses;
  }
}
