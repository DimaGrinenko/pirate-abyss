import { useLayoutEffect, type RefObject } from 'react';

/** Register the ceremony to the actual reel furniture, including responsive
 * offsets. Resize work never runs in the animation's per-frame loop. */
export function useBonusFieldBounds(root: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const node = root.current;
    const shell = node?.closest('.game-shell');
    const field = shell?.querySelector<HTMLElement>('.machine');
    if (!node || !field) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = field.getBoundingClientRect();
      const viewportWidth = window.innerWidth, viewportHeight = window.innerHeight;
      const controls = shell?.querySelector<HTMLElement>('.control-wrap')?.getBoundingClientRect();
      const tiny = viewportWidth > viewportHeight && viewportHeight <= 300;
      const actor = shell?.querySelector<HTMLElement>('.alchemist-sidebar')?.getBoundingClientRect();
      const left = tiny ? Math.max(8, Math.min(rect.left - 4, (actor?.right ?? rect.left) + 6)) : Math.max(8, rect.left - 4);
      const top = tiny ? 7 : Math.max(7, rect.top - 5);
      const right = tiny ? viewportWidth - 8 : Math.min(viewportWidth - 8, rect.right + 4);
      const bottom = Math.min(viewportHeight - 7, controls ? controls.top - 5 : viewportHeight - 7,
        tiny ? viewportHeight : rect.bottom + 6);
      const values = { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
      for (const [name, value] of Object.entries(values)) node.style.setProperty(`--bonus-field-${name}`, `${Math.round(value * 100) / 100}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(field);
    if (shell) observer.observe(shell);
    window.addEventListener('resize', schedule);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); };
  }, [root]);
}
