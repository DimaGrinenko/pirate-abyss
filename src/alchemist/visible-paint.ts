/** Deliver after the browser has had a visible frame to present submitted art.
 * Hidden time never releases a presentation clock; cancellation owns both RAFs. */
export function afterVisiblePaint(callback: () => void): () => void {
  let frame = 0, disposed = false, frames = 0;
  const cancel = () => {
    disposed = true;
    cancelAnimationFrame(frame);
    document.removeEventListener('visibilitychange', resume);
  };
  const tick = () => {
    frame = 0;
    if (disposed || document.hidden) return;
    if (++frames < 2) { frame = requestAnimationFrame(tick); return; }
    cancel();
    callback();
  };
  const resume = () => {
    cancelAnimationFrame(frame); frame = 0; frames = 0;
    if (!disposed && !document.hidden) frame = requestAnimationFrame(tick);
  };
  document.addEventListener('visibilitychange', resume);
  resume();
  return cancel;
}
