type Foreground = {x:number;y:number;width:number;height:number};

/** The legacy cutout supplies occlusion alpha only. Repainting its RGB would
 * put an older cabin's frame and algae over the currently registered cabin. */
export function occludeSharkWater(ctx:CanvasRenderingContext2D,foreground:CanvasImageSource,rect:Foreground) {
  ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='destination-out';
  ctx.drawImage(foreground,rect.x,rect.y,rect.width,rect.height);
  ctx.restore();
}

/** Matches background-size:cover and --world-x shared by scene and backdrop.
 * Used by native registration QA at both the left phone crop and centred PC. */
export function cabinCoverCamera(width:number,height:number,worldX:number) {
  const scale=Math.max(width/1672,height/941);
  return {scale,x:(width-1672*scale)*worldX,y:(height-941*scale)/2};
}

export function sharkWindowBuffer(width:number,height:number,dpr:number,polygon:readonly (readonly number[])[],world:{width:number;height:number}) {
  const scale=Math.min(width/world.width,height/world.height),pixelsPerWorld=dpr*scale;
  const left=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[0])))-2),top=Math.max(0,Math.floor(Math.min(...polygon.map(p=>p[1])))-2);
  const right=Math.min(world.width,Math.ceil(Math.max(...polygon.map(p=>p[0])))+2),bottom=Math.min(world.height,Math.ceil(Math.max(...polygon.map(p=>p[1])))+2);
  const cameraX=(Math.round(width*dpr)-world.width*pixelsPerWorld)/2,cameraY=(Math.round(height*dpr)-world.height*pixelsPerWorld)/2;
  const x=Math.floor(cameraX+left*pixelsPerWorld),y=Math.floor(cameraY+top*pixelsPerWorld);
  return {x:x/dpr,y:y/dpr,width:Math.max(1,Math.ceil(cameraX+right*pixelsPerWorld)-x),height:Math.max(1,Math.ceil(cameraY+bottom*pixelsPerWorld)-y),originX:cameraX-x,originY:cameraY-y,scale,pixelsPerWorld};
}
