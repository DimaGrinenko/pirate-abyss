type FishBone = { data: { name: string }; x: number; y: number; rotation: number; scaleX: number; scaleY: number };
type FishSkeleton = { bones: FishBone[] };
type Pose = Pick<FishBone, 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY'>;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const t = clamp(v); return t * t * t * (t * (t * 6 - 15) + 10); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fishName = (name: string) => /^fish-[0-4]$|^school-[0-9]$/.test(name);
const upperWindow = (name: string) => name === 'fish-4' || /^school-[89]$/.test(name);
const pose = (bone: FishBone): Pose => ({ x: bone.x, y: bone.y, rotation: bone.rotation, scaleX: bone.scaleX, scaleY: bone.scaleY });
const copyPose = (target: Pose, source: Pose): void => { target.x = source.x; target.y = source.y; target.rotation = source.rotation; target.scaleX = source.scaleX; target.scaleY = source.scaleY; };
type Member = { bone: FishBone; nativeFacing: number; outsideX: number; routeY: number; previous: Pose; anchor: Pose; initialized: boolean };

/** A cosmetic pose override after the unchanged native idle has been evaluated.
 * Nobody fades or respawns in the glass. The authored foreground hides the
 * complete departure/arrival, and the original swim phase continues offscreen. */
export class BonusWindowSchool {
  private target = false;
  private elapsed = 0;
  private phase: 'base' | 'departing' | 'away' | 'returning' = 'base';
  private source: FishBone[] | undefined;
  private members: Member[] = [];

  /** Native skeleton bone membership is immutable. Cache filtering/metadata;
   * reuse two pose records instead of allocating each fish's pose every frame. */
  private bind(skeleton: FishSkeleton): Member[] {
    if (this.source !== skeleton.bones) {
      this.source = skeleton.bones;
      this.members = skeleton.bones.filter(bone => fishName(bone.data.name)).map((bone, index) => {
        const upper = upperWindow(bone.data.name);
        return { bone, nativeFacing: /^fish-[134]$/.test(bone.data.name) ? -1 : 1,
          outsideX: upper ? 1100 - 836 : -120 - 836, routeY: upper ? 415 : 470.5 - (275 + index % 4 * 19),
          previous: pose(bone), anchor: pose(bone), initialized: false };
      });
    }
    return this.members;
  }

  /** A completely occluded school needs no GPU draws until the bonus ends. */
  get concealed() { return this.phase === 'away'; }

  get inPassage() { return this.phase !== 'base'; }

  /** Spacing runs after the route override. Retain the actual visible pose so
   * the next bonus transition starts where the player last saw each fish. */
  retainRenderedPose(skeleton: FishSkeleton) {
    for (const member of this.bind(skeleton)) { copyPose(member.previous, member.bone); member.initialized = true; }
  }

  apply(skeleton: FishSkeleton, bonus: boolean, delta: number, reducedMotion = false) {
    const members = this.bind(skeleton);
    if (bonus !== this.target) {
      this.target = bonus; this.elapsed = 0;
      this.phase = bonus ? 'departing' : 'returning';
      for (const member of members) {
        copyPose(member.anchor, member.initialized ? member.previous : member.bone);
        // Keep distinct swim corridors instead of collapsing twelve bodies
        // into four shared lanes during the bonus departure.
        if (bonus) member.routeY = member.anchor.y;
      }
    }
    this.elapsed += Math.max(0, Math.min(delta, .05));
    if (reducedMotion) this.phase = bonus ? 'away' : 'base';
    if (this.phase === 'base') { for (const member of members) { copyPose(member.previous, member.bone); member.initialized = true; } return; }
    for (let index = 0; index < members.length; index++) {
      const member = members[index], { bone, nativeFacing, outsideX, routeY, anchor } = member;
      if (this.phase === 'away') { bone.x = outsideX; }
      else if (this.phase === 'departing') {
        const t = clamp((this.elapsed - index * .045) / 2.35), travel = ease((t - .13) / .87);
        // Turn in open water first. The foreground on the left is the actual
        // occluder; the golden right-hand rim is never used as a spawn point.
        bone.x = lerp(anchor.x, outsideX, travel);
        bone.y = lerp(anchor.y, routeY, ease(t));
        bone.scaleX = lerp(anchor.scaleX, -1 / nativeFacing, ease(t / .48));
        bone.scaleY = anchor.scaleY * (1 + .025 * Math.sin(Math.PI * t));
        bone.rotation = lerp(anchor.rotation, 0, ease(t));
      } else {
        // Let the sharks clear the window before the familiar school returns.
        const t = ease((this.elapsed - 2.7 - index * .08) / 2.5);
        bone.x = lerp(outsideX, bone.x, t);
        bone.y = lerp(routeY, bone.y, t);
        bone.scaleX = lerp(1 / nativeFacing, bone.scaleX, ease((t - .64) / .36));
        bone.rotation = lerp(0, bone.rotation, t);
      }
      copyPose(member.previous, bone); member.initialized = true;
    }
    if (this.phase === 'departing' && this.elapsed > 3) this.phase = 'away';
    if (this.phase === 'returning' && this.elapsed > 6.5) this.phase = 'base';
  }
}
