import type { Application } from '@pixi/app';
import { Container } from '@pixi/display';
import { Graphics } from '@pixi/graphics';
import type { Spine } from '@esotericsoftware/spine-pixi-v7';
import { DemandFrameLoop } from './demand-frame-loop';
import { acquireCurtainRenderer, releaseCurtainRenderer } from './reel-curtain-renderer-pool';
import { reelCurtainViewport } from './reel-curtain-gpu';
import { sharedCurtainClipHeight, sharedCurtainOffset } from './shared-curtain-layout';
import { renderDiagnosticsEnabled } from './render-diagnostics';

export type CurtainView = ReturnType<typeof reelCurtainViewport>;
export type SharedCurtainEntry = {
  element: HTMLElement; spine: Spine; nativeWidth: number;
  playing: () => boolean;
  update: (delta: number, view: CurtainView) => number;
  rendered: () => void;
  failed: () => void;
};
type BoundEntry = { source: SharedCurtainEntry; group: Container; mask: Graphics; view: CurtainView; clipHeight: number; dirty: boolean };

/** Four native skeletons, one atlas upload, one RAF and one GPU submission. */
export class SharedCurtainStage {
  private root: HTMLElement | null = null;
  private surface: HTMLElement | null = null;
  private app: Application | null = null;
  private observer: ResizeObserver | null = null;
  private loop: DemandFrameLoop | null = null;
  private entries = new Set<BoundEntry>();
  private failing = false;
  private measuredFrames = 0;
  private renderTotal = 0;
  private intervalTotal = 0;
  private intervals = 0;
  private previousDraw = 0;

  attach(root: HTMLElement, surface: HTMLElement) {
    this.root = root; this.surface = surface;
    this.observer = new ResizeObserver(() => { try { this.measure(); this.invalidate(); } catch { this.fail(); } });
    this.observer.observe(root);
    document.addEventListener('visibilitychange', this.visibilityChanged);
  }

  private ensureRenderer() {
    if (this.app) return;
    if (!this.root || !this.surface || this.failing) throw new Error('Shared curtain stage unavailable');
    this.app = acquireCurtainRenderer();
    const canvas = this.app.view as HTMLCanvasElement;
    canvas.setAttribute('aria-hidden', 'true');
    canvas.dataset.spine = 'reel-curtains-shared';
    canvas.dataset.curtainRenderer = 'webgl-shared';
    canvas.dataset.spineReady = 'false';
    canvas.addEventListener('webglcontextlost', this.contextLost);
    this.surface.append(canvas);
    this.loop = new DemandFrameLoop({ request: callback => requestAnimationFrame(callback), cancel: id => cancelAnimationFrame(id) }, this.draw);
  }

  register(source: SharedCurtainEntry) {
    this.ensureRenderer();
    const group = new Container(), mask = new Graphics();
    group.addChild(source.spine); group.mask = mask;
    this.app!.stage.addChild(mask, group);
    const entry: BoundEntry = { source, group, mask, view: reelCurtainViewport(1, 1, 1, source.nativeWidth), clipHeight: -1, dirty: true };
    this.entries.add(entry); this.observer?.observe(source.element);
    try { this.measure(); } catch (error) { this.remove(entry); throw error; }
    let removed = false;
    return {
      invalidate: () => { if (!removed) { entry.dirty = true; this.invalidate(); } },
      paint: () => { if (!removed) { entry.dirty = true; this.draw(0); this.invalidate(); } },
      dispose: () => { if (!removed) { removed = true; this.remove(entry); } },
    };
  }

