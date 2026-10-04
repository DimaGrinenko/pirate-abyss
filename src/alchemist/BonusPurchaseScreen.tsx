import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { t, formatAmount as format, type TranslationKey } from './locale';
import { Icon } from './icons';
import { symbolImageUrl } from './symbol-assets';
import { INITIAL_FREE_SPINS, type BonusMode, type FeatureMode } from './engine';
import { AlchemyButton } from './AlchemyButton';
import { ChemicalSymbol } from './ChemicalSymbol';
import type { PlayableMathMode as MathMode } from './math/types';
import { getCompassCopy } from './compass-copy';
import { expeditionOffer, type ExpeditionChoice } from './expedition-offer';
import { getExpeditionCopy } from './expedition-copy-v33';
import './ceremony.css';
import './expedition-planner-v33.css';
import './bonus-purchase-screen.css';
import './bonus-purchase-v41.css';
import './bonus-purchase-restored-v42.css';
import { adjacentPurchaseBet } from './purchase-bet-v41';
import { assetUrl } from './assets';

const MODES: { id: FeatureMode; art: string; title: TranslationKey; description: TranslationKey }[] = [
  { id: 'standard', art: 'flask', title: 'Обычный спин', description: 'Отправляйтесь за сокровищами с базовой ставкой.' },
  { id: 'bonushunt', art: 'scatter', title: 'Охота за сокровищами', description: 'В 5 раз выше шанс запуска бесплатных вращений.' },
  { id: 'catalysts', art: 'wild-red', title: 'Зов глубин', description: 'Не менее 3 Wild на каждом спине. Без Scatter.' },
];
const RAIDS = ['devastation', 'reckoning'] as const;
type Tab = 'raids' | 'modes';
type Confirmation = ExpeditionChoice & { baseBet: number };
type Props = {
  currency?: string;
  allowedModes?: readonly MathMode[];
  allowBuyFeature?: boolean;
  bet: number;
  balance: number;
  betLevels?: readonly number[];
  onBetChange?: (bet: number) => void;
  reducedMotion: boolean;
  currentFeature: FeatureMode;
  disabled?: boolean;
  onSelectFeature: (mode: FeatureMode) => void;
  onPurchase: (mode: BonusMode) => void;
  onClose: () => void;
};
function raidTitle(mode: BonusMode) { return mode === 'captains_course' ? getCompassCopy().title : t(mode === 'reckoning' ? 'Владыки бездны' : 'Проклятый рейд'); }
function raidArt(mode: BonusMode) { return mode === 'captains_course' ? 'retort' : `wild-${mode === 'reckoning' ? 'gold' : 'green'}`; }
function ChoiceArt({ id, className = '' }: { id: string; className?: string }) {
  return <img className={`expedition-art ${className}`} src={symbolImageUrl(id)} alt="" draggable={false} />;
}
function AnimatedRaidArt({ id, reducedMotion }: { id: string; reducedMotion: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    // Tiny landscape hides the portrait; a scrolled-off card also needs no tick.
    const observer = new IntersectionObserver(entries => {
      setVisible(entries.some(entry => entry.isIntersecting && entry.intersectionRect.width > 0 && entry.intersectionRect.height > 0));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const wildType = id.startsWith('wild-') ? id.slice(5) : undefined;
  return <div ref={host} className="expedition-art expedition-art--animated" aria-hidden="true">
    <ChemicalSymbol id={wildType ? 'wild' : id} wildType={wildType} animation="idle" timeScale={.65} animated={!reducedMotion} active={visible} />
  </div>;
}
function Price({ cost, currency }: { cost: number; currency: string }) {
  const amount = format(cost);
  return <span className="expedition-money" style={{ '--price-chars': amount.length } as CSSProperties}><strong>{amount}</strong><small>{currency}</small></span>;
}

/** Every offer is subject to the session's explicit mode and purchase gate. */
export function BonusPurchaseScreen({ currency = 'CR', allowedModes = ['base', 'bonushunt', 'catalysts', 'devastation', 'reckoning'], allowBuyFeature = true, bet, balance, betLevels = [], onBetChange, reducedMotion, currentFeature, disabled = false, onSelectFeature, onPurchase, onClose }: Props) {
  const copy = getExpeditionCopy();
  const compass = getCompassCopy();
  const raids: readonly BonusMode[] = allowedModes.includes('captains_course') ? [...RAIDS, 'captains_course'] : RAIDS;
  const uid = useId();
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  const confirmationBack = useRef<HTMLButtonElement>(null);
  const returnToReview = useRef(false);
  const dispatched = useRef(false);
  const [tab, setTab] = useState<Tab>('raids');
  const [selected, setSelected] = useState<BonusMode>(() => allowedModes.includes('devastation') ? 'devastation' : allowedModes.includes('reckoning') ? 'reckoning' : allowedModes.includes('captains_course') ? 'captains_course' : 'devastation');
  const [selectedFeature, setSelectedFeature] = useState<FeatureMode>(currentFeature);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const context = { bet, balance, allowedModes, allowBuyFeature, disabled };
  const confirmOffer = confirmation ? expeditionOffer(confirmation, context, confirmation.baseBet) : null;
  const activeMode = MODES.find(mode => mode.id === currentFeature)!;
  const lowerBet = adjacentPurchaseBet(betLevels, bet, -1);
  const higherBet = adjacentPurchaseBet(betLevels, bet, 1);
  const confirmTitle = confirmation?.kind === 'feature' ? t(MODES.find(item => item.id === confirmation.mode)!.title) : confirmation ? raidTitle(confirmation.mode) : '';

  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const content = ref.current?.querySelector<HTMLElement>('.expedition-content');
    if (content) content.scrollTop = 0;
  }, [tab]);
  useEffect(() => {
    const content = ref.current?.querySelector<HTMLElement>('.expedition-content');
    if (content) content.scrollTop = 0;
    if (confirmation) confirmationBack.current?.focus();
    // The review button is remounted after confirmation, so a saved element
    // reference would be detached and fail to restore keyboard focus.
    else if (returnToReview.current) {
      const review = ref.current?.querySelector<HTMLButtonElement>('[data-expedition-review]');
      (review && !review.disabled ? review : ref.current?.querySelector<HTMLButtonElement>('.expedition-close'))?.focus();
    }
  }, [confirmation]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current;
    dialog?.querySelector<HTMLButtonElement>('button')?.focus();
    const trap = (event: globalThis.KeyboardEvent) => {
      if (event.code === 'Space' || event.key === ' ') {
        event.stopPropagation();
        if (!(event.target instanceof HTMLElement && event.target.closest('button'))) event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation();
        if (dialog?.querySelector('[data-testid="purchase-confirmation"]')) setConfirmation(null);
        else closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = [...(dialog?.querySelectorAll<HTMLButtonElement>('button:not(:disabled):not([tabindex="-1"])') ?? [])].filter(button => button.getClientRects().length > 0);
      const first = items[0], last = items.at(-1);
      if (!items.some(button => button === document.activeElement)) { event.preventDefault(); (event.shiftKey ? last : first)?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.removeEventListener('keydown', trap);
      const active = document.activeElement;
      if ((!active || active === document.body || dialog?.contains(active)) && previous?.isConnected && !previous.closest('[inert]')) previous.focus();
    };
  }, []);

  function requestConfirmation(choice: ExpeditionChoice) {
    if (!expeditionOffer(choice, context).canConfirm) return;
    if (choice.kind === 'bonus') setSelected(choice.mode);
    else setSelectedFeature(choice.mode);
    returnToReview.current = true; dispatched.current = false;
    setConfirmation({ ...choice, baseBet: bet });
  }
  function confirmSelection() {
    if (!confirmation || !confirmOffer?.canConfirm || dispatched.current) return;
    dispatched.current = true;
    if (confirmation.kind === 'feature') onSelectFeature(confirmation.mode);
    else onPurchase(confirmation.mode);
    setConfirmation(null);
  }

  return <div className="ceremony-screen expedition-planner expedition-restored-v42" ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} data-reduced-motion={reducedMotion || undefined} style={{ '--exp-panel-art': `url(${assetUrl('alchemist/ui/interface-panel.webp')})` } as CSSProperties}>
    <div className="expedition-planner__panel">
      <header className="expedition-heading"><div><span>{t('СОБЕРИ ПРОКЛЯТУЮ КОМАНДУ')}</span><h2 id={`${uid}-title`}>{t('Режимы и бонусы')}</h2></div><button type="button" className="expedition-close" aria-label={t('Закрыть')} onClick={onClose}><Icon name="close" size={23} /></button></header>
      <div className="expedition-restored-tabs" role="tablist" aria-label={t('Режимы и бонусы')} onKeyDown={event => {
        if (confirmation || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next: Tab = event.key === 'Home' ? 'modes' : event.key === 'End' ? 'raids' : tab === 'modes' ? 'raids' : 'modes';
        setTab(next); ref.current?.querySelector<HTMLButtonElement>(`[id="${uid}-tab-${next}"]`)?.focus();
      }}>{(['modes', 'raids'] as const).map(value => <AlchemyButton key={value} variant={tab === value ? 'primary' : 'secondary'} role="tab" id={`${uid}-tab-${value}`} aria-controls={`${uid}-panel-${value}`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} disabled={Boolean(confirmation)} onClick={() => setTab(value)}>{value === 'modes' ? t('Режимы') : t('Бонусы')}</AlchemyButton>)}</div>
      <section className="expedition-content" id={`${uid}-panel-${tab}`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`}>
        {confirmation && confirmOffer ? <div className="expedition-confirmation" data-testid="purchase-confirmation">
          <span className="expedition-eyebrow">{confirmation.kind === 'bonus' ? copy.confirmTitle : copy.confirmMode}</span>
          <h3>{confirmTitle}</h3>
          <div className="expedition-confirmation__visual"><ChoiceArt id={confirmation.kind === 'bonus' ? raidArt(confirmation.mode) : MODES.find(item => item.id === confirmation.mode)!.art} />
            <dl className="expedition-quote"><div><dt>{t('Базовая ставка')}</dt><dd><Price cost={bet} currency={currency} /></dd></div><div className="expedition-quote__total"><dt>{confirmation.kind === 'feature' ? t('Стоимость вращения') : t('Стоимость покупки')}<small>{confirmOffer.multiplier}× · {confirmation.kind === 'bonus' ? copy.oneTime : copy.perSpin}</small></dt><dd><Price cost={confirmOffer.cost} currency={currency} /></dd></div>{confirmation.kind === 'bonus' && confirmOffer.affordable && <div><dt>{copy.balanceAfter}</dt><dd><Price cost={Math.max(0, balance - confirmOffer.cost)} currency={currency} /></dd></div>}</dl>
          </div>
          <p>{confirmation.kind === 'feature' ? t('Включение режима бесплатно. Указанная стоимость списывается только при каждом следующем вращении.') : t('После подтверждения указанная стоимость спишется с баланса и начнутся 10 бесплатных вращений.')}</p>
          {!confirmOffer.currentQuote ? <p className="expedition-warning" role="status">{copy.changedAmount}</p> : !confirmOffer.available ? <p className="expedition-warning" role="status">{copy.unavailable}</p> : !confirmOffer.affordable && <p className="expedition-warning" role="status">{t(confirmation.kind === 'feature' ? 'Текущего баланса недостаточно для вращения в этом режиме.' : 'Текущего баланса недостаточно для покупки.')}</p>}
          <small className="expedition-footnote">{copy.noGuarantee}</small>
        </div> : <>
          {tab === 'raids' ? <>
            {!allowBuyFeature && <p className="expedition-warning" role="status">{copy.purchaseUnavailable}</p>}
            <div className="expedition-restored-cards" data-offers={raids.length}>{raids.map(value => {
              const offer = expeditionOffer({ kind: 'bonus', mode: value }, context);
              return <article key={value} className="expedition-restored-card" data-raid={value}>
                <div className="expedition-restored-icon"><AnimatedRaidArt id={raidArt(value)} reducedMotion={reducedMotion} />{value !== 'captains_course' && <b aria-hidden="true">WILD</b>}</div>
                <h3>{raidTitle(value)}</h3>
                <div className="expedition-restored-description"><p className="expedition-restored-spins"><b>{INITIAL_FREE_SPINS}</b> {t('бесплатных вращений')}</p><p>{value === 'captains_course' ? compass.tag : value === 'reckoning' ? <>{t('Пробуждённые владыки')}<br />{t('сохраняют силу до конца бонуса.')}</> : <>{t('Больше владык Wild.')}<br />{t('Больше раскрытий барабанов.')}</>}</p></div>
                <div className="expedition-restored-price"><Price cost={offer.cost} currency={currency} /><small>{offer.multiplier}×</small></div>
                <AlchemyButton className="expedition-restored-buy" variant={value === 'reckoning' ? 'buy' : 'primary'} disabled={!offer.canConfirm} data-expedition-review={selected === value || undefined} onClick={() => requestConfirmation({ kind: 'bonus', mode: value })}>{t('Купить')}</AlchemyButton>
                {(!offer.available || !offer.affordable) && <small className="expedition-warning" role="status">{!offer.available ? copy.unavailable : t('Текущего баланса недостаточно для покупки.')}</small>}
              </article>;
            })}</div>
          </> : <>
            <p className="expedition-restored-mode-note">{t('Включение бесплатно. Указанная стоимость списывается только при вращении.')}</p>
            <div className="expedition-restored-cards expedition-restored-cards--modes">{MODES.map(item => {
              const offer = expeditionOffer({ kind: 'feature', mode: item.id }, context);
              const active = currentFeature === item.id;
              return <article key={item.id} className="expedition-restored-card" data-feature={item.id} data-active={active || undefined}>
                <div className="expedition-restored-icon"><ChoiceArt id={item.art} /></div>
                <h3>{t(item.title)}</h3><div className="expedition-restored-description"><p>{t(item.description)}</p></div>
                <div className="expedition-restored-price"><Price cost={offer.cost} currency={currency} /><small>{offer.multiplier}× · {t('/ спин')}</small></div>
                <AlchemyButton className="expedition-restored-buy" variant={active ? 'primary' : 'secondary'} aria-pressed={active} disabled={!offer.canConfirm || active} data-expedition-review={selectedFeature === item.id || undefined} onClick={() => requestConfirmation({ kind: 'feature', mode: item.id })}>{active ? t('Активен') : item.id === 'standard' ? t('Обычный режим') : t('Включить')}</AlchemyButton>
                {(!offer.available || !offer.affordable) && <small className="expedition-warning" role="status">{!offer.available ? copy.unavailable : t('Текущего баланса недостаточно для вращения в этом режиме.')}</small>}
              </article>;
            })}</div>
          </>}
        </>}
      </section>
      <footer className={`expedition-summary${confirmation && confirmOffer ? ' expedition-summary--confirmation' : ''}`}>
        {confirmation && confirmOffer ? <>
          <div className="expedition-confirmation-cost" id={`${uid}-confirmation-cost`}><span>{t(confirmation.kind === 'bonus' ? 'Стоимость покупки' : 'Стоимость вращения')}<small>{confirmOffer.multiplier}× · {confirmation.kind === 'bonus' ? copy.oneTime : copy.perSpin}</small></span><Price cost={confirmOffer.cost} currency={currency} /></div>
          <div className="expedition-actions" data-testid="purchase-confirmation-actions"><AlchemyButton ref={confirmationBack} variant="secondary" onClick={() => setConfirmation(null)}>{t('Назад')}</AlchemyButton><AlchemyButton variant="primary" aria-describedby={`${uid}-confirmation-cost`} disabled={!confirmOffer.canConfirm} onClick={confirmSelection}>{t('Подтвердить')}</AlchemyButton></div>
        </> : <>
          <div><span>{t('Баланс')}</span><Price cost={balance} currency={currency} /></div><div className="expedition-shop-bet"><span>{t('Базовая ставка')}</span><div><button type="button" aria-label={t('Уменьшить ставку')} disabled={disabled || !onBetChange || lowerBet === null} onClick={() => lowerBet !== null && onBetChange?.(lowerBet)}>−</button><Price cost={bet} currency={currency} /><button type="button" aria-label={t('Увеличить ставку')} disabled={disabled || !onBetChange || higherBet === null} onClick={() => higherBet !== null && onBetChange?.(higherBet)}>+</button></div></div><div className="expedition-summary__mode" role="status"><span>{copy.current}</span><strong>{t(activeMode.title)}</strong><small>{format(bet * expeditionOffer({ kind: 'feature', mode: currentFeature }, context).multiplier)} {currency} {t('/ спин')}</small></div>
        </>}
      </footer>
    </div>
  </div>;
}

