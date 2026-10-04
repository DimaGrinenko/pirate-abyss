/** Display-only jurisdiction metadata. Values are supplied by the RGS session. */
export type SessionDisplayFlags = {
  displayNetPosition?: boolean;
  displaySessionTimer?: boolean;
  displayRTP?: boolean;
};

export function showSessionCompliance(flags: SessionDisplayFlags, live: boolean, replay: boolean): boolean {
  return live && !replay && (flags.displayNetPosition === true || flags.displaySessionTimer === true || flags.displayRTP === true);
}

export function elapsedSessionSeconds(startedAt: number | null, now: number): number | null {
  if (startedAt === null || !Number.isFinite(startedAt) || !Number.isFinite(now)) return null;
  return Math.floor(Math.max(0, now - startedAt) / 1000);
}

export function formatSessionDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor(total % 3600 / 60).toString().padStart(2, '0');
  const remainder = (total % 60).toString().padStart(2, '0');
  return hours ? `${hours}:${minutes}:${remainder}` : `${minutes}:${remainder}`;
}

export function sessionPositionUnits(micro: number | null): number | null {
  return micro !== null && Number.isSafeInteger(micro) ? micro / 1_000_000 : null;
}
