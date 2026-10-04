import test from 'node:test';
import assert from 'node:assert/strict';
import { english, formatAmount, formatNumber, localizeMessage, resolveLanguage, symbolLabel, translate, wildLabel } from './locale';
import { SYMBOLS, WILD_ORDER, WILD_TYPES } from './engine';
import type { TranslationKey } from './locale';

test('supported launch parameters choose English or Russian while other session parameters stay irrelevant', () => {
  assert.equal(resolveLanguage('?lang=en&sessionID=token&rgs_url=https%3A%2F%2Fexample.test'), 'en');
  assert.equal(resolveLanguage('?language=en'), 'en');
  assert.equal(resolveLanguage('?lang=ru&language=en'), 'ru');
  assert.equal(resolveLanguage('?lang=invalid&language=en'), 'en');
  assert.equal(resolveLanguage('?language=RU'), 'ru');
  for (const query of ['', '?lang=de', '?lang=', '?sessionID=en', '?lang=constructor']) assert.equal(resolveLanguage(query), 'en', 'Unsupported or absent language uses the English approval fallback');
});

test('English covers the entire UI dictionary and preserves every dynamic placeholder', () => {
  for (const [source, destination] of Object.entries(english)) {
    assert.ok(destination.trim().length, `Empty translation: ${source}`);
    assert.equal(/[А-Яа-яЁё]/.test(destination), false, `Russian leaked into English: ${source}`);
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    assert.deepEqual(placeholders(destination), placeholders(source), `Lost placeholder: ${source}`);
    assert.equal(translate(source as TranslationKey, 'ru'), source);
  }
  assert.equal(translate('{p0}: барабан {p1}, {p2}×', 'en', { p0: 'Storm', p1: 2, p2: '2, 3, 4' }), 'Storm: reel 2, 2, 3, 4×');
  assert.equal(translate('Линия {p0}', 'ru', { p0: 19 }), 'Линия 19');
});

test('display labels and decimal formatting change language without changing mathematical symbols', () => {
  const before = JSON.stringify({ SYMBOLS, WILD_TYPES });
  for (const symbol of SYMBOLS) {
    assert.equal(symbolLabel(symbol.id, 'ru'), symbol.label);
    assert.equal(/[А-Яа-яЁё]/.test(symbolLabel(symbol.id, 'en')), false);
    assert.notEqual(symbolLabel(symbol.id, 'en'), symbol.id);
  }
  assert.deepEqual(WILD_ORDER.map(type => wildLabel(type, 'en')), ['Storm', 'Corsair', 'Captain', 'Kraken']);
  assert.equal(symbolLabel('scatter', 'en'), 'Black Spot · Scatter');
  assert.equal(symbolLabel('constructor', 'en'), 'constructor');
  assert.equal(formatAmount(1234.56789, 'en'), '1,234.56789');
  assert.equal(formatAmount(1234.5, 'ru').replace(/\u00a0|\u202f/g, ' '), '1 234,50');
  assert.equal(formatNumber(.5, {}, 'ru'), '0,5');
  assert.equal(formatNumber(96, { minimumFractionDigits: 2 }, 'en'), '96.00');
  assert.equal(JSON.stringify({ SYMBOLS, WILD_TYPES }), before);
});

test('visible session errors translate without exposing untranslated internal messages or changing recovery meaning', () => {
  assert.equal(localizeMessage('Недостаточно средств', 'en'), 'Insufficient funds');
  assert.equal(localizeMessage('Ответ сервера не получен. Ставка не будет отправлена повторно', 'en'), 'No server response. The bet will not be submitted again');
  assert.equal(localizeMessage('Повреждён исход: test', 'en'), 'The request could not be completed. Check the session status.');
  assert.equal(localizeMessage('Повреждён исход: test', 'ru'), 'Повреждён исход: test');
  assert.equal(localizeMessage('Connection interrupted', 'en'), 'Connection interrupted');
  assert.equal(localizeMessage('toString', 'en'), 'toString');
});

test('zero bonus result has neutral Russian, English and social text', () => {
  assert.equal(translate('Итог рейда', 'ru'), 'Итог рейда');
  assert.equal(translate('Итог рейда', 'en'), 'Raid result');
  assert.equal(translate('Итог рейда', 'ru', {}, true), 'Raid result');
  assert.equal(translate('Итог рейда: {p0} {p1}', 'en', { p0: '0.00', p1: 'SC' }, true), 'Raid result: 0.00 SC');
});
