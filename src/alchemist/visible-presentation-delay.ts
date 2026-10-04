export type VisibleDelayHost = {
  now: () => number;
  hidden: () => boolean;
  /** Schedule once and return an idempotent cancellation function. */
  schedule: (callback: () => void, milliseconds: number) => () => void;
  subscribeVisibility: (callback: () => void) => () => void;
};

/** A one-shot hold measured only while the document is visible. Cancellation
 * releases its timer and visibility listener without invoking onComplete.
 * Node uses ordinary setTimeout, preserving existing timer-mock behaviour.
 */
export function startVisibleDelay(ms: number, onComplete: () => void, host?: VisibleDelayHost): () => void {
  const duration = Number.isFinite(ms) ? Math.max(0, ms) : 0;
  if (!host && typeof document === 'undefined') {
    let active = true;
    const timer = setTimeout(() => {
      if (!active) return;
      active = false;
      onComplete();
    }, duration);
    return () => {
      if (!active) return;
      active = false;
      clearTimeout(timer);
    };
  }

  const environment: VisibleDelayHost = host ?? {
    now: () => performance.now(),
    hidden: () => document.hidden,
    schedule: (callback, milliseconds) => {
      const timer = setTimeout(callback, milliseconds);
      return () => clearTimeout(timer);
    },
    subscribeVisibility: callback => {
      document.addEventListener('visibilitychange', callback);
      return () => document.removeEventListener('visibilitychange', callback);
    },
  };
  let remaining = duration, startedAt: number | null = null, finished = false, generation = 0;
  let cancelTimer: (() => void) | undefined;
  let unsubscribe: (() => void) | undefined;

  const clearTimer = () => {
    generation++;
    const cancel = cancelTimer;
    cancelTimer = undefined;
    cancel?.();
  };
  const cleanup = () => {
    clearTimer();
    const remove = unsubscribe;
    unsubscribe = undefined;
    remove?.();
  };
  const pause = () => {
    if (startedAt !== null) {
      remaining = Math.max(0, remaining - Math.max(0, environment.now() - startedAt));
      startedAt = null;
    }
    clearTimer();
  };
  const resume = () => {
    if (finished || startedAt !== null || environment.hidden()) return;
    startedAt = environment.now();
    const ticket = ++generation;
    cancelTimer = environment.schedule(() => {
      // A canceled callback already queued by a host cannot complete a newer hold.
      if (finished || ticket !== generation) return;
      cancelTimer = undefined;
      if (environment.hidden()) { pause(); return; }
      finished = true;
      startedAt = null;
      cleanup();
      onComplete();
    }, remaining);
  };
  const visibilityChanged = () => {
    if (finished) return;
    if (environment.hidden()) pause();
    else resume();
  };
  unsubscribe = environment.subscribeVisibility(visibilityChanged);
  resume();

  return () => {
    if (finished) return;
    finished = true;
    startedAt = null;
    cleanup();
  };
}

/** Repeat only after a complete visible interval. Hidden time never cycles
 * unseen results or queues a burst of catch-up callbacks on return. */
export function startVisibleRepeat(ms: number, onRepeat: () => void, host?: VisibleDelayHost): () => void {
  if (!Number.isFinite(ms) || ms <= 0) throw new RangeError('A visible repeat requires a positive finite interval.');
  let canceled = false;
  let cancelDelay = () => {};
  const schedule = () => {
    cancelDelay = startVisibleDelay(ms, () => {
      if (canceled) return;
      onRepeat();
      if (!canceled) schedule();
    }, host);
  };
  schedule();
  return () => { canceled = true; cancelDelay(); };
}
