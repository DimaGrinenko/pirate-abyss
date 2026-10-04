import { MATH_VERSION, MODE_COST } from './config';
import { MATH_MODES } from './types';
import type { LocalMathCatalog, MathBook, MathMode } from './types';

const catalogs = new Map<MathMode, Promise<LocalMathCatalog>>();
const pages = new Map<string, Promise<MathBook[]>>();
const runtimeBase = (import.meta as ImportMeta & { env?: { BASE_URL?: string } }).env?.BASE_URL ?? './';
const baseUrl = `${runtimeBase.endsWith('/') ? runtimeBase : `${runtimeBase}/`}alchemist/math`;

/** Unbiased integer sampling; this is only for the offline credit preview. */
export function randomWeight(total: number): number {
  if (!Number.isSafeInteger(total) || total <= 0) throw new Error('Invalid weight total');
  const limit = Math.floor(2 ** 53 / total) * total;
  const values = new Uint32Array(2);
  for (;;) {
    crypto.getRandomValues(values);
    const n = (values[0] & 0x1fffff) * 2 ** 32 + values[1];
    if (n < limit) return n % total;
  }
}

export function validateCatalog(value: LocalMathCatalog, mode: MathMode): void {
  if (value?.version !== MATH_VERSION || value.mode !== mode || value.cost !== MODE_COST[mode]
    || !Number.isInteger(value.pageSize) || value.pageSize < 1 || value.pageSize > 1024
    || !Array.isArray(value.entries) || value.entries.length < 1) throw new Error('Неверная версия математики');
  let sum = 0;
  for (const entry of value.entries) {
    if (!Array.isArray(entry) || entry.length !== 2 || !Number.isSafeInteger(entry[0]) || entry[0] <= 0
      || !Number.isSafeInteger(entry[1]) || entry[1] < 0 || entry[1] > 1_500_000 || entry[1] % 10 !== 0) throw new Error('Повреждена таблица вероятностей');
    sum += entry[0];
    if (!Number.isSafeInteger(sum)) throw new Error('Weight total overflow');
  }
  if (sum !== value.totalWeight) throw new Error('Неверная сумма весов');
}

export function selectBookId(catalog: LocalMathCatalog, ticket: number): number {
  if (!Number.isSafeInteger(ticket) || ticket < 0 || ticket >= catalog.totalWeight) throw new Error('Invalid selection ticket');
  let upper = 0;
  for (let i = 0; i < catalog.entries.length; i++) {
    upper += catalog.entries[i][0];
    if (ticket < upper) return i + 1;
  }
  throw new Error('Selection outside lookup table');
}

/** HTTP may already decode a .gz response when Content-Encoding is present. */
export async function decodeBookPage(buffer: ArrayBuffer): Promise<MathBook[]> {
  const bytes = new Uint8Array(buffer);
  const gzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const data: unknown = gzip
    ? await new Response(new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'))).json()
    : JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer));
  if (!Array.isArray(data)) throw new Error('Повреждён исход раунда');
  return data as MathBook[];
}

function mathFile(path: string): string {
  const relative = `${baseUrl}/${path}`;
  return typeof document === 'undefined' ? relative : new URL(relative, document.baseURI).href;
}

export function loadMathCatalog(mode: MathMode): Promise<LocalMathCatalog> {
  if (!MATH_MODES.includes(mode)) return Promise.reject(new Error('Unknown math mode'));
  let pending = catalogs.get(mode);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(mathFile(`${mode}/catalog.json?v=${MATH_VERSION}`));
      if (!response.ok) throw new Error('Не удалось загрузить математику игры');
      const data: LocalMathCatalog = await response.json();
      validateCatalog(data, mode);
      return data;
    })().catch(error => { catalogs.delete(mode); throw error; });
    catalogs.set(mode, pending);
  }
  return pending;
}

export async function samplePublishedBook(mode: MathMode): Promise<MathBook> {
  const catalog = await loadMathCatalog(mode);
  const id = selectBookId(catalog, randomWeight(catalog.totalWeight));
  const page = Math.floor((id - 1) / catalog.pageSize);
  const key = `${mode}/books-${String(page).padStart(5, '0')}.json.gz`;
  let pending = pages.get(key);
  if (!pending) {
    pending = (async () => {
      const response = await fetch(mathFile(`${key}?v=${MATH_VERSION}`));
      if (!response.ok) throw new Error('Не удалось загрузить исход раунда');
      return decodeBookPage(await response.arrayBuffer());
    })().catch(error => { pages.delete(key); throw error; });
    pages.set(key, pending);
    if (pages.size > 12) pages.delete(pages.keys().next().value!);
  }
  const book = (await pending)[(id - 1) % catalog.pageSize];
  if (!book || book.id !== id || book.payoutMultiplier !== catalog.entries[id - 1][1]) throw new Error('Исход не соответствует математике');
  return structuredClone(book);
}
