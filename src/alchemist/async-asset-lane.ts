type PrepareWork = <T>(work: () => T) => Promise<T>;

/** Serialize resource-owning async jobs without occupying the shared main-
 * thread work queue while a browser encoder/decoder is running. Only kickoff
 * runs on that queue. One lane still owns at most one unfinished resource. */
export class AsyncAssetLane {
  private tail: Promise<unknown> = Promise.resolve();
  private readonly prepare: PrepareWork;
  constructor(prepare: PrepareWork) { this.prepare = prepare; }

  run<T>(begin: () => Promise<T>): Promise<T> {
    const next = this.tail.catch(() => undefined).then(async () => {
      // The wrapper intentionally prevents Promise assimilation by the shared
      // queue; this lane, rather than every Spine parser, awaits completion.
      const job = await this.prepare(() => ({ pending: begin() }));
      return job.pending;
    });
    this.tail = next;
    return next;
  }
}
