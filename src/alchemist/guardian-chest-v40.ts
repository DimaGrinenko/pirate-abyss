/** A rigid treasure box and a solid barrel lid. Every surface uses painted
 * raster material; both lid shells and end caps share one rear hinge. */
export type ChestMaterial = 'front' | 'side' | 'treasure' | 'outer' | 'inner' | 'cap' | 'pile';
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export interface ChestFace { material: ChestMaterial; points: Vec3[]; uv: Vec2[]; }
export const CHEST_GEOMETRY = { halfWidth: 1.2, depth: .72, height: .96, crown: .62, thickness: .065, strips: 20 } as const;
export const CHEST_YAW = .38;
// Fixed framing contains the full arc without camera drift or clipped corners.
export const CHEST_CAMERA = { spanX:3.36, spanY:3.24, centerX:.16, centerY:-.25 } as const;
export const CHEST_MATERIALS: ChestMaterial[] = ['front', 'side', 'treasure', 'outer', 'inner', 'cap', 'pile'];
const rect: Vec2[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
export function lidPoint([x, y, z]: Vec3, angle: number): Vec3 {
  const a = angle * Math.PI / 180, dz = z + CHEST_GEOMETRY.depth;
  return [x, y * Math.cos(a) + dz * Math.sin(a), -CHEST_GEOMETRY.depth + dz * Math.cos(a) - y * Math.sin(a)];
}
export function guardianChestFaces(angle: number): ChestFace[] {
  const { halfWidth: w, depth: d, height: h, crown: c, thickness: thick, strips } = CHEST_GEOMETRY;
  const faces: ChestFace[] = [];
  const add = (material: ChestMaterial, points: Vec3[], uv: Vec2[] = rect, lid = false) => faces.push({ material, points: lid ? points.map(p => lidPoint(p, angle)) : points, uv });
  // The base stays rigid. These four walls meet at precisely the same corners.
  add('front', [[-w,0,d],[w,0,d],[w,-h,d],[-w,-h,d]]);
  add('side', [[w,0,d],[w,0,-d],[w,-h,-d],[w,-h,d]]);
  add('side', [[-w,0,-d],[-w,0,d],[-w,-h,d],[-w,-h,-d]]);
  add('inner', [[w,0,-d],[-w,0,-d],[-w,-h,-d],[w,-h,-d]]);
  const inset=.11, wi=w-inset, di=d-inset;
  add('treasure', [[-wi,-.10,-di],[wi,-.10,-di],[wi,-.10,di],[-wi,-.10,di]]);
  // A real rim and its small outer bevel catch broad light. Its gold is sampled
  // from the painted strap, not drawn as a screen-space decorative outline.
  const gold:Vec2[]=[[.48,.16],[.52,.16],[.52,.64],[.48,.64]];
  const ring:Vec3[]=[[-w,0,-d],[w,0,-d],[w,0,d],[-w,0,d]];
  const innerRing:Vec3[]=[[-wi,0,-di],[wi,0,-di],[wi,0,di],[-wi,0,di]];
  const bevelRing:Vec3[]=ring.map(([x,,z])=>[x+Math.sign(x)*.018,-.045,z+Math.sign(z)*.018]);
  for(let i=0;i<4;i++){
    const j=(i+1)%4;
    add('outer',[ring[i],ring[j],innerRing[j],innerRing[i]],gold);
    add('outer',[ring[j],ring[i],bevelRing[i],bevelRing[j]],gold);
    const return0:Vec3=[ring[i][0],-.045,ring[i][2]],return1:Vec3=[ring[j][0],-.045,ring[j][2]];
    add('outer',[bevelRing[j],bevelRing[i],return0,return1],gold);
    const [x0,,z0]=innerRing[i],[x1,,z1]=innerRing[j];
    add('inner',[[x1,0,z1],[x0,0,z0],[x0,-.13,z0],[x1,-.13,z1]],[[.15,.18],[.85,.18],[.85,.30],[.15,.30]]);
  }
  // Two actual gold hinge barrels sit on the same axis as the lid pivot.
  // They stay on the rigid body; the lid rotates around their centers.
  for(const center of [-.78,.78])for(let i=0;i<12;i++){
    const a=i*Math.PI/6,b=(i+1)*Math.PI/6,r=.052;
    const p=(x:number,t:number):Vec3=>[x,r*Math.sin(t),-d+r*Math.cos(t)];
    const left=center-.14,right=center+.14;
    add('outer',[p(left,a),p(left,b),p(right,b),p(right,a)],gold);
    for(const [x,reverse] of [[left,true],[right,false]] as const){
      const points:Vec3[]=[[x,0,-d],p(x,a),p(x,b)];
      if(reverse)points.reverse();
      add('outer',points,[[.50,.30],[.48,.50],[.52,.50]]);
    }
  }
  // Upright painted mound: gems rise above the bed instead of being flattened
  // onto a horizontal lid-sized photograph. Small sections sort behind the lid.
  for(let row=0;row<3;row++)for(let col=0;col<8;col++){
    const u0=col/8,u1=(col+1)/8,v0=row/3,v1=(row+1)/3;
    const x0=-1.1+2.2*u0,x1=-1.1+2.2*u1,y0=.51-.64*v0,y1=.51-.64*v1;
    add('pile',[[x0,y0,.13],[x1,y0,.13],[x1,y1,.13],[x0,y1,.13]],[[u0,v0],[u1,v0],[u1,v1],[u0,v1]]);
  }
  // Curved roof: convex exterior and concave lining use identical ring samples.
  const lidRing = (i: number, inner = false): [number, number] => {
    const a = Math.PI * i / strips;
    return [(c - (inner ? thick : 0)) * Math.sin(a), -(d-(inner?thick:0)) * Math.cos(a)];
  };
  for (let i = 0; i < strips; i++) {
    const [y0,z0] = lidRing(i), [y1,z1] = lidRing(i+1), [iy0,iz0] = lidRing(i,true), [iy1,iz1] = lidRing(i+1,true);
    const v0 = i/strips, v1=(i+1)/strips;
    for(let col=0;col<12;col++){
      const u0=col/12,u1=(col+1)/12,x0=-w+2*w*u0,x1=-w+2*w*u1,ix0=-(w-thick)+2*(w-thick)*u0,ix1=-(w-thick)+2*(w-thick)*u1;
      add('outer', [[x0,y0,z0],[x1,y0,z0],[x1,y1,z1],[x0,y1,z1]], [[u0,v0],[u1,v0],[u1,v1],[u0,v1]], true);
      add('inner', [[ix1,iy0,iz0],[ix0,iy0,iz0],[ix0,iy1,iz1],[ix1,iy1,iz1]], [[u1,v0],[u0,v0],[u0,v1],[u1,v1]], true);
    }
  }
  // D-shaped ends have both outer and inner faces and a genuine thickness.
  for (const side of [-1,1]) for (const inside of [false,true]) {
    const x=side*(w-(inside?thick:0)), radius=c-(inside?thick:0), capDepth=d-(inside?thick:0);
    for (let i=0;i<strips;i++) {
      const [y0,z0]=lidRing(i,inside),[y1,z1]=lidRing(i+1,inside);
      const points: Vec3[]=[[x,0,0],[x,y0,z0],[x,y1,z1]];
      const uv: Vec2[]=[[.5,1],[(z0+capDepth)/(2*capDepth),1-y0/radius],[(z1+capDepth)/(2*capDepth),1-y1/radius]];
      if ((side>0)!==inside) { points.reverse(); uv.reverse(); }
      // The interior is continuous wooden lining. Reusing the exterior endcap
      // here painted a second, giant gold arch inside the curved lid.
      add(inside ? 'inner' : 'cap',points,uv,true);
    }
  }
  // Close the entire underside of the shell. A thick lower lip joins the outer
  // barrel and both solid end caps to the smaller concave lining; there are no
  // internal annular faces crossing the cap volume.
  const shellInner:Vec3[]=[[-w+thick,0,-d+thick],[w-thick,0,-d+thick],[w-thick,0,d-thick],[-w+thick,0,d-thick]];
  const shellLower:Vec3[]=ring.map(([x,,z])=>[x,-.028,z]);
  for(let i=0;i<4;i++){
    const j=(i+1)%4;
    add('outer',[ring[j],ring[i],shellLower[i],shellLower[j]],gold,true);
    add('outer',[shellLower[j],shellLower[i],shellInner[i],shellInner[j]],gold,true);
  }
  return faces;
}
export function projectChestPoint([x,y,z]: Vec3, yaw = CHEST_YAW): Vec3 {
  const pitch = .30, across=x*Math.cos(yaw)-z*Math.sin(yaw), depth=x*Math.sin(yaw)+z*Math.cos(yaw);
  return [across, -y*Math.cos(pitch)+depth*Math.sin(pitch), y*Math.sin(pitch)+depth*Math.cos(pitch)];
}
export function chestLidAngle(seconds: number, reduced = false): number {
  if (reduced) return 108;
  const u=Math.max(0,Math.min(1,(seconds-.24)/1.12));
  // Smootherstep has zero velocity and acceleration at either end.
  const s=u*u*u*(u*(u*6-15)+10);
  return 108*s;
}
type PaintSource = CanvasImageSource & { width: number; height: number };
/** Source triangle -> projected triangle, keeping the painted face undistorted. */
function triangle(ctx: CanvasRenderingContext2D, img: PaintSource, dst: Vec2[], uv: Vec2[]) {
  const s=uv.map(([u,v])=>[u*(img.width-1),v*(img.height-1)]);
  const [p,q,r]=s, [a,b,c]=dst;
  const det=p[0]*(q[1]-r[1])+q[0]*(r[1]-p[1])+r[0]*(p[1]-q[1]);
  if (Math.abs(det)<1e-6) return;
  const tx=(n:number)=>(a[n]*(q[1]-r[1])+b[n]*(r[1]-p[1])+c[n]*(p[1]-q[1]))/det;
  const ty=(n:number)=>(a[n]*(r[0]-q[0])+b[n]*(p[0]-r[0])+c[n]*(q[0]-p[0]))/det;
  const t0=(n:number)=>(a[n]*(q[0]*r[1]-r[0]*q[1])+b[n]*(r[0]*p[1]-p[0]*r[1])+c[n]*(p[0]*q[1]-q[0]*p[1]))/det;
  ctx.save();
  ctx.beginPath();
  // Half a physical pixel of overlap eliminates antialias pinholes between
  // welded triangles. It cannot produce a double outline at outer edges.
  const mx=(a[0]+b[0]+c[0])/3,my=(a[1]+b[1]+c[1])/3;
  for(let i=0;i<3;i++){const dx=dst[i][0]-mx,dy=dst[i][1]-my,k=1+.35/Math.max(1,Math.hypot(dx,dy));if(i===0)ctx.moveTo(mx+dx*k,my+dy*k);else ctx.lineTo(mx+dx*k,my+dy*k);}
  ctx.closePath();ctx.clip();ctx.transform(tx(0),tx(1),ty(0),ty(1),t0(0),t0(1));ctx.drawImage(img,0,0);ctx.restore();
}
export function drawGuardianChest(ctx: CanvasRenderingContext2D, textures: Record<ChestMaterial,PaintSource>, width:number, height:number, angle:number, yaw=CHEST_YAW) {
  const scale=Math.min(width/CHEST_CAMERA.spanX,height/CHEST_CAMERA.spanY), origin:Vec2=[width*.5-CHEST_CAMERA.centerX*scale,height*.5-CHEST_CAMERA.centerY*scale];
  const faces=guardianChestFaces(angle).map(face=>{
    const projected=face.points.map(p=>projectChestPoint(p,yaw));
    const points:Vec2[]=projected.map(([x,y])=>[origin[0]+x*scale,origin[1]+y*scale]);
    const [a,b,c]=points, area=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    return {face,points,area,depth:projected.reduce((sum,p)=>sum+p[2],0)/projected.length};
  }).filter(f=>f.area>.002).sort((a,b)=>a.depth-b.depth);
  ctx.clearRect(0,0,width,height);
  for(const {face,points} of faces)for(let i=1;i<points.length-1;i++)triangle(ctx,textures[face.material],[points[0],points[i],points[i+1]],[face.uv[0],face.uv[i],face.uv[i+1]]);
}
