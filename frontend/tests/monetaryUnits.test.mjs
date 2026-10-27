import test from 'node:test';
import assert from 'node:assert/strict';
import { toMinorUnits, displayMinorUnits } from '../src/lib/monetaryUnits.mjs';
test('operational money converts decimal text into exact minor units and displays it without binary rounding', () => {
  assert.equal(toMinorUnits('0.29', 2), 29); assert.equal(toMinorUnits('1200.50', 2), 120050);
  assert.equal(displayMinorUnits(120050, 2), '1200.50'); assert.equal(displayMinorUnits(1, 4), '0.0001'); assert.equal(displayMinorUnits(150, 0), '150');
  assert.throws(() => toMinorUnits('0.001', 2)); assert.throws(() => toMinorUnits('1e3', 2)); assert.throws(() => toMinorUnits('9007199254740993', 0));
});
