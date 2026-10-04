import { COMPASS_MATH_VERSION, COMPASS_MODE, decodeCompassBook, type CompassWireBook } from './compass-contract';
import { decodeBookPage, randomWeight, selectBookId } from './math/local';
import type { LocalMathCatalog } from './math/types';

export type CompassCatalog = Omit<LocalMathCatalog, 'mode'> & { mode: typeof COMPASS_MODE };
let catalog: Promise<CompassCatalog> | undefined;
const pages = new Map<number, Promise<CompassWireBook[]>>();
const runtimeBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
function url(path: string) {
  const value = `${runtimeBase.endsWith('/') ? runtimeBase : `${runtimeBase}/`}alchemist/math/${COMPASS_MODE}/${path}?v=${COMPASS_MATH_VERSION}`;
  return typeof document === 'undefined' ? value : new URL(value, document.baseURI).href;
}
export function validateCompassCatalog(value: CompassCatalog): void {
  if (value?.version !== COMPASS_MATH_VERSION || value.mode !== COMPASS_MODE || value.cost !== 100
    || !Number.isSafeInteger(value.pageSize) || value.pageSize < 1 || value.pageSize > 1024
    || !Array.isArray(value.entries) || value.entries.length < 100_000) throw Error('Invalid Compass catalog');
  let mass = 0n, payout = 0n;
  for (const row of value.entries) {
    if (!Array.isArray(row) || row.length !== 2 || !Number.isSafeInteger(row[0]) || row[0] < 1
      || !Number.isSafeInteger(row[1]) || row[1] < 0 || row[1] > 1_500_000 || row[1] % 10) throw Error('Invalid Compass lookup');
    mass += BigInt(row[0]); payout += BigInt(row[0]) * BigInt(row[1]);
  }
  if (mass !== 1_000_000_000_000_000n || Number(mass) !== value.totalWeight || payout !== 9600n * mass) throw Error('Invalid Compass exact RTP/weight sum');
}
export function loadCompassCatalog(): Promise<CompassCatalog> {
  return catalog ??= (async () => {
    const response = await fetch(url('catalog.json'));
    if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw Error('Не удалось загрузить математику игры');
    const value: CompassCatalog = await response.json();
    validateCompassCatalog(value); return value;
  })().catch(error => { catalog = undefined; throw error; });
}
export async function sampleCompassBook(): Promise<CompassWireBook> {
  const table = await loadCompassCatalog();
  // Selection is identical to the five published modes: unbiased integer ticket
  // into actual calibrated weights, never board RNG or a staged visual result.
  const id = selectBookId(table as unknown as LocalMathCatalog, randomWeight(table.totalWeight));
  const page = Math.floor((id - 1) / table.pageSize);
  let pending = pages.get(page);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(url(`books-${String(page).padStart(5, '0')}.json.gz`));
      if (!response.ok || response.headers.get('content-type')?.includes('text/html')) throw Error('Не удалось загрузить исход раунда');
      return await decodeBookPage(await response.arrayBuffer()) as unknown as CompassWireBook[];
    })().catch(error => { pages.delete(page); throw error; });
    pages.set(page, pending);
    if (pages.size > 12) pages.delete(pages.keys().next().value!);
  }
  const book = (await pending)[(id - 1) % table.pageSize];
  if (!book || book.id !== id || book.payoutMultiplier !== table.entries[id - 1][1]) throw Error('Compass outcome/lookup mismatch');
  decodeCompassBook(book);
  return structuredClone(book);
}
