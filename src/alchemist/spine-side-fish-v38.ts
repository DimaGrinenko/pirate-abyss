import { SideFishSchool } from './fish-side-motion-v38';
import type { FishRoute } from './fish-route-data';
import type { FishWaterPolygon } from './fish-spacing';
type Bone = { data:{name:string};x:number;y:number;rotation:number;scaleX:number;scaleY:number };
type Slot = {data:{name:string};color:{a:number}};
type Skeleton = {bones:Bone[];slots?:Slot[]};

/** Overrides all old native route and scale tracks after AnimationState.apply.
 * The independent tail-child tracks still animate the newly connected sprite. */
export class SpineSideFishSchool {
  readonly school:SideFishSchool;
  private source:Bone[]|undefined;
  private bones:Bone[]=[];
  private slots:(Slot|undefined)[]=[];
  private routes:readonly FishRoute[];
  constructor(routes:readonly FishRoute[],polygons:Record<string,FishWaterPolygon>,navigation:Record<string,FishWaterPolygon>=polygons){this.routes=routes;this.school=new SideFishSchool(routes,polygons,navigation);}
  apply(skeleton:Skeleton,delta:number,bonus:boolean,reducedMotion:boolean,hidden=false){
    if(this.source!==skeleton.bones){
      this.source=skeleton.bones;
      const bones=new Map(skeleton.bones.map(b=>[b.data.name,b])),slots=new Map(skeleton.slots?.map(s=>[s.data.name,s])??[]);
      this.bones=this.routes.map(r=>{const bone=bones.get(r.name);if(!bone)throw Error(`Missing side fish bone ${r.name}`);return bone;});
      this.slots=this.routes.map(r=>slots.get(r.name));
    }
    const poses=this.school.update(delta,bonus,reducedMotion);
    poses.forEach((pose,i)=>{
      const scale=pose.width/this.routes[i].width;
      const bone=this.bones[i];bone.x=pose.x-836;bone.y=470.5-pose.y;bone.rotation=-pose.angle*180/Math.PI;bone.scaleX=pose.facing*scale;bone.scaleY=scale;
      const slot=this.slots[i];if(slot)slot.color.a=hidden||!pose.visible?0:pose.alpha;
    });
  }
}
