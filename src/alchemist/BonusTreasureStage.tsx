import { memo } from 'react';
import type { CSSProperties } from 'react';
import { assetUrl } from './assets';
import { CABIN_BONUS_ART } from './cabin-bonus-assets';
import './bonus-treasure-v39.css';

/** Complete open chests move as rigid props. Their curved lids and side caps
 * belong to the same painting; no flat CSS flap pretends to be an opening lid. */
export const BonusTreasureStage = memo(function BonusTreasureStage({ className = '', coins = true, chest = CABIN_BONUS_ART.chest }: { className?: string; coins?: boolean; chest?: string }) {
  return <div className={`treasure-props ${className}`} aria-hidden="true">
    {[0, 1].map(side => <div className={`treasure-props__chest treasure-props__chest--${side}`} key={side}>
      <div className="treasure-props__chest-bob"><img src={chest} alt="" draggable={false} /></div>
    </div>)}
    <img className="treasure-props__gold" src={CABIN_BONUS_ART.treasure} alt="" draggable={false} />
    {coins && <div className="treasure-props__coins">
      {Array.from({ length: 8 }, (_, index) => <span key={index} style={{
        '--coin-x': `${index % 2 ? 74 + index % 3 * 4 : 17 + index % 3 * 4}%`,
        '--coin-drift': `${(index % 2 ? -1 : 1) * (9 + index % 3 * 8)}px`,
        '--coin-rise': `${-48 - index % 3 * 16}px`,
        '--coin-cycle': `${3.8 + index % 3 * .35}s`,
        '--coin-phase': `${-.4 - index * .54}s`,
        '--coin-turn': `${index % 2 ? -180 : 180}deg`,
      } as CSSProperties}><img src={assetUrl(`alchemist/effects/parts/${index % 4 === 0 ? 'shard' : 'coin'}.png`)} alt="" draggable={false} /></span>)}
    </div>}
    {coins && <div className="cabin-bonus__treasure-sparks">
      {Array.from({ length: 4 }, (_, index) => <img key={index} src={assetUrl('alchemist/ui/icons/spark.webp')} alt="" draggable={false} style={{ '--glint-index': index } as CSSProperties} />)}
    </div>}
  </div>;
});
