import { FishSchoolSpacing, type FishSpacingRoute, type FishWaterPolygon } from './fish-spacing';
import type { BonusWindowSchool } from './bonus-window-school';

type Bone = { data: { name: string }; x: number; y: number; rotation: number; scaleX: number; scaleY: number };
type Skeleton = { bones: Bone[] };

/** The same world-space solver for the flat recovery renderer. Bone matching
 * happens once, before paint; unrelated cabin bones are never touched. */
export class SpineFishSpacing {
  private solver: FishSchoolSpacing;
  private routes: readonly FishSpacingRoute[];
  private bones: Bone[] = [];
  private source: Bone[] | undefined;
  private positions: { x: number; y: number }[];
  constructor(routes: readonly FishSpacingRoute[], navigation: Record<string, FishWaterPolygon>) {
    this.routes = routes; this.solver = new FishSchoolSpacing(routes, navigation);
    this.positions = routes.map(() => ({ x: 0, y: 0 }));
  }
  apply(skeleton: Skeleton, school: BonusWindowSchool, delta: number, settled: boolean) {
    if (school.concealed) return;
    if (this.source !== skeleton.bones) {
      const byName = new Map(skeleton.bones.map(bone => [bone.data.name, bone]));
      this.bones = this.routes.map(route => {
        const bone = byName.get(route.name);
        if (!bone) throw Error(`Fish fallback bone missing: ${route.name}`);
        return bone;
      });
      this.source = skeleton.bones;
    }
    for (let i = 0; i < this.bones.length; i++) { this.positions[i].x = this.bones[i].x + 836; this.positions[i].y = 470.5 - this.bones[i].y; }
    this.solver.apply(this.positions, delta, school.inPassage, settled);
    for (let i = 0; i < this.bones.length; i++) { this.bones[i].x = this.positions[i].x - 836; this.bones[i].y = 470.5 - this.positions[i].y; }
    school.retainRenderedPose(skeleton);
  }
}
