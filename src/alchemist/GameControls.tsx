import { useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './icons';
import { assetUrl } from './assets';
import type { IconName } from './icons';
import { formatAmount, language, socialMode, t } from './locale';
import './game-controls-v37.css';
import './menu-interface-v35.css';

export type SpinControlAction = 'spin' | 'stop' | 'resume' | 'back' | 'replay' | 'busy';
export type GameControlsProps = {
  /** A parent overlay must also dismiss this component's body-mounted portal. */
  obscured?: boolean;
  currency: string;
  balance: number;
  balanceLabel: string;
  win: number;
  winLabel: string;
  featureLabel: string;
  featureAriaLabel: string;
  featureDisabled: boolean;
  featureActive?: boolean;
  onFeature: () => void;
  /** The base bet and the server-provided base-bet levels. */
  bet: number;
  betMultiplier: number;
  betLevels: readonly number[];
  betDisabled: boolean;
  onBetChange: (nextBaseBet: number) => void;
  freeSpins?: number;
  spinAction: SpinControlAction;
  spinLabel?: string;
  spinAriaLabel?: string;
  spinDisabled: boolean;
  onSpin: () => void;
  settingsDisabled: boolean;
  onSettings: () => void;
  sound: boolean;
  onSound: () => void;
  turbo: boolean;
  turboDisabled: boolean;
  onTurbo: () => void;
  autoRemaining: number;
  autoDisabled: boolean;
  onAuto: () => void;
};

const COPY = {
  ru: { menu: 'Меню', sound: 'Звук', turbo: 'Турбо', auto: 'Авто', stop: 'Стоп', resume: 'Далее', replay: 'Повтор', betPicker: 'Выбор ставки', choose: 'Изменить ставку', selected: 'Выбрано', on: 'Вкл.', off: 'Выкл.', spins: 'Вращений осталось' },
  en: { menu: 'Menu', sound: 'Sound', turbo: 'Turbo', auto: 'Auto', stop: 'Stop', resume: 'Resume', replay: 'Replay', betPicker: 'Choose bet', choose: 'Change bet', selected: 'Selected', on: 'On', off: 'Off', spins: 'Spins remaining' },
};

// The chooser is portalled to body; its art variables cannot inherit from
// the live glass HUD inside the cabin.
const DIALOG_ART = {
  '--deck-panel-art': `url("${assetUrl('alchemist/ui/v35/panel.webp')}")`,
} as CSSProperties;

function Amount({ value, currency, testId }: { value: number; currency: string; testId?: string }) {
  const formatted = formatAmount(value);
  return <span className="captain-deck__money" data-long-amount={formatted.length > 14 || undefined} data-compact-amount={formatted.length > 9 || undefined} data-wide-currency={currency.length > 4 || undefined}
    style={{ '--amount-chars': Math.max(5, formatted.length), '--currency-chars': currency.length } as CSSProperties}>
    <strong data-testid={testId}>{formatted}</strong><small>{currency}</small>
  </span>;
}

function DeckButton({ icon, label, title, active, disabled, onClick, className = '', children }: {
  icon: IconName; label: string; title?: string; active?: boolean; disabled?: boolean;
  onClick: () => void; className?: string; children?: ReactNode;
}) {
  return <button type="button" className={`captain-deck__tool ${className}`} aria-label={title ?? label}
    title={title ?? label} aria-pressed={active} disabled={disabled} onClick={onClick}>
    <Icon name={icon} size={23} /><span>{label}</span>{children}
  </button>;
}

/** Presentation only. Every action remains guarded by the parent round session. */
export function GameControls(props: GameControlsProps) {
  const copy = COPY[language];
  const [panel, setPanel] = useState<'bets' | 'menu' | null>(null);
  const deckRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const inBonus = props.freeSpins !== undefined;
  const index = props.betLevels.indexOf(props.bet);
  const multiplier = props.betMultiplier;
  const cost = props.bet * multiplier;
  const betPickerLabel = socialMode ? 'Choose spin amount' : copy.betPicker;
  const changeBetLabel = socialMode ? 'Change spin amount' : copy.choose;
  const visiblePanel = props.obscured || panel === 'bets' && (props.betDisabled || inBonus) ? null : panel;

  useEffect(() => {
    if (props.obscured || panel === 'bets' && (props.betDisabled || inBonus)) setPanel(null);
  }, [panel, props.obscured, props.betDisabled, inBonus]);

  useEffect(() => {
    if (!visiblePanel) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = panelRef.current;
    // The dialog is portalled to body, so the underlying game can be inert
    // without disabling it. Restore the existing inert state on close.
    const game = deckRef.current?.closest<HTMLElement>('.game-shell');
    const previousInert = game?.inert ?? false;
    if (game) game.inert = true;
    (dialog?.querySelector<HTMLElement>('[aria-pressed="true"]:not(:disabled)')
      ?? dialog?.querySelector<HTMLElement>('button:not(:disabled)') ?? dialog)?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      // Space must never reach the game's window-level spin shortcut while
      // a modal is open, including when its non-button content has focus.
      // Keep the native Space activation of focused buttons intact.
      if (event.code === 'Space' || event.key === ' ') {
        event.stopPropagation();
        if (!(event.target instanceof HTMLElement && event.target.closest('button'))) event.preventDefault();
        return;
      }
      if (event.key === 'Escape') { event.preventDefault(); setPanel(null); return; }
      if (event.key !== 'Tab') return;
      const buttons = [...(dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])]
        .filter(button => button.getClientRects().length > 0);
      const first = buttons[0], last = buttons.at(-1);
      if (!buttons.some(button => button === document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      if (game) game.inert = previousInert;
      const active = document.activeElement;
      if ((!active || active === document.body || dialog?.contains(active)) && previous?.isConnected && !previous.closest('[inert]')) previous.focus();
    };
  }, [visiblePanel]);

  const spinLabel = props.spinLabel ?? ({
    spin: t('Вращать'), stop: copy.stop, resume: copy.resume, back: t('Назад'), replay: copy.replay, busy: t('Вращение'),
  } satisfies Record<SpinControlAction, string>)[props.spinAction];
  const spinIcon: IconName = props.spinAction === 'stop' ? 'stop'
    : props.spinAction === 'back' || props.spinAction === 'replay' ? 'reset'
      : props.spinAction === 'resume' ? 'play' : 'spin';
  const autoTitle = props.autoRemaining > 0 ? t('Остановить автоспины') : t('Автоспины');
  const soundTitle = props.sound ? t('Выключить звук') : t('Включить звук');
  const turboTitle = props.turbo ? t('Выключить турбо') : t('Включить турбо');
  function chooseBet(next: number) {
    if (props.betDisabled || inBonus || !props.betLevels.includes(next)) return;
    props.onBetChange(next);
    setPanel(null);
  }
  function menuAction(action: () => void) { setPanel(null); action(); }

  return <section ref={deckRef} className="captain-deck" aria-label={t('Управление игрой')} data-bonus={inBonus || undefined}>
    <button type="button" className="captain-deck__feature" data-testid="features" disabled={props.featureDisabled}
      aria-label={props.featureAriaLabel} title={props.featureAriaLabel} aria-pressed={props.featureActive} onClick={props.onFeature}>
      <span>{props.featureLabel}</span>
    </button>
    <div className="captain-deck__utilities">
      <button type="button" className="captain-deck__tool captain-deck__compact-menu" title={copy.menu} aria-label={copy.menu}
        aria-haspopup="dialog" aria-expanded={visiblePanel === 'menu'} aria-controls={visiblePanel === 'menu' ? panelId : undefined} onClick={() => setPanel('menu')}>
        <Icon name="settings" size={22} /><span>{copy.menu}</span>
      </button>
    </div>
    <div className="captain-deck__ledger">
      <div className="captain-deck__readout"><span className="captain-deck__label">{props.balanceLabel}</span><Amount value={props.balance} currency={props.currency} testId="balance" /></div>
      <div className="captain-deck__readout captain-deck__readout--win"><span className="captain-deck__label">{props.winLabel}</span><Amount value={props.win} currency={props.currency} testId="last-win" /></div>
    </div>

    <div className="captain-deck__bet">
      <span className="captain-deck__label">{inBonus ? copy.spins : multiplier === 1 ? t('Ставка') : t('Стоимость вращения')}</span>
      {inBonus ? <div className="captain-deck__bonus-count"><strong data-testid="remaining-free-spins">{props.freeSpins}</strong><span>{t('Ставка')} <Amount value={props.bet} currency={props.currency} testId="bet" /></span></div>
        : <div className="captain-deck__stepper" role="group" aria-label={t('Ставка')}>
          <button type="button" className="captain-deck__bet-amount" aria-label={`${changeBetLabel}: ${formatAmount(cost)} ${props.currency}`}
            aria-haspopup="dialog" aria-expanded={visiblePanel === 'bets'} aria-controls={visiblePanel === 'bets' ? panelId : undefined}
            disabled={props.betDisabled} onClick={() => setPanel('bets')}>
            <Amount value={cost} currency={props.currency} testId="bet" />
            {multiplier !== 1 && <span className="captain-deck__factor">{formatAmount(props.bet)} × {multiplier}</span>}
          </button>
          <button type="button" className="captain-deck__step captain-deck__step--up" aria-label={t('Увеличить ставку')} title={t('Увеличить ставку')}
            disabled={props.betDisabled || index < 0 || index >= props.betLevels.length - 1} onClick={() => chooseBet(props.betLevels[index + 1])}><Icon name="plus" size={21} /></button>
          <button type="button" className="captain-deck__step captain-deck__step--down" aria-label={t('Уменьшить ставку')} title={t('Уменьшить ставку')}
            disabled={props.betDisabled || index <= 0} onClick={() => chooseBet(props.betLevels[index - 1])}><Icon name="minus" size={21} /></button>
        </div>}
    </div>

    <button type="button" className="captain-deck__spin" data-testid="spin" data-action={props.spinAction} disabled={props.spinDisabled}
      aria-label={props.spinAriaLabel ?? spinLabel} onClick={props.onSpin}>
      <Icon name={spinIcon} size={33} /><span>{spinLabel}</span>
    </button>
    <div className="captain-deck__modes">
      {inBonus && <span className="captain-deck__phone-spins" aria-label={`${copy.spins}: ${props.freeSpins}`}><span>{t('ВРАЩЕНИЯ')}</span><strong>{props.freeSpins}</strong></span>}
      <DeckButton className="captain-deck__auto" icon="auto" label={props.autoRemaining > 0 ? `${copy.auto} ${props.autoRemaining}` : copy.auto} title={autoTitle} active={props.autoRemaining > 0} disabled={props.autoDisabled} onClick={props.onAuto} />
      <DeckButton className="captain-deck__turbo" icon="turbo" label={copy.turbo} title={turboTitle} active={props.turbo} disabled={props.turboDisabled} onClick={props.onTurbo} />
    </div>
    {visiblePanel && createPortal(<div className="captain-deck-overlay" onClick={event => { if (event.target === event.currentTarget) setPanel(null); }}>
      <div ref={panelRef} id={panelId} className="captain-deck-dialog" role="dialog" aria-modal="true" aria-labelledby={`${panelId}-title`} tabIndex={-1} style={DIALOG_ART}>
        <header><h2 id={`${panelId}-title`}>{visiblePanel === 'bets' ? betPickerLabel : copy.menu}</h2><button type="button" className="captain-deck__close" onClick={() => setPanel(null)} aria-label={t('Закрыть')}><Icon name="close" size={22} /></button></header>
        {visiblePanel === 'bets' ? <>
          <p className="captain-deck-dialog__intro">{multiplier === 1 ? t('Ставка') : t('Стоимость вращения')} · {props.currency}{multiplier !== 1 && <span>{t('Базовая ставка')} × {multiplier}</span>}</p>
          <div className="captain-deck-dialog__bets">{props.betLevels.map(level => <button type="button" key={level} onClick={() => chooseBet(level)} aria-pressed={level === props.bet}>
            <Amount value={level * multiplier} currency={props.currency} />{level === props.bet && <span className="captain-deck-dialog__selected">{copy.selected}</span>}
          </button>)}</div>
        </> : <div className="captain-deck-dialog__menu">
          <DeckButton icon={props.sound ? 'sound' : 'muted'} label={`${copy.sound} · ${props.sound ? copy.on : copy.off}`} title={soundTitle} active={props.sound} onClick={props.onSound} />
          <DeckButton icon="turbo" label={`${copy.turbo} · ${props.turbo ? copy.on : copy.off}`} title={turboTitle} active={props.turbo} disabled={props.turboDisabled} onClick={props.onTurbo} />
          <DeckButton icon="auto" label={autoTitle} active={props.autoRemaining > 0} disabled={props.autoDisabled} onClick={() => menuAction(props.onAuto)} />
          <DeckButton icon="settings" label={t('Настройки')} disabled={props.settingsDisabled} onClick={() => menuAction(props.onSettings)} />
        </div>}
      </div>
    </div>, document.body)}
  </section>;
}
