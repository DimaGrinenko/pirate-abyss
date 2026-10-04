/** A decorative scene has one preparation attempt per page. After startup
 * already chose its safe fallback, entering gameplay must not repeat a long
 * network timeout before that fallback can begin. A reload is a fresh attempt.
 */
export class OptionalScenePreparation<T> {
  private preparation: Promise<T> | undefined;
  private readonly prepare: () => Promise<T>;

  constructor(prepare: () => Promise<T>) { this.prepare = prepare; }

  load(): Promise<T> {
    // The rejection is retained intentionally, just like a prepared success.
    // Callers decide how to paint/complete their fallback; this owns no timers.
    this.preparation ??= Promise.resolve().then(this.prepare);
    return this.preparation;
  }
}
