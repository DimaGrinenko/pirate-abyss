import { useEffect, useRef, useState } from 'react';
import { Application } from '@pixi/app';
import { Assets } from '@pixi/assets';
import { Spine } from '@esotericsoftware/spine-pixi-v7';
import type { SkeletonData } from '@esotericsoftware/spine-core';

import { assetUrl } from './assets';

export interface BonusMedallionProps {
  animated?: boolean;
  className?: string;
}
const BASE = assetUrl('alchemist/bonus/');
let dataPromise: Promise<SkeletonData> | undefined;
function loadMedallion(): Promise<SkeletonData> {
  if (!dataPromise) {
    dataPromise = (async () => {
      await Assets.load([
        { alias: 'alchemist-medallion-data', src: `${BASE}medallion.json` },
        { alias: 'alchemist-medallion-atlas', src: `${BASE}medallion.atlas` },
      ]);
      const temporary = Spine.from({ skeleton: 'alchemist-medallion-data', atlas: 'alchemist-medallion-atlas', autoUpdate: false });
      const data = temporary.skeleton.data;
      temporary.destroy({ children: true, texture: false, baseTexture: false });
      return data;
    })().catch((error: unknown) => { dataPromise = undefined; throw error; });
  }
  return dataPromise;
}
// Startup and the component share the same parsed atlas promise.
// eslint-disable-next-line react-refresh/only-export-components
export async function preloadBonusMedallion(): Promise<void> { await loadMedallion(); }
function play(spine: Spine, animated: boolean) {
  spine.state.clearTracks();
  spine.skeleton.setToSetupPose();
  spine.state.timeScale = animated ? 1 : 0;
  if (animated) {
    spine.state.setAnimation(0, 'intro', false);
    spine.state.addAnimation(0, 'idle', true, 0);
  } else {
    const track = spine.state.setAnimation(0, 'idle', true);
    track.trackTime = .7;
  }
  spine.update(0);
}

/** Generated raster brass, glass and liquids, animated by a real Spine skeleton. */
export function BonusMedallion({ animated = true, className }: BonusMedallionProps) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Spine | null>(null);
  const latest = useRef(animated);
  const [ready, setReady] = useState(false);
  latest.current = animated;
  useEffect(() => {
    let disposed = false;
    let app: Application | undefined;
    let observer: ResizeObserver | undefined;
    let frame = 0;
    let previous = 0;
    const element = host.current;
    if (!element) return;
    const mount = async () => {
      const skeletonData = await loadMedallion();
      if (disposed) return;
      app = new Application({ width: 1, height: 1, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true, backgroundAlpha: 0, antialias: true, autoStart: false });
      const canvas = app.view as HTMLCanvasElement;
      canvas.style.cssText = 'display:block;width:100%;height:100%;';
      canvas.setAttribute('aria-hidden', 'true');
      element.append(canvas);
      const spine = new Spine({ skeletonData, autoUpdate: false });
      spine.state.data.defaultMix = .18;
      instance.current = spine;
      app.stage.addChild(spine);
      play(spine, latest.current);
      const resize = () => {
        if (disposed || !app) return;
        const width = Math.max(1, element.clientWidth), height = Math.max(1, element.clientHeight);
        app.renderer.resize(width, height);
        spine.scale.set(Math.min(width, height) / 360);
        spine.position.set(width / 2, height / 2);
        app.renderer.render(app.stage);
      };
      observer = new ResizeObserver(resize);
      observer.observe(element);
      resize();
      setReady(true);
      const animate = (now: number) => {
        if (disposed || !app) return;
        const delta = previous ? Math.min((now - previous) / 1000, .05) : 0;
        previous = now;
        if (!document.hidden) {
          if (latest.current) spine.update(delta);
          app.renderer.render(app.stage);
        }
        frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    };
    void mount().catch((error: unknown) => console.error('The bonus medallion could not initialize its Spine renderer.', error));
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      instance.current = null;
      app?.destroy(true, { children: true, texture: false, baseTexture: false });
    };
  }, []);
  useEffect(() => { if (instance.current) play(instance.current, animated); }, [animated]);
  return <div className={className} aria-hidden="true" data-spine-medallion={ready ? 'ready' : 'loading'} style={{ position: 'relative', width: '100%', height: '100%', pointerEvents: 'none' }}>
    <div ref={host} style={{ position: 'absolute', inset: 0 }} />
  </div>;
}
export default BonusMedallion;
