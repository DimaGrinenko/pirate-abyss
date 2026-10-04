import type { FishRoute } from './fish-route-data';

type Point = readonly [number, number];
type WindowName = 'main' | 'upper';
type Facing = 1 | -1;
type Bounds = { left: number; right: number; top: number; bottom: number };
type Polygons = Record<string, readonly Point[]>;
export type SideFishPose = {
  readonly name: string; readonly species: string;
  readonly x: number; readonly y: number; readonly angle: number; readonly facing: Facing;
  readonly width: number; readonly height: number; readonly alpha: number; readonly visible: boolean;
};
type MutablePose = { -readonly [K in keyof SideFishPose]: SideFishPose[K] };
export type SideFishLane = {
  readonly window: WindowName; readonly names: readonly string[]; readonly facing: Facing;
  readonly y: number; readonly left: number; readonly right: number;
  readonly speed: number; readonly bob: number; readonly envelopeY: number;
};
type Member = { route: FishRoute; pose: MutablePose; offset: number; seed: number };
type Lane = { info: SideFishLane; members: Member[]; phase: number; rate: number; duty: number };

/** Full raster, tail deformation and AA; bounds never rely on transparent pixels. */
export function sideFishEnvelope(route: Pick<FishRoute, 'width' | 'height'>) {
  return { rx: route.width * .56 + 2, ry: route.height * .56 + 2 };
}
const RETURN_HOLD = 3.1;
const MAIN_Y = [.14, .28, .42, .56, .70, .84];
const MAIN_SPEED = [17, 19, 18, 21, 16, 20];
const MAIN_PHASE = [.14, .31, .08, .24, .38, .17];
const MAIN_BOB = [1.5, 1.7, 1.4, 1.8, 1.6, 1.4];
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => { const t = clamp(v); return t*t*(3-2*t); };
const modulo = (v: number) => (v % 1 + 1) % 1;

function bounds(points: readonly Point[] | undefined, name: string): Bounds {
  if (!points || points.length < 3 || points.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
    throw Error(`Side fish ${name} mask must contain a finite polygon`);
  }
  const result = { left: Math.min(...points.map(p => p[0])), right: Math.max(...points.map(p => p[0])), top: Math.min(...points.map(p => p[1])), bottom: Math.max(...points.map(p => p[1])) };
  if (result.right <= result.left || result.bottom <= result.top) throw Error(`Side fish ${name} mask is empty`);
  return result;
}

/** These registered openings have one contiguous horizontal interval. Checking
 * strip ends and every polygon corner bounds its complete axis-aligned box. */
function safeStrip(points: readonly Point[], y: number, rx: number, ry: number, bob: number) {
  const top = y-ry-bob-5, bottom = y+ry+bob+5;
  const levels = [top, bottom, ...points.filter(p => p[1]>top && p[1]<bottom).map(p => p[1])];
  let left = -Infinity, right = Infinity;
  for (const level of levels) {
    const intersections: number[] = [];
    for (let i=0; i<points.length; i++) {
      const a=points[i], b=points[(i+1)%points.length];
      if (a[1]===b[1]) { if (level===a[1]) intersections.push(a[0],b[0]); }
      else if (level>=Math.min(a[1],b[1]) && level<=Math.max(a[1],b[1])) intersections.push(a[0]+(level-a[1])*(b[0]-a[0])/(b[1]-a[1]));
    }
    if (intersections.length<2) throw Error('Side fish lanes need a taller water opening');
    left=Math.max(left,Math.min(...intersections)+rx+5);
    right=Math.min(right,Math.max(...intersections)-rx-5);
  }
  if (!Number.isFinite(left+right) || right-left<2) throw Error('Side fish lanes need more interior clearance');
  return {left,right};
}

/** Fish approach and retreat in depth while still inside the glass. Their
 * fixed side artwork never rotates or traverses the wooden frame. All reset
 * positions are hidden; both endpoints are safe even at full authored size. */
export class SideFishSchool {
  readonly poses: readonly SideFishPose[];
  readonly lanes: readonly SideFishLane[];
  private readonly moving: Lane[]=[];
  private clock=0;
  private presence=1;
  private targetBonus=false;
  private returnDelay=0;

