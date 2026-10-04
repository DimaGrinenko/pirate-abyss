import test from 'node:test';
import assert from 'node:assert/strict';
import { elapsedSessionSeconds, formatSessionDuration, sessionPositionUnits, showSessionCompliance } from './session-compliance';

test('jurisdiction metadata is opt-in and does not expose replay/demo account figures', () => {
  assert.equal(showSessionCompliance({}, true, false), false);
  assert.equal(showSessionCompliance({ displayRTP: false, displaySessionTimer: false, displayNetPosition: false }, true, false), false);
  for (const flag of ['displayRTP', 'displaySessionTimer', 'displayNetPosition'] as const) {
    assert.equal(showSessionCompliance({ [flag]: true }, true, false), true);
    assert.equal(showSessionCompliance({ [flag]: true }, false, false), false);
    assert.equal(showSessionCompliance({ [flag]: true }, true, true), false);
  }
});

test('session duration catches up after background time without tick accumulation', () => {
  const authenticatedAt = 100_000;
  assert.equal(elapsedSessionSeconds(authenticatedAt, 100_999), 0);
  assert.equal(elapsedSessionSeconds(authenticatedAt, 101_000), 1);
  assert.equal(formatSessionDuration(elapsedSessionSeconds(authenticatedAt, 3_761_000)), '1:01:01');
  assert.equal(formatSessionDuration(86_400), '24:00:00');
  assert.equal(elapsedSessionSeconds(authenticatedAt, 99_000), 0);
});

test('unknown authentication or telemetry never becomes a fabricated zero', () => {
  assert.equal(elapsedSessionSeconds(null, 100_000), null);
  assert.equal(elapsedSessionSeconds(Number.NaN, 100_000), null);
  assert.equal(formatSessionDuration(null), '—');
  assert.equal(sessionPositionUnits(null), null);
  assert.equal(sessionPositionUnits(Number.NaN), null);
  assert.equal(sessionPositionUnits(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(sessionPositionUnits(1.5), null);
});

test('net position preserves signed six-decimal server precision', () => {
  assert.equal(sessionPositionUnits(-1), -.000001);
  assert.equal(sessionPositionUnits(123_456_789), 123.456789);
  assert.equal(sessionPositionUnits(0), 0);
});
