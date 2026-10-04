import { useEffect, useState } from 'react';
import { formatAmount, formatNumber, language, socialMode } from './locale';
import { elapsedSessionSeconds, formatSessionDuration, sessionPositionUnits, showSessionCompliance } from './session-compliance';
import type { SessionDisplayFlags } from './session-compliance';
import './session-compliance-meta.css';

export type SessionComplianceMetaProps = {
  flags: SessionDisplayFlags;
  live: boolean;
  replay: boolean;
  /** First successful RGS authentication; unchanged by recovery. */
  sessionStartedAt: number | null;
  /** Confirmed payout less accepted round cost, deduplicated by server bet ID. */
  netPositionMicro: number | null;
  currency: string;
  /** Published theoretical RTP percentage, not the observed session return. */
  rtpPercent: number;
};

/** Optional footer metadata. Never infer account data from demo/replay state. */
export function SessionComplianceMeta(props: SessionComplianceMetaProps) {
  const [now, setNow] = useState(() => Date.now());
  const visible = showSessionCompliance(props.flags, props.live, props.replay);
  const timerVisible = visible && props.flags.displaySessionTimer === true && props.sessionStartedAt !== null;
  useEffect(() => {
    if (!timerVisible) return;
    let interval: ReturnType<typeof setInterval> | undefined;
    const update = () => setNow(Date.now());
    const visibility = () => {
      if (interval !== undefined) clearInterval(interval);
      interval = undefined;
      update();
      // Elapsed time still includes the background interval. Resumption reads
      // wall-clock time once, rather than replaying missed timer ticks.
      if (!document.hidden) interval = setInterval(update, 1000);
    };
    visibility();
    document.addEventListener('visibilitychange', visibility);
    return () => { if (interval !== undefined) clearInterval(interval); document.removeEventListener('visibilitychange', visibility); };
  }, [timerVisible, props.sessionStartedAt]);
  if (!visible) return null;

  const ru = language === 'ru';
  const elapsed = elapsedSessionSeconds(props.sessionStartedAt, now);
  const position = sessionPositionUnits(props.netPositionMicro);
  const rtp = Number.isFinite(props.rtpPercent) && props.rtpPercent > 0 && props.rtpPercent <= 100
    ? `${formatNumber(props.rtpPercent, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '—';
  return <div className="session-compliance-meta" role="group" aria-label={ru ? 'Сведения о сессии' : 'Session information'}>
    {props.flags.displaySessionTimer === true && <span title={ru ? 'Время текущей сессии' : 'Current session duration'}>
      <span>{ru ? 'Сессия' : 'Session'}</span><time dateTime={elapsed === null ? undefined : `PT${elapsed}S`} data-testid="session-duration">{formatSessionDuration(elapsed)}</time>
    </span>}
    {props.flags.displayNetPosition === true && <span title={ru ? 'Выигрыши минус стоимость раундов текущей сессии' : socialMode ? 'Session wins minus round costs' : 'Session payouts minus round costs'}>
      <span>{ru ? 'Итог' : 'Net'}</span><strong data-testid="session-net-position">{position === null ? '—' : `${position > 0 ? '+' : ''}${formatAmount(position)} ${props.currency}`}</strong>
    </span>}
    {props.flags.displayRTP === true && <span title={ru ? 'Теоретический возврат игроку' : 'Theoretical return to player'}>
      <span>RTP</span><strong data-testid="session-rtp">{rtp}</strong>
    </span>}
  </div>;
}
