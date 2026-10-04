/** Source-pixel geometry of the large left window in the 1672×941 cabin.
 * The bitmap and Spine overlay share this cover camera; no reel coordinates.
 */
export function portholeOrigin(width:number,height:number) {
  const scale=Math.max(width/1672,height/941);
  const offsetX=height>width ? 0 : (width-1672*scale)/2;
  const offsetY=(height-941*scale)/2;
  return {x:(offsetX-30*scale)/width,y:(offsetY+110*scale)/height,width:440*scale/width,height:580*scale/height};
}
