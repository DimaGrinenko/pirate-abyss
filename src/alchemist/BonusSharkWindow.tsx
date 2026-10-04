import { useEffect, useRef } from 'react';
import { assetUrl } from './assets';
import { CABIN_WINDOW_REGISTRATION_FILE } from './environment-assets';
import { DemandFrameLoop } from './demand-frame-loop';
import { createSharkPainter, sharkNoseContact } from './shark-renderer-v41';
import type { SharkPose } from './shark-renderer-v41';
import { SharkPainterLease } from './shark-painter-lease';
import { decodedImage } from './asset-readiness';
import { SHARK_PATROLS as PATROLS, TurningSharkSchool, sharkGlassCharge } from './shark-school-motion-v41';
import { SHARK_TURN_ATLAS } from './shark-frames-v41';
import { occludeSharkWater, sharkWindowBuffer } from './shark-window-mask-v39';
import './bonus-shark-window.css';

type Point = [number, number];
type Registration = { world: { width: number; height: number }; polygons: { main: Point[] }; foreground: { x: number; y: number; width: number; height: number } };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const t = clamp(v); return t ** 3 * (t * (t * 6 - 15) + 10); };
const mix = (a: number, b: number, v: number) => a + (b - a) * v;
const emptyPose = (): SharkPose => ({ x: 0, y: 0, width: 0, yaw: 0, pitch: 0, angle: 0, alpha: 0 });
let assets: Promise<{ shark: HTMLImageElement; caustic: HTMLImageElement; foreground: HTMLImageElement; bubble: HTMLImageElement; registration: Registration; crack: HTMLImageElement }> | undefined;
function image(path: string) {
  return decodedImage(assetUrl(path));
}
function loadAssets() {
  return assets ??= Promise.all([
    image(`alchemist/environment/${SHARK_TURN_ATLAS}`), image('alchemist/effects/parts/caustic.png'),
    image('alchemist/environment/window-foreground-v13.png'), image('alchemist/effects/parts/bubble.png'),
    fetch(assetUrl(`alchemist/environment/${CABIN_WINDOW_REGISTRATION_FILE}`), { signal: AbortSignal.timeout(15000) }).then(r => { if (!r.ok) throw new Error('Window registration unavailable'); return r.json() as Promise<Registration>; }),
    image('alchemist/effects/parts/glass-crack-v24.webp'),
  ]).then(([shark, caustic, foreground, bubble, registration, crack]) => ({ shark, caustic, foreground, bubble, registration, crack })).catch(error => { assets = undefined; throw error; });
}

// Startup shares the exact promise used by this scene; it does not own a renderer.
// eslint-disable-next-line react-refresh/only-export-components
export async function preloadBonusSharkWindow() { await loadAssets(); }

/** Whole-frame authored snout; the fracture stays at its first contact point. */
const noseContact = sharkNoseContact;

/** A directional cartoon aquarium sharing the native 1672x941 cover camera. All water effects
 * are clipped first, then foreground alpha cuts out the current cabin props. */
