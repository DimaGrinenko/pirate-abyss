import { symbolLabel, wildLabel } from './locale';
import { memo, useEffect, useState } from 'react';
import { useAlchemistSpine } from './spineEffectsRuntime';
import { symbolImageUrl } from './symbol-assets';
import './symbol-art.css';


export type ChemicalSymbolProps = {
  id: string;
  multiplier?: number;
  wildType?: number | string;
  animated?: boolean;
  active?: boolean;
  winning?: boolean;
  animation?: 'idle' | 'land' | 'win';
  landKey?: number | string;
  timeScale?: number;
  onLandComplete?: () => void;
};
const symbolIds = ['elixir', 'retort', 'crystal', 'flask', 'atom', 'mercury', 'sulfur', 'copper', 'iron', 'lead', 'scatter', 'wild'];
const wildNames = ['blue', 'red', 'gold', 'green'];
const wildColors: Record<string, string> = { blue: '#a1edff', red: '#ffad85', gold: '#ffe2a2', green: '#caff87' };
function ChemicalSymbolView({ id, multiplier, wildType, animated = true, active = true, winning = false, animation, landKey, timeScale = 1, onLandComplete }: ChemicalSymbolProps) {
  const type = typeof wildType === 'number' ? wildNames[Math.max(0, Math.min(3, wildType - 1))] : (wildType || 'blue');
  const assetId = id === 'wild' ? `wild-${wildNames.includes(type) ? type : 'blue'}` : (symbolIds.includes(id) ? id : 'flask');
  const [landedKey, setLandedKey] = useState<number | string>();
  const pendingLand = landKey !== undefined && landKey !== landedKey;
  const selectedAnimation = pendingLand ? 'land' : winning ? 'win' : (animation || 'idle');
  const { canvasRef, ready, failed } = useAlchemistSpine({ id: assetId, animation: selectedAnimation, animated, active, timeScale,
    animationKey: landKey, loop: selectedAnimation !== 'land', nextAnimation: selectedAnimation === 'land' ? 'idle' : undefined,
    onComplete: () => { if (selectedAnimation === 'land') { setLandedKey(landKey); onLandComplete?.(); } },
  });
  useEffect(() => {
    // A decoded fallback is a completed static landing, not an infinite spin.
    if (failed && pendingLand) { setLandedKey(landKey); onLandComplete?.(); }
  }, [failed, pendingLand, landKey, onLandComplete]);
  const label = `${symbolLabel(id)}${id === 'wild' ? ` · ${wildLabel(type)}` : ''}${multiplier ? ` ×${multiplier}` : ''}`;
  const tier = id === 'wild' || id === 'scatter' ? 'special' : ['mercury', 'sulfur', 'copper', 'iron', 'lead'].includes(id) ? 'low' : 'high';
  return <div className={`chemical-symbol ${id === 'wild' ? 'chemical-symbol--wild' : ''} ${winning ? 'chemical-symbol--winning' : ''}`}
    role="img" aria-label={label} data-symbol={id} data-symbol-tier={tier} data-wild-type={id === 'wild' ? type : undefined}
    style={{ position: 'relative', width: '100%', height: '100%', minWidth: 0, minHeight: 0, pointerEvents: 'none' }}>
    {!ready && <img className="chemical-symbol__fallback" alt="" src={symbolImageUrl(assetId)} draggable={false} />}
    <canvas ref={canvasRef} aria-hidden="true" data-spine={assetId} data-spine-ready={ready} data-spine-animation={selectedAnimation}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
    {id === 'wild' && <span className="chemical-symbol__multiplier" style={{ color: wildColors[type] || wildColors.blue }}>{multiplier ? `${multiplier}×` : 'WILD'}</span>}
    {id === 'scatter' && <span className="chemical-symbol__scatter-label">SCATTER</span>}
  </div>;
}
export const ChemicalSymbol = memo(ChemicalSymbolView);
export default ChemicalSymbol;
