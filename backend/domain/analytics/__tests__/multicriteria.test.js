const test = require('node:test');
const assert = require('node:assert/strict');
const {
  weightedSum, topsis, ahpWeights, sensitivityAnalysis, normalizeWeights,
} = require('../multicriteria');

const alternatives = [
  { name: 'A', criteria: { cost: 100, quality: 9 } },
  { name: 'B', criteria: { cost: 200, quality: 5 } },
  { name: 'C', criteria: { cost: 150, quality: 7 } },
];
const weights = { cost: 0.5, quality: 0.5 };
const directions = { cost: 'cost', quality: 'benefit' };

test('normalizeWeights: weights always sum to 1', () => {
  const normalized = normalizeWeights({ a: 2, b: 2, c: 4 }, ['a', 'b', 'c']);
  const total = Object.values(normalized).reduce((acc, v) => acc + v, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
});

test('normalizeWeights: rejects missing criteria', () => {
  assert.throws(() => normalizeWeights({ a: 1 }, ['a', 'b']));
});

test('normalizeWeights: rejects negative weights', () => {
  assert.throws(() => normalizeWeights({ a: -1, b: 2 }, ['a', 'b']));
});

test('weightedSum: alternative that dominates on both criteria wins (golden case)', () => {
  const result = weightedSum(alternatives, weights, { directions });
  assert.equal(result.ranking[0].name, 'A');
  assert.equal(result.ranking[0].rank, 1);
  // scores stay within a sane 0-100 percentage range
  result.ranking.forEach((row) => {
    assert.ok(row.scoreTotal >= 0 && row.scoreTotal <= 100);
  });
});

test('weightedSum: throws on missing criterion values', () => {
  const broken = [
    { name: 'A', criteria: { cost: 100, quality: 9 } },
    { name: 'B', criteria: { cost: null, quality: 5 } },
  ];
  assert.throws(() => weightedSum(broken, weights, { directions }));
});

test('weightedSum: throws when alternatives have mismatched criteria sets', () => {
  const broken = [
    { name: 'A', criteria: { cost: 100, quality: 9 } },
    { name: 'B', criteria: { cost: 200 } },
  ];
  assert.throws(() => weightedSum(broken, weights, { directions }));
});

test('topsis: dominant alternative wins and closeness is within [0,1]*100', () => {
  const result = topsis(alternatives, weights, { directions });
  assert.equal(result.ranking[0].name, 'A');
  result.ranking.forEach((row) => {
    assert.ok(row.scoreTotal >= 0 && row.scoreTotal <= 100.0001);
  });
});

test('topsis: ranking is a strict permutation (no duplicate ranks, correct count)', () => {
  const result = topsis(alternatives, weights, { directions });
  const ranks = result.ranking.map((r) => r.rank).sort((a, b) => a - b);
  assert.deepEqual(ranks, [1, 2, 3]);
});

test('ahpWeights: golden 3x3 Saaty-style matrix produces weights summing to 1 and a numeric CR', () => {
  const matrix = [
    [1, 3, 5],
    [1 / 3, 1, 3],
    [1 / 5, 1 / 3, 1],
  ];
  const result = ahpWeights(matrix, ['price', 'location', 'size']);
  const total = Object.values(result.weights).reduce((acc, v) => acc + v, 0);
  assert.ok(Math.abs(total - 1) < 1e-6);
  // "price" was preferred over both other criteria in every comparison,
  // so it must receive the highest weight.
  assert.ok(result.weights.price > result.weights.location);
  assert.ok(result.weights.location > result.weights.size);
  assert.equal(typeof result.consistencyRatio, 'number');
});

test('ahpWeights: rejects non-square or wrongly-sized matrices', () => {
  assert.throws(() => ahpWeights([[1, 2], [0.5, 1], [1, 1]], ['a', 'b']));
});

test('ahpWeights: rejects non-positive entries', () => {
  assert.throws(() => ahpWeights([[1, -2], [0.5, 1]], ['a', 'b']));
});

test('sensitivityAnalysis: reports stability and never crashes on the golden case', () => {
  const result = sensitivityAnalysis(alternatives, weights, { directions, method: 'topsis', perturbationPct: 0.2 });
  assert.equal(result.baseWinner, 'A');
  assert.equal(result.scenarios.length, 4); // 2 criteria x 2 directions
  assert.equal(typeof result.stability.stable, 'boolean');
});
