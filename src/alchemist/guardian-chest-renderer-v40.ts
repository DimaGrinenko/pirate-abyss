import { CHEST_MATERIALS, CHEST_YAW, CHEST_CAMERA, guardianChestFaces, projectChestPoint, type ChestMaterial, type ChestFace } from './guardian-chest-v40';

export type GuardianChestTextures = Record<ChestMaterial, TexImageSource>;
export type GuardianChestBatch = { material: ChestMaterial; vertices: Float32Array };
export const CHEST_VERTEX_FLOATS=6;
/** Broad studio light preserves the painted hues. The mesh winding is inward
 * (its screen-space Y is reflected), so negate the cross-product for normals. */
export function guardianChestFaceLight(face:ChestFace):number {
  if(face.material==='pile'||face.material==='treasure')return 1;
  const [a,b,c]=face.points,ab=b.map((v,i)=>v-a[i]),ac=c.map((v,i)=>v-a[i]);
  const normal=[ab[2]*ac[1]-ab[1]*ac[2],ab[0]*ac[2]-ab[2]*ac[0],ab[1]*ac[0]-ab[0]*ac[1]];
  const length=Math.hypot(...normal);
  if(length<1e-8)return 1;
  const diffuse=Math.max(0,(-.35*normal[0]+.82*normal[1]+.45*normal[2])/length);
  return .94+.18*diffuse;
}
// Interleaved camera-space x/y/depth, raster UV and broad surface lighting.
// No painter depth sorting:
// the GPU interpolates depth per fragment, including the curved lid and pile.
export function guardianChestMesh(angle: number, yaw=CHEST_YAW): GuardianChestBatch[] {
  const grouped=Object.fromEntries(CHEST_MATERIALS.map(material=>[material,[] as number[]])) as Record<ChestMaterial,number[]>;
  for(const face of guardianChestFaces(angle)){
    const projected=face.points.map(p=>projectChestPoint(p,yaw));
    const light=guardianChestFaceLight(face);
    for(let i=1;i<face.points.length-1;i++)for(const index of [0,i,i+1])grouped[face.material].push(...projected[index],...face.uv[index],light);
  }
  return CHEST_MATERIALS.map(material=>({material,vertices:new Float32Array(grouped[material])}));
}

const VERTEX=`
attribute vec3 aPosition;
attribute vec2 aUv;
attribute float aLight;
uniform vec2 uViewport;
uniform float uScale;
varying vec2 vUv;
varying float vLight;
void main(){
  vec2 screen=uViewport*.5+(aPosition.xy-vec2(${CHEST_CAMERA.centerX},${CHEST_CAMERA.centerY}))*uScale;
  gl_Position=vec4(screen.x/uViewport.x*2.-1.,1.-screen.y/uViewport.y*2.,-aPosition.z/5.,1.);
  vUv=aUv;
  vLight=aLight;
}`;
const FRAGMENT=`
precision mediump float;
uniform sampler2D uTexture;
uniform float uTransparent;
varying vec2 vUv;
varying float vLight;
void main(){
  vec4 color=texture2D(uTexture,vUv);
  if(color.a<.01)discard;
  gl_FragColor=vec4(color.rgb*vLight,mix(1.,color.a,uTransparent));
}`;

export type GuardianChestRenderer={ draw:(width:number,height:number,angle:number,yaw?:number)=>boolean; dispose:()=>void };

/** Seven raster material draws. Solid shell writes depth before alpha treasure;
 * the treasure cannot overwrite any nearer piece of the lid or box. */
