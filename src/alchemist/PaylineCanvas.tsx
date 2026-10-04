import { useEffect, useRef } from 'react';
import { assetUrl } from './assets';
import { DemandFrameLoop } from './demand-frame-loop';

const PARTS = ['gold', 'smoke', 'globule', 'seal', 'cinders', 'filament'] as const;
const ASSET_BASE = assetUrl('alchemist/ui/v4/reaction-');
type Part = typeof PARTS[number];
type ReactionArt = Record<Part, HTMLImageElement>;
type Point = { x: number; y: number };
let reactionArt: Promise<ReactionArt> | undefined;

// Resource preloading is also called by startup; no React state is exported.
// eslint-disable-next-line react-refresh/only-export-components
export function preloadPaylineArt() {
  reactionArt ??= Promise.all(PARTS.map(part => new Promise<[Part, HTMLImageElement]>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve([part, img]);
    img.onerror = () => reject(new Error(`Unable to load alchemical reaction sprite: ${part}`));
    img.src = `${ASSET_BASE}${part}.png`;
  }))).then(entries => Object.fromEntries(entries) as ReactionArt).catch(error => {
    reactionArt = undefined;
    throw error;
  });
  return reactionArt;
}

/** The main chain stamps generated alpha sprites. Mini diagrams remain plain rule diagrams. */
export function PaylineCanvas({ positions, label, mini = false, animated = true, active = true }: {
  positions: { col: number; row: number }[]; label: string; mini?: boolean; animated?: boolean; active?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const syncPlayback = useRef<(() => void) | null>(null);
  const coordinates = positions.map(p => `${p.col},${p.row}`).join(';');
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const cells = coordinates.split(';').filter(Boolean).map(p => p.split(',').map(Number));
    let elapsed = 0, disposed = false;
    let art: ReactionArt | undefined;
    const stamp = (img: HTMLImageElement, x: number, y: number, width: number, height: number, angle: number, alpha: number) => {
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(x, y); ctx.rotate(angle);
      ctx.drawImage(img, -width / 2, -height / 2, width, height); ctx.restore();
    };
    const render = (delta: number) => {
      if (disposed) return;
      elapsed += delta * 1000;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
      const points: Point[] = cells.map(([col, row]) => ({ x: (col + .5) * w / 6, y: (row + .5) * h / 5 }));
      if (mini) {
        ctx.strokeStyle = '#89928230'; ctx.lineWidth = .5;
        for (let r = 0; r < 5; r++) { ctx.beginPath(); ctx.moveTo(w / 12, (r + .5) * h / 5); ctx.lineTo(w * 11 / 12, (r + .5) * h / 5); ctx.stroke(); }
        ctx.beginPath();
        points.forEach(({ x, y }, i) => { if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
        ctx.strokeStyle = '#b9bfa1'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
        return;
      }
      if (!art || !points.length) return;
      canvas.dataset.rasterReady = 'true';
      const scale = Math.min(w / 6, h / 5) / 124;
      const segments = points.slice(1).map((to, i) => {
        const from = points[i], dx = to.x - from.x, dy = to.y - from.y;
        return { from, to, length: Math.hypot(dx, dy), angle: Math.atan2(dy, dx) };
      });
      const total = segments.reduce((sum, segment) => sum + segment.length, 0);
      const reveal = animated ? Math.min(1, elapsed / 540) : 1;
      const revealedDistance = total * reveal;
      // A catalyst traverses precisely the evaluated positions. After reveal
      // it circulates through the existing trail without flooding the symbols.
      const headDistance = animated ? (elapsed < 540 ? revealedDistance : ((elapsed - 540) % 1900) / 1900 * total) : total;
      let traversed = 0;
      let head: Point & { angle: number } = { ...points[0], angle: 0 };
      for (const segment of segments) {
        const visible = Math.min(segment.length, Math.max(0, revealedDistance - traversed));
        const spacing = Math.max(4, 9 * scale);
        for (let d = spacing / 2; d < visible; d += spacing) {
          const t = d / segment.length;
          const x = segment.from.x + (segment.to.x - segment.from.x) * t;
          const y = segment.from.y + (segment.to.y - segment.from.y) * t;
          const grain = .78 + .22 * Math.sin((traversed + d) * .31);
          const wave = Math.sin((traversed + d) * .062 - elapsed * .002);
          const centreFade = .42 + .58 * Math.min(1, Math.min(d, segment.length - d) / (24 * scale));
          stamp(art.gold, x, y, 28 * scale, 5.5 * scale, segment.angle, .24 * grain * centreFade);
          if (Math.floor(d / spacing) % 3 === 0) {
            stamp(art.smoke, x - Math.sin(segment.angle) * wave * scale, y + Math.cos(segment.angle) * wave * scale,
              39 * scale, 10 * scale, segment.angle, .075 * centreFade);
            stamp(art.filament, x, y, 24 * scale, 2.3 * scale, segment.angle, .25 * grain * centreFade);
          }
        }
        if (headDistance >= traversed && headDistance <= traversed + segment.length && segment.length) {
          const t = (headDistance - traversed) / segment.length;
          head = { x: segment.from.x + (segment.to.x - segment.from.x) * t,
            y: segment.from.y + (segment.to.y - segment.from.y) * t, angle: segment.angle };
        }
        traversed += segment.length;
      }
      let arrivalDistance = 0;
      points.forEach((point, i) => {
        if (i) arrivalDistance += segments[i - 1].length;
        if (arrivalDistance > revealedDistance + 1) return;
        const arrivalAge = animated ? elapsed - arrivalDistance / Math.max(1, total) * 540 : 1000;
        const pulse = Math.max(0, 1 - arrivalAge / 300);
        const size = (22 + pulse * 5) * scale;
        stamp(art!.seal, point.x, point.y, size, size * art!.seal.height / art!.seal.width, -.13 + i * .17, .35 + pulse * .35);
      });
      if (animated) {
        const pulse = .88 + .12 * Math.sin(elapsed * .012);
        stamp(art.globule, head.x, head.y, 15 * scale * pulse, 24 * scale * pulse, head.angle - Math.PI / 2, .95);
        stamp(art.cinders, head.x - Math.cos(head.angle) * 8 * scale, head.y - Math.sin(head.angle) * 8 * scale,
          19 * scale, 18 * scale, head.angle + .5, .30);
      }
    };
    const loop = new DemandFrameLoop({
      request: callback => requestAnimationFrame(callback), cancel: handle => cancelAnimationFrame(handle),
    }, render);
    const refresh = () => loop.setPlayback(animated && !mini && activeRef.current && Boolean(art), !document.hidden);
    syncPlayback.current = refresh;
    document.addEventListener('visibilitychange', refresh);
    refresh();
    if (mini) loop.invalidate();
    else preloadPaylineArt().then(images => { if (!disposed) { art = images; refresh(); loop.invalidate(); } }).catch(error => {
      if (!disposed) console.error(error);
    });
    const resize = new ResizeObserver(() => loop.invalidate()); resize.observe(canvas);
    return () => {
      disposed = true; resize.disconnect(); loop.dispose(); syncPlayback.current = null;
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [coordinates, mini, animated]);
  useEffect(() => { syncPlayback.current?.(); }, [active]);
  return <canvas ref={ref} className={mini ? 'line-mini-canvas' : 'winning-line'} role="img" aria-label={label}
    data-payline-art={mini ? 'diagram' : 'raster-reaction'} data-payline-positions={coordinates} />;
}