export function BonusSharkWindow({ active, animated, reducedMotion }: { active: boolean; animated: boolean; reducedMotion: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ active, animated, reducedMotion }); props.current = { active, animated, reducedMotion };
  const playback = useRef<DemandFrameLoop | null>(null), inWater = useRef(false);
  const quake = useRef<Animation | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current, host = canvas?.parentElement;
    if (!canvas || !host) return;
    canvas.width = canvas.height = 1; canvas.style.visibility = 'hidden';
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    let disposed = false, observer: ResizeObserver | undefined, visible: (() => void) | undefined;
    let time = 0, attackTime = 0, phaseTime = 0, target = false, phase: 'off' | 'entering' | 'patrol' | 'leaving' = 'off';
    let layoutWidth = Math.max(1, host.clientWidth), layoutHeight = Math.max(1, host.clientHeight);
    let compact = false, meanCost = 0, pressure = 0, recovery = 0;
    const lastPoses = PATROLS.map(emptyPose), school = new TurningSharkSchool();
    let lastImpact = -1;
    let fracture: { point: Point; born: number; cycle: number } | null = null;
    let sharkPainter: ReturnType<typeof createSharkPainter> | undefined;
    let painterLease: SharkPainterLease<ReturnType<typeof createSharkPainter>> | undefined;
    let prepared = false, shown = false, reportedKind = '', reportedPhase = '', reportedBacking = 0;
    const reportPainter = () => {
      if (!sharkPainter) return;
      const kind = sharkPainter.kind, backing = sharkPainter.backingSize;
      if (kind !== reportedKind) { canvas.dataset.sharkRenderer = kind; reportedKind = kind; }
      if (backing !== reportedBacking) { canvas.dataset.sharkBacking = `${backing}x${backing}`; reportedBacking = backing; }
    };
    const cancelQuake = () => { quake.current?.cancel(); quake.current = null; };
    const shakeCabin = (cycle: number, point: Point, scale: number, world: Registration['world']) => {
      const shell = canvas.closest<HTMLElement>('.game-shell');
      if (!shell || document.hidden || !props.current.animated || props.current.reducedMotion) return;
      cancelQuake();
      // Individual translate preserves any unrelated transform on the shell.
      // Every vector stays below 5px and the final frame returns exactly home.
      quake.current = shell.animate([
        { translate: '0px 0px', offset: 0 }, { translate: '-4.2px 2px', offset: .08 },
        { translate: '3.8px -1.7px', offset: .17 }, { translate: '-3.2px -1.2px', offset: .27 },
        { translate: '2.6px 1.4px', offset: .39 }, { translate: '-1.8px .8px', offset: .53 },
        { translate: '1.1px -.6px', offset: .68 }, { translate: '-.45px .2px', offset: .84 },
        { translate: '0px 0px', offset: 1 },
      ], { duration: 650, easing: 'ease-out', fill: 'none' });
      // The canvas now covers only the window; impact coordinates still use
      // the full cabin camera, including the shell's current quake transform.
      const bounds = host.getBoundingClientRect();
      const x = clamp((bounds.left + (bounds.width - world.width * scale) / 2 + point[0] * scale) / Math.max(1, window.innerWidth));
      const y = clamp((bounds.top + (bounds.height - world.height * scale) / 2 + point[1] * scale) / Math.max(1, window.innerHeight));
      shell.dispatchEvent(new CustomEvent('pirate-shark-impact', { bubbles: true, detail: { cycle, x, y } }));
    };
    void loadAssets().then(art => {
      if (disposed) return;
      painterLease = new SharkPainterLease(() => {
        prepared = false;
        return createSharkPainter(art.shark);
      });
      const polygon = art.registration.polygons.main, world = art.registration.world;
      const windowPath = new Path2D();
      polygon.forEach(([x, y], i) => i ? windowPath.lineTo(x, y) : windowPath.moveTo(x, y)); windowPath.closePath();
      let frameWidth = 0, frameHeight = 0, frameDpr = 0, pixelWidth = 1, pixelHeight = 1, originX = 0, originY = 0;
      const draw = (delta: number) => {
        const started = performance.now();
        const state = props.current;
        if(target!==state.active){target=state.active;phaseTime=0;attackTime=0;lastImpact=-1;fracture=null;if(!target)cancelQuake();}
        const step=state.animated&&!state.reducedMotion?delta:0;
        time+=step;phaseTime+=step;if(target)attackTime+=step;
        const poses=school.update(step,state.active,state.reducedMotion,lastPoses);
        phase=school.phase;
        if(state.reducedMotion){time=4;fracture=null;}
        inWater.current = phase !== 'off';
        if (phase !== reportedPhase) { canvas.dataset.sharkWindow = phase; reportedPhase = phase; }
        // active becomes true under the already-covered bonus transition.
        // Prepare on this held zero-delta paint, before the existing approach;
        // neither the normal cabin nor welcome screen allocates a shark surface.
        sharkPainter = painterLease!.update(inWater.current, state.reducedMotion);
        if (phase === 'off') {
          if (shown) { canvas.style.visibility = 'hidden'; shown = false; }
          if (canvas.width !== 1 || canvas.height !== 1) canvas.width = canvas.height = 1;
          prepared = false;
          canvas.dataset.sharkRenderer = 'inactive'; canvas.dataset.sharkBacking = '1x1';
          reportedKind = 'inactive'; reportedBacking = 1;
          playback.current?.setPlayback(false, !document.hidden); return;
        }
        const width = layoutWidth, height = layoutHeight, dpr = Math.min(devicePixelRatio || 1, compact ? 1 : 1.25);
        const scale = Math.min(width / world.width, height / world.height), pixelsPerWorld = dpr * scale;
        if (frameWidth !== width || frameHeight !== height || frameDpr !== dpr) {
          frameWidth = width; frameHeight = height; frameDpr = dpr; prepared = false;
          const buffer=sharkWindowBuffer(width,height,dpr,polygon,world);
          pixelWidth=buffer.width;pixelHeight=buffer.height;originX=buffer.originX;originY=buffer.originY;
          canvas.style.inset='auto';canvas.style.left=`${buffer.x}px`;canvas.style.top=`${buffer.y}px`;
          canvas.style.width = `${pixelWidth / dpr}px`; canvas.style.height = `${pixelHeight / dpr}px`;
        }
        if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
        // Prepare during the 3.6s fish departure hold, before the first shark
        // appears. Preserve the same raster density and original motion clock.
        if (!prepared) { sharkPainter!.prepare(137 * pixelsPerWorld); prepared = true; }
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.setTransform(pixelsPerWorld, 0, 0, pixelsPerWorld, originX, originY);
        ctx.save(); ctx.clip(windowPath);
        // A real approach precedes each contact. The view trembles as one rigid
        // cabin for 650ms, while the exact water mask still occludes every fin.
        const attackCycle = attackTime >= 11 ? Math.floor((attackTime - 11) / 15.25) : -1;
        const attackAge = attackCycle >= 0 ? attackTime - 11 - attackCycle * 15.25 : -1;
        const impactAge = attackAge - 1.65;
        const impact = !state.reducedMotion && phase === 'patrol' && impactAge >= 0 && impactAge < .42;
        const glassX = impact ? Math.sin(impactAge * 105) * Math.exp(-impactAge * 11) * 2.2 / scale : 0;
        const glassY = impact ? Math.sin(impactAge * 85) * Math.exp(-impactAge * 12) * .8 / scale : 0;
        ctx.save(); ctx.translate(glassX, glassY);
        const strength = phase === 'leaving' ? 1 - ease(phaseTime / 2.6) : state.reducedMotion ? .6 : ease(phaseTime / 2);
        ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = strength * .19;
        ctx.drawImage(art.caustic, -35 + Math.sin(time * .42) * 23, 110 + Math.cos(time * .37) * 17, 450, 365);
        ctx.globalAlpha = strength * .12; ctx.save(); ctx.translate(192, 485); ctx.rotate(-.32 + Math.sin(time * .28) * .09); ctx.drawImage(art.caustic, -240, -165, 480, 300); ctx.restore();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        for (let index = PATROLS.length - 1; index >= 0; index--) {
          const p = lastPoses[index];Object.assign(p,poses[index]);
          if(index===0&&!state.reducedMotion&&phase==='patrol'&&attackAge>=0&&attackAge<3.8){
            sharkGlassCharge(p,attackAge);
          }
          if (index === 0 && impact && attackCycle !== lastImpact) {
            lastImpact = attackCycle;
            const point = noseContact(p);
            fracture = { point, born: time, cycle: attackCycle };
            shakeCabin(attackCycle, point, scale, art.registration.world);
          }
          if (p.alpha>0&&p.x+p.width*.7>-10&&p.x-p.width*.7<400) sharkPainter!.paint(ctx, p, time + index * 1.91, state.reducedMotion);
        }
        if (impact) { const p = lastPoses[0]; ctx.globalAlpha = .42 * (1 - impactAge / .42); ctx.drawImage(art.bubble, p.x - 23, p.y - 23, 46, 46); }
        if (fracture) {
          const age = time - fracture.born;
          if (age >= 4) fracture = null;
          else {
            const size = 154 * mix(.87, 1, ease(age / .1));
            ctx.save(); ctx.globalAlpha = .8 * (1 - ease((age - 3) / 1));
            ctx.translate(fracture.point[0], fracture.point[1]); ctx.rotate((fracture.cycle % 3 - 1) * .085);
            // Authored impact centre is 50%/52%; original alpha is preserved.
            ctx.drawImage(art.crack, -size * .5, -size * .52, size, size); ctx.restore();
          }
        }
        ctx.restore(); ctx.globalAlpha = 1;
        const foreground = art.registration.foreground;
        occludeSharkWater(ctx, art.foreground, foreground);
        ctx.restore();
        if (!shown) { canvas.style.visibility = 'visible'; shown = true; }
        reportPainter();
        // Only decorative canvas resolution changes under sustained load.
        // Time, shark count, contact events and all reel/result logic stay intact.
        meanCost = meanCost * .92 + (performance.now() - started) * .08;
        const busy = meanCost > 5 || delta > .026;
        pressure = busy ? pressure + delta : Math.max(0, pressure - delta * .5);
        recovery = !busy && meanCost < 2.5 ? recovery + delta : 0;
        if (!compact && pressure > .65) { compact = true; recovery = 0; }
        else if (compact && recovery > 10) { compact = false; pressure = 0; }
      };
      const loop = new DemandFrameLoop({ request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) }, draw);
      playback.current = loop;
      visible = () => { if (document.hidden) cancelQuake(); loop.setPlayback(props.current.animated && !props.current.reducedMotion && (props.current.active || inWater.current), !document.hidden); };
      document.addEventListener('visibilitychange', visible);
      observer = new ResizeObserver(entries => { const rect = entries[0]?.contentRect; if (rect) { layoutWidth = Math.max(1, rect.width); layoutHeight = Math.max(1, rect.height); } loop.invalidate(); }); observer.observe(host);
      visible(); loop.invalidate();
    }).catch(() => { if (!disposed) canvas.dataset.sharkWindow = 'unavailable'; });
    return () => { disposed = true; cancelQuake(); painterLease?.release(); observer?.disconnect(); if (visible) document.removeEventListener('visibilitychange', visible); playback.current?.dispose(); playback.current = null; };
  }, []);
  useEffect(() => {
    if (!animated || reducedMotion || !active) { quake.current?.cancel(); quake.current = null; }
    playback.current?.setPlayback(animated && !reducedMotion && (active || inWater.current), !document.hidden);
    playback.current?.invalidate();
  }, [active, animated, reducedMotion]);
  return <canvas ref={canvasRef} className="bonus-shark-window" aria-hidden="true" data-shark-window="off" data-shark-art="whole-body-turn-v40" />;
}