export function createGuardianChestRenderer(canvas:HTMLCanvasElement,images:GuardianChestTextures):GuardianChestRenderer {
  const gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:false,powerPreference:'low-power'});
  if(!gl||gl.isContextLost())throw Error('Guardian chest WebGL unavailable');
  const shaders:WebGLShader[]=[],buffers:WebGLBuffer[]=[],textures:WebGLTexture[]=[];
  let program:WebGLProgram|null=null,disposed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;
    for(const texture of textures)gl.deleteTexture(texture);
    for(const buffer of buffers)gl.deleteBuffer(buffer);
    for(const shader of shaders)gl.deleteShader(shader);
    if(program)gl.deleteProgram(program);
  };
  try{
    const shader=(type:number,source:string)=>{
      const value=gl.createShader(type);if(!value)throw Error('Guardian shader allocation failed');shaders.push(value);
      gl.shaderSource(value,source);gl.compileShader(value);
      if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw Error('Guardian shader compilation failed');
      return value;
    };
    const vertex=shader(gl.VERTEX_SHADER,VERTEX),fragment=shader(gl.FRAGMENT_SHADER,FRAGMENT);
    program=gl.createProgram();if(!program)throw Error('Guardian program allocation failed');
    gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Guardian shader link failed');
    const position=gl.getAttribLocation(program,'aPosition'),uv=gl.getAttribLocation(program,'aUv'),light=gl.getAttribLocation(program,'aLight');
    const viewport=gl.getUniformLocation(program,'uViewport'),scale=gl.getUniformLocation(program,'uScale'),transparent=gl.getUniformLocation(program,'uTransparent'),textureUniform=gl.getUniformLocation(program,'uTexture');
    if(position<0||uv<0||light<0||!viewport||!scale||!transparent||!textureUniform)throw Error('Guardian shader inputs unavailable');
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
    for(const material of CHEST_MATERIALS){
      const texture=gl.createTexture();if(!texture)throw Error('Guardian texture allocation failed');textures.push(texture);
      gl.bindTexture(gl.TEXTURE_2D,texture);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,images[material]);
      const buffer=gl.createBuffer();if(!buffer)throw Error('Guardian mesh allocation failed');buffers.push(buffer);
    }
    if(gl.getError()!==gl.NO_ERROR)throw Error('Guardian texture upload failed');
    const capacities=new Array<number>(CHEST_MATERIALS.length).fill(0);
    return {
      dispose,
      draw(width,height,angle,yaw=CHEST_YAW){
        if(disposed||gl.isContextLost())return false;
        if(![width,height,angle,yaw].every(Number.isFinite)||width<=0||height<=0)return false;
        width=Math.round(width);height=Math.round(height);
        if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
        gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.depthMask(true);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);
        gl.uniform2f(viewport,width,height);gl.uniform1f(scale,Math.min(width/CHEST_CAMERA.spanX,height/CHEST_CAMERA.spanY));gl.uniform1i(textureUniform,0);gl.activeTexture(gl.TEXTURE0);
        gl.enableVertexAttribArray(position);gl.enableVertexAttribArray(uv);gl.enableVertexAttribArray(light);
        const batches=guardianChestMesh(angle,yaw);
        for(let i=0;i<batches.length;i++){
          const batch=batches[i],alpha=batch.material==='pile';
          if(alpha){
            gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.depthMask(false);
          }
          gl.uniform1f(transparent,alpha?1:0);gl.bindTexture(gl.TEXTURE_2D,textures[i]);gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);
          if(capacities[i]!==batch.vertices.byteLength){gl.bufferData(gl.ARRAY_BUFFER,batch.vertices,gl.DYNAMIC_DRAW);capacities[i]=batch.vertices.byteLength;}
          else gl.bufferSubData(gl.ARRAY_BUFFER,0,batch.vertices);
          gl.vertexAttribPointer(position,3,gl.FLOAT,false,24,0);gl.vertexAttribPointer(uv,2,gl.FLOAT,false,24,12);gl.vertexAttribPointer(light,1,gl.FLOAT,false,24,20);
          gl.drawArrays(gl.TRIANGLES,0,batch.vertices.length/CHEST_VERTEX_FLOATS);
        }
        gl.depthMask(true);gl.disable(gl.BLEND);
        return true;
      },
    };
  }catch(error){dispose();throw error;}
}