  private measure() {
    const root = this.root, app = this.app;
    if (!root || !app) return;
    const width = Math.max(1, root.clientWidth), height = Math.max(1, root.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (app.renderer.width !== Math.round(width * dpr) || app.renderer.height !== Math.round(height * dpr) || app.renderer.resolution !== dpr) {
      app.renderer.resolution = dpr; app.renderer.resize(width, height);
    }
    const bounds = root.getBoundingClientRect();
    for (const entry of this.entries) {
      const { element, spine, nativeWidth } = entry.source;
      const offset = sharedCurtainOffset(bounds, element.getBoundingClientRect(), width, height);
      const view = reelCurtainViewport(element.clientWidth, element.clientHeight, dpr, nativeWidth);
      entry.group.position.set(offset.x, offset.y); entry.mask.position.set(offset.x, offset.y);
      spine.scale.set(view.scale); spine.position.set(view.x, view.y);
      entry.view = view; entry.clipHeight = -1; entry.dirty = true;
    }
  }

  private invalidate() {
    if (!this.loop) return;
    this.loop.setPlayback([...this.entries].some(entry => entry.source.playing()), !document.hidden);
    this.loop.invalidate();
  }

  private visibilityChanged = () => {
    this.previousDraw = 0;
    this.loop?.setPlayback([...this.entries].some(entry => entry.source.playing()), !document.hidden);
  };

  private draw = (delta: number) => {
    const app = this.app;
    if (!app || this.failing) return;
    try {
      const started = renderDiagnosticsEnabled(import.meta.env.DEV) && delta > 0 ? performance.now() : 0;
      const entries = [...this.entries];
      for (const entry of entries) {
        if (!entry.dirty && !entry.source.playing()) continue;
        const progress = entry.source.update(entry.source.playing() ? delta : 0, entry.view);
        const clipHeight = sharedCurtainClipHeight(entry.view.height, progress);
        if (clipHeight !== entry.clipHeight) {
          entry.mask.clear().beginFill(0xffffff).drawRect(0, 0, entry.view.width, clipHeight).endFill();
          entry.clipHeight = clipHeight;
        }
        entry.dirty = false;
      }
      app.renderer.render(app.stage);
      const canvas = app.view as HTMLCanvasElement;
      if (canvas.dataset.spineReady !== 'true') canvas.dataset.spineReady = 'true';
      const curtainCount = String(this.entries.size);
      if (canvas.dataset.curtainCount !== curtainCount) canvas.dataset.curtainCount = curtainCount;
      for (const entry of entries) if (this.entries.has(entry)) entry.source.rendered();
      if (started) {
        this.renderTotal += performance.now() - started;
        if (this.previousDraw) { this.intervalTotal += started - this.previousDraw; this.intervals++; }
        this.previousDraw = started;
        if (++this.measuredFrames === 60) {
          canvas.dataset.renderMs = (this.renderTotal / this.measuredFrames).toFixed(2);
          canvas.dataset.frameIntervalMs = (this.intervalTotal / Math.max(1, this.intervals)).toFixed(2);
          canvas.dataset.renderSamples = String(this.measuredFrames);
          canvas.dataset.renderMetric = 'CPU updates and one shared GPU submission';
          this.measuredFrames = 0; this.renderTotal = 0; this.intervalTotal = 0; this.intervals = 0;
        }
      } else this.previousDraw = 0;
    } catch { this.fail(); }
  };

  private remove(entry: BoundEntry) {
    if (!this.entries.delete(entry)) return;
    this.observer?.unobserve(entry.source.element);
    entry.group.mask = null;
    entry.group.destroy({ children: true, texture: false, baseTexture: false }); entry.mask.destroy();
    if (!this.entries.size) this.release();
    else this.invalidate();
  }

  private contextLost = (event: Event) => { event.preventDefault(); this.fail(); };
  private fail() {
    if (this.failing) return;
    this.failing = true;
    // Each callback captures its own live track before unregistering it.
    for (const entry of [...this.entries]) { try { entry.source.failed(); } catch { /* Recover the other reels too. */ } }
    for (const entry of [...this.entries]) this.remove(entry);
    this.release(); this.failing = false;
  }

  private release() {
    this.loop?.dispose(); this.loop = null;
    if (this.app) {
      (this.app.view as HTMLCanvasElement).removeEventListener('webglcontextlost', this.contextLost);
      releaseCurtainRenderer(this.app, this.failing); this.app = null;
    }
    this.previousDraw = 0;
  }

  dispose() {
    this.observer?.disconnect(); this.observer = null;
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    for (const entry of [...this.entries]) this.remove(entry);
    this.release(); this.root = null; this.surface = null;
  }
}
