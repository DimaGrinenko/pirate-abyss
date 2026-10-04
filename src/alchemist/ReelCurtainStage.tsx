import { createContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { HTMLAttributes } from 'react';
import { SharedCurtainStage } from './shared-curtain-stage';
import './shared-curtain-stage.css';

export const ReelCurtainStageContext = createContext<SharedCurtainStage | null>(null);

/** Explicit board owner: isolated previews without this provider remain local. */
export function ReelCurtainStage({ children, ...props }: HTMLAttributes<HTMLDivElement>) {
  const root = useRef<HTMLDivElement>(null), surface = useRef<HTMLDivElement>(null);
  const stage = useMemo(() => new SharedCurtainStage(), []);
  useLayoutEffect(() => {
    stage.attach(root.current!, surface.current!);
    return () => stage.dispose();
  }, [stage]);
  return <div {...props} ref={root} data-shared-curtain-stage="true">
    <ReelCurtainStageContext.Provider value={stage}>{children}</ReelCurtainStageContext.Provider>
    <div ref={surface} className="reel-curtain-stage__surface" aria-hidden="true" />
  </div>;
}
