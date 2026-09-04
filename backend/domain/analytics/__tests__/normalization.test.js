const test = require('node:test');
const assert = require('node:assert/strict');
const {
  minMax, zScore, robustScale, logTransform, winsorize, quantile, median,
} = require('../normalization');

test('minMax: normalizes to [0,1] with correct benefit orientation', () => {
  const { values, constant } = minMax([10, 20, 30]);
  assert.equal(constant, false);
  assert.deepEqual(values, [0, 0.5, 1]);
});

test('minMax: cost orientation inverts the scale', () => {
  const { values } = minMax([10, 20, 30], { direction: 'cost' });
  assert.deepEqual(values, [1, 0.5, 0]);
});

test('minMax: constant series returns flat values and flags constant', () => {
  const benefit = minMax([5, 5, 5], { direction: 'benefit' });
  assert.equal(benefit.constant, true);
  assert.deepEqual(benefit.values, [1, 1, 1]);

  const cost = minMax([5, 5, 5], { direction: 'cost' });
  assert.deepEqual(cost.values, [0, 0, 0]);
});

test('minMax: throws on empty array', () => {
  assert.throws(() => minMax([]));
});

test('minMax: throws on non-numeric values', () => {
  assert.throws(() => minMax([1, 'a', 3]));
});

test('zScore: known values produce known standardized results', () => {
  const { values, mean, stdDev } = zScore([2, 4, 4, 4, 5, 5, 7, 9]);
  assert.equal(mean, 5);
  assert.equal(stdDev, 2);
  assert.deepEqual(values, [-1.5, -0.5, -0.5, -0.5, 0, 0, 1, 2]);
});

test('zScore: constant series returns zeros and flags constant', () => {
  const { values, constant } = zScore([3, 3, 3]);
  assert.equal(constant, true);
  assert.deepEqual(values, [0, 0, 0]);
});

test('robustScale: constant series returns zeros and flags constant', () => {
  const { values, constant } = robustScale([1, 1, 1, 1]);
  assert.equal(constant, true);
  assert.deepEqual(values, [0, 0, 0, 0]);
});

test('robustScale: median is subtracted and scaled by IQR', () => {
  const { median: med, iqr } = robustScale([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.equal(med, 5);
  assert.ok(iqr > 0);
});

test('logTransform: throws for zero or negative values', () => {
  assert.throws(() => logTransform([1, 0, 3]));
  assert.throws(() => logTransform([1, -2, 3]));
});

test('logTransform: correct for positive values', () => {
  const { values } = logTransform([1, Math.E, Math.E ** 2]);
  assert.deepEqual(values.map((v) => Number(v.toFixed(6))), [0, 1, 2]);
});

test('winsorize: clips values outside the requested quantile bounds', () => {
  const { values, lowerBound, upperBound } = winsorize([1, 2, 3, 4, 5, 100], { lowerPct: 0.1, upperPct: 0.9 });
  assert.ok(values.every((v) => v >= lowerBound && v <= upperBound));
  assert.ok(Math.max(...values) < 100);
});

test('winsorize: rejects invalid bounds', () => {
  assert.throws(() => winsorize([1, 2, 3], { lowerPct: 0.9, upperPct: 0.1 }));
});

test('quantile/median: sanity checks against known distributions', () => {
  const sorted = [1, 2, 3, 4, 5];
  assert.equal(median(sorted), 3);
  assert.equal(quantile(sorted, 0), 1);
  assert.equal(quantile(sorted, 1), 5);
  assert.equal(quantile(sorted, 0.5), 3);
});
