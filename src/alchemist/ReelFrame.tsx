import { useAlchemistSpine } from './spineEffectsRuntime';
import { assetUrl } from './assets';
import './effects.css';
import './frame-polish-v18.css';
export function ReelFrame({ animated = true }: { animated?: boolean }) {
  // The frame's authored idle is a constant zero rotation. Paint it on load and
  // resize; repainting 28 unchanged regions every RAF only uploads the same art.
  // Keep the preference separate from activity so the retained pose is stable.
  const { canvasRef, ready, failed } = useAlchemistSpine({id:'reel-frame', animation:'idle', animated, active:false, width:768, height:644});
  return <div className="alchemist-reel-frame alchemist-reel-frame--fitted" aria-hidden="true" data-frame-animated={animated}><canvas ref={canvasRef} data-spine="reel-frame" data-spine-ready={ready} data-spine-error={failed || undefined}/>
    {[0, 1, 2, 3].map(index => <img key={index} className={`reel-frame-glint reel-frame-glint--${index}`} src={assetUrl('alchemist/effects/parts/spark.png')} alt="" />)}
  </div>;
}
export default ReelFrame;