  constructor(routes: readonly FishRoute[], masks: Polygons, navigation: Polygons=masks) {
    if (routes.some(r=>![r.width,r.height,r.centerY,r.constantDepthOpacity].every(Number.isFinite) || r.width<=0 || r.height<=0)) throw Error('Side fish routes must be finite with positive dimensions');
    const main=routes.filter(r=>(r.window??'main')==='main').sort((a,b)=>a.centerY-b.centerY);
    const upper=routes.filter(r=>r.window==='upper').sort((a,b)=>a.centerY-b.centerY);
    if (main.length!==12 || upper.length!==3) throw Error('Side fish lanes need 12 main and 3 upper fish');
    const byName=new Map<string,MutablePose>();
    const addLane=(group: FishRoute[], window: WindowName, y: number, facing: Facing, speed: number, bob: number, phase: number, duty: number, fixedRate?: number)=>{
      const rx=Math.max(...group.map(r=>sideFishEnvelope(r).rx)), ry=Math.max(...group.map(r=>sideFishEnvelope(r).ry));
      const visible=safeStrip(masks[window],y,rx,ry,bob), interior=safeStrip(navigation[window],y,rx,ry,bob);
      const left=Math.max(visible.left,interior.left),right=Math.min(visible.right,interior.right);
      if (right-left<2) throw Error('Side fish lanes need more interior clearance');
      const info: SideFishLane={window,names:group.map(r=>r.name),facing,y,left,right,speed,bob,envelopeY:ry+bob};
      const members=group.map((route,index)=>{
        const pose: MutablePose={name:route.name,species:route.species,x:0,y,angle:0,facing,width:route.width,height:route.height,alpha:0,visible:false};
        byName.set(route.name,pose);
        return {route,pose,offset:index/group.length,seed:this.moving.length*.91+index*1.7};
      });
      this.moving.push({info,members,phase,rate:fixedRate??Math.min(1/12,speed*duty/(right-left)),duty});
    };
    for (const name of ['main','upper'] as const) { bounds(masks[name],name); bounds(navigation[name],`${name} navigation`); }
    const mainBounds=bounds(navigation.main,'main');
    for (let i=0;i<6;i++) addLane(main.slice(i*2,i*2+2),'main',mainBounds.top+(mainBounds.bottom-mainBounds.top)*MAIN_Y[i],i%2===0?1:-1,MAIN_SPEED[i],MAIN_BOB[i],MAIN_PHASE[i],.46);
    const upperBounds=bounds(navigation.upper,'upper');
    // The small porthole cannot contain three full-size fish in stacked rows.
    // Stagger their in-depth appearances, retaining each identity and heading.
    for (let i=0;i<3;i++) addLane([upper[i]],'upper',(upperBounds.top+upperBounds.bottom)/2,i%2===0?-1:1,7,.45,.08+i/3,.28,1/18);
    this.poses=routes.map(r=>byName.get(r.name)!);
    this.lanes=this.moving.map(lane=>lane.info);
    this.paint();
  }
  get concealed() { return this.presence===0; }
  get phase(): 'base'|'departing'|'away'|'returning' {
    return this.targetBonus ? (this.concealed?'away':'departing') : (this.presence===1 && this.returnDelay===0?'base':'returning');
  }
  update(delta: number, bonus: boolean, reducedMotion=false): readonly SideFishPose[] {
    if (bonus!==this.targetBonus) {
      const wasAway=this.concealed;
      this.targetBonus=bonus;
      this.returnDelay=!bonus&&wasAway?RETURN_HOLD:0;
    }
    if (reducedMotion) { this.presence=bonus?0:1; this.returnDelay=0; this.paint(); return this.poses; }
    if (!Number.isFinite(delta) || delta<=0) return this.poses;
    const dt=Math.min(.1,delta);
    if (bonus && this.concealed) return this.poses;
    if (this.returnDelay>0) { this.returnDelay=Math.max(0,this.returnDelay-dt); return this.poses; }
    this.presence=clamp(this.presence+(bonus?-dt/1.1:dt/1.3));
    this.clock+=dt;
    for (const lane of this.moving) lane.phase=modulo(lane.phase+lane.rate*dt);
    this.paint();
    return this.poses;
  }
  private paint() {
    for (const lane of this.moving) for (const member of lane.members) {
      const progress=Math.min(1,modulo(lane.phase+member.offset)/lane.duty);
      // A short zero-alpha interval at BOTH ends remains longer than the
      // maximum .1s update, so even coarse frames reset invisibly.
      const depth=smooth((progress-.035)/.22)*smooth((1-progress-.035)/.22)*smooth(this.presence);
      const scale=.48+.52*depth;
      const pose=member.pose;
      pose.x=lane.info.facing===1?lane.info.left+(lane.info.right-lane.info.left)*progress:lane.info.right-(lane.info.right-lane.info.left)*progress;
      pose.y=lane.info.y+Math.sin(this.clock*.65+member.seed)*lane.info.bob;
      pose.width=member.route.width*scale; pose.height=member.route.height*scale;
      pose.alpha=member.route.constantDepthOpacity*depth; pose.visible=pose.alpha>.001;
    }
  }
}
