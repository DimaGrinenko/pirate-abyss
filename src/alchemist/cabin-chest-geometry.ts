/** Rigid barrel-lid projection in the existing 1672×941 cabin coordinate space.
 * The front has no baked side perspective; the right end is its own solid cap. */
export type ChestPoint = [number, number];
export type ChestFace = { part: 'outer' | 'inner' | 'endCap'; uv: ChestPoint[]; points: ChestPoint[] };
export const CABIN_LID = Object.freeze({ x: 1414, y: 662, halfWidth: 63, depth: 72, crown: 36, thickness: 4, strips: 20 });

export function projectCabinLid(x: number, height: number, depth: number, angle: number): ChestPoint {
  const c=Math.cos(angle),s=Math.sin(angle),h=height*c+depth*s,z=depth*c-height*s;
  return [CABIN_LID.x+x*(1+z/1800)-13.5*z/CABIN_LID.depth,CABIN_LID.y+.5*z-h];
}

export function cabinLidFaces(angle: number): ChestFace[] {
  const g=CABIN_LID,faces:ChestFace[]=[];
  // Plane normal faces the viewer after the same physical edge-on angle.
  if(angle>Math.atan(.5)){
    const tabs=(408-326)/326,points=[[-g.halfWidth,0,g.depth],[g.halfWidth,0,g.depth],[g.halfWidth,0,-g.depth*tabs],[-g.halfWidth,0,-g.depth*tabs]];
    faces.push({part:'inner',uv:[[0,0],[1,0],[1,1],[0,1]],points:points.map(([x,h,z])=>projectCabinLid(x,h,z,angle))});
  }
  const profile=(t:number)=>({height:g.thickness+g.crown*Math.sin(Math.PI*t),depth:g.depth*(1-Math.cos(Math.PI*t))/2});
  // Only the front roof material is sampled. The legacy painted right side at
  // x640..720 is excluded, so it cannot be projected a second time.
  const roofUv=(u:number,t:number):ChestPoint=>[(105*(1-t)+u*(535+105*t))/720,250*t/325];
  for(let i=0;i<g.strips;i++){
    const t0=i/g.strips,t1=(i+1)/g.strips,a=profile(t0),b=profile(t1);
    const points=[projectCabinLid(-g.halfWidth,a.height,a.depth,angle),projectCabinLid(g.halfWidth,a.height,a.depth,angle),projectCabinLid(g.halfWidth,b.height,b.depth,angle),projectCabinLid(-g.halfWidth,b.height,b.depth,angle)];
    if(points[2][1]-points[1][1]>.000001)faces.push({part:'outer',uv:[roofUv(0,t0),roofUv(1,t0),roofUv(1,t1),roofUv(0,t1)],points});
  }
  // The front gold thickness is attached to both shell and inside plane.
  const rim=[projectCabinLid(-g.halfWidth,g.thickness,g.depth,angle),projectCabinLid(g.halfWidth,g.thickness,g.depth,angle),projectCabinLid(g.halfWidth,0,g.depth,angle),projectCabinLid(-g.halfWidth,0,g.depth,angle)];
  if(rim[2][1]-rim[1][1]>.000001)faces.push({part:'outer',uv:[[0,250/325],[640/720,250/325],[640/720,.985],[0,.985]],points:rim});
  // An opaque D-shaped raster cap fills the whole right cross-section. It
  // rotates rigidly with the roof even when the inner plane is edge-on.
  const edge=[{height:0,depth:0},{height:0,depth:g.depth},...Array.from({length:g.strips+1},(_,i)=>profile(1-i/g.strips))];
  const center={height:g.thickness+g.crown*.32,depth:g.depth*.5};
  const capUv=(p:{height:number;depth:number}):ChestPoint=>[p.depth/g.depth,1-p.height/(g.crown+g.thickness)];
  for(let i=0;i<edge.length;i++){
    const points=[center,edge[i],edge[(i+1)%edge.length]];
    faces.push({part:'endCap',uv:points.map(capUv),points:points.map(p=>projectCabinLid(g.halfWidth,p.height,p.depth,angle))});
  }
  // The inside is nearer once opened; it occludes the back of the rounded
  // shell. Keeping the outside above it paints a second apparent lid.
  const layer={outer:0,inner:1,endCap:2};
  return faces.sort((a,b)=>layer[a.part]-layer[b.part]);
}
