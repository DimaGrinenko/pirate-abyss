import { useEffect, useState } from 'react';
import { useAlchemistSpine } from './spineEffectsRuntime';
import { BonusSharkWindow } from './BonusSharkWindow';
import { FishVolumeWindow } from './FishVolumeWindow';
import './background-scene.css';
import './environment-v3.css';

function useDocumentVisible() {
  const [allowed, setAllowed] = useState(() => !document.hidden);
  useEffect(() => {
    const update = () => setAllowed(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => {
      document.removeEventListener('visibilitychange', update);
    };
  }, []);
  return allowed;
}

/** The overlay shares the painted background's cover crop at every viewport. */
export function BackgroundScene({ animated = true, timeScale = 1, bonus = false, reducedMotion = false }: { animated?: boolean; timeScale?: number; bonus?: boolean; reducedMotion?: boolean }) {
  const motionAllowed = useDocumentVisible();
  const moving = animated && motionAllowed;
  const [volumeReady, setVolumeReady] = useState(false);
  const { canvasRef, ready, failed } = useAlchemistSpine({ id: 'environment', animation: 'idle', animated: moving, loop: true, width: 1672, height: 941, timeScale, environmentBonus: bonus, environmentReduced: reducedMotion, environmentVolume: volumeReady });
  return <div className="background-scene" data-environment-motion={moving ? 'running' : 'paused'} aria-hidden="true"><canvas ref={canvasRef} data-spine-background={ready ? 'ready' : 'loading'} data-spine-error={failed || undefined} /><FishVolumeWindow animated={moving} bonus={bonus} reducedMotion={reducedMotion} timeScale={timeScale} onReady={setVolumeReady} /><BonusSharkWindow active={bonus} animated={moving} reducedMotion={reducedMotion} /></div>;
}
