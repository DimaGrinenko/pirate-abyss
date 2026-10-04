/** Whole right-facing raster animals. No separate frontal-head material. */
export const MARINE_SIDE_ATLAS = 'marine-side-v38.webp';
export const SHARK_SIDE_ART = 'shark-side-v38.webp';
export const MARINE_SIDE_SPECIES = ['fishOrange','fishBlue','clownfish','blue-tang','butterflyfish','angelfish','mint-fish','pufferfish'] as const;
// Region aspect ratios match the existing route dimensions. Packing uses
// contain (not stretch), so the authored round face keeps its proportions.
export const MARINE_SIDE_REGIONS: Record<string, readonly [number,number,number,number]> = {
  fishOrange:[0,0,512,459],fishBlue:[512,0,512,444],clownfish:[1024,0,512,386],'blue-tang':[1536,0,512,367],
  butterflyfish:[0,512,512,428],angelfish:[512,512,512,504],'mint-fish':[1024,512,512,424],pufferfish:[1536,512,512,400],
};

/** Only the tail quarter bends. The face's complete UV region is rigid. */
export function sideFishGrid(columns=16,rows=8) {
  const vertices:number[]=[],indices:number[]=[];
  for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++)vertices.push(x/columns-.5,y/rows-.5,0,x/columns,y/rows,0,0,1);
  for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){
    const a=y*(columns+1)+x,b=a+1,c=a+columns+1,d=c+1;
    indices.push(a,b,c,b,d,c);
  }
  return{vertices:new Float32Array(vertices),indices:new Uint16Array(indices)};
}
