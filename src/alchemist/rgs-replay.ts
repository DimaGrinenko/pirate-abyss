import { API_SCALE, mathMode, apiAmount } from './rgs';
import { SESSION_MODE_COST as MODE_COST } from './math/config';
import type { PlayableMathMode as MathMode } from './math/types';

export interface ReplayData { state: unknown; mode: MathMode; betMicro: number; currency: string; payoutMultiplier: number }
/** Public replay endpoint: intentionally no session token, authentication or wallet calls. */
export async function loadReplay(launchUrl: string, request: typeof fetch = fetch): Promise<ReplayData> {
  const params = new URL(launchUrl).searchParams;
  const required = (key: string) => { const value = params.get(key)?.trim(); if (!value) throw new Error(`В ссылке повтора отсутствует ${key}`); return encodeURIComponent(value); };
  const host = params.get('rgs_url')?.trim();
  if (!host) throw new Error('В ссылке повтора отсутствует rgs_url');
  const endpoint = new URL(/^https?:\/\//i.test(host) ? host : `https://${host}`);
  if (endpoint.username || endpoint.password || endpoint.search || endpoint.hash || !(endpoint.protocol === 'https:' || endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname))) throw new Error('Некорректный адрес повтора');
  const mode = mathMode(params.get('mode'));
  const amount = params.get('amount');
  const betMicro = amount === null ? API_SCALE : apiAmount(Number(amount), 'ставки повтора', true);
  const currency = params.get('currency') ?? 'USD';
  if (!/^[A-Z0-9]{2,10}$/.test(currency)) throw new Error('Некорректная валюта повтора');
  const response = await request(`${endpoint.href.replace(/\/$/, '')}/bet/replay/${required('game')}/${required('version')}/${mode}/${required('event')}`, { credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error('Не удалось загрузить повтор раунда');
  const data = await response.json();
  if (!data || data.costMultiplier !== MODE_COST[mode] || typeof data.payoutMultiplier !== 'number' || !Number.isFinite(data.payoutMultiplier) || data.payoutMultiplier < 0) throw new Error('Повтор не соответствует математике игры');
  return { state: data.state, mode, betMicro, currency, payoutMultiplier: data.payoutMultiplier };
}
