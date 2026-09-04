const test = require('node:test');
const assert = require('node:assert/strict');
const {
  riskFromComponents, expectedLoss, classifyProbabilityImpact,
  monteCarloSimulate, stressTest, geographicConcentration,
} = require('../risk');

test('riskFromComponents: golden case threat=exposure=vulnerability=0.5 => risk=0.125', () => {
  const { risk } = riskFromComponents({ threat: 0.5, exposure: 0.5, vulnerability: 0.5 });
  assert.equal(risk, 0.125);
});

test('riskFromComponents: rejects values outside [0,1]', () => {
  assert.throws(() => riskFromComponents({ threat: 1.5, exposure: 0.5, vulnerability: 0.5 }));
  assert.throws(() => riskFromComponents({ threat: -0.1, exposure: 0.5, vulnerability: 0.5 }));
});

test('expectedLoss: golden case probability 0.2 x impact 100000 = 20000', () => {
  assert.equal(expectedLoss(0.2, 100000), 20000);
});

test('classifyProbabilityImpact: golden low/low case', () => {
  const { probabilityLabel, impactLabel } = classifyProbabilityImpact(0.1, 5000);
  assert.equal(probabilityLabel, 'baja');
  assert.equal(impactLabel, 'menor');
});

test('classifyProbabilityImpact: golden high/severe case', () => {
  const { probabilityLabel, impactLabel } = classifyProbabilityImpact(0.9, 5000000);
  assert.equal(probabilityLabel, 'muy alta');
  assert.equal(impactLabel, 'severo');
});

test('monteCarloSimulate: is reproducible given the same seed', () => {
  const config = {
    factors: { loss: { mean: 100, stdDev: 15 } },
    combine: (sample) => sample.loss,
    iterations: 2000,
    seed: 7,
  };
  const run1 = monteCarloSimulate(config);
  const run2 = monteCarloSimulate(config);
  assert.deepEqual(run1, run2);
});

test('monteCarloSimulate: different seeds produce different results', () => {
  const base = { factors: { loss: { mean: 100, stdDev: 15 } }, combine: (s) => s.loss, iterations: 2000 };
  const run1 = monteCarloSimulate({ ...base, seed: 1 });
  const run2 = monteCarloSimulate({ ...base, seed: 2 });
  assert.notEqual(run1.mean, run2.mean);
});

test('monteCarloSimulate: percentiles are ordered p5 <= p50 <= p95', () => {
  const result = monteCarloSimulate({
    factors: { loss: { mean: 500, stdDev: 50 } },
    combine: (s) => s.loss,
    iterations: 5000,
    seed: 3,
  });
  assert.ok(result.p5 <= result.p50);
  assert.ok(result.p50 <= result.p95);
});

test('monteCarloSimulate: rejects out-of-range iteration counts (resource limit)', () => {
  assert.throws(() => monteCarloSimulate({
    factors: { loss: { mean: 1, stdDev: 1 } }, combine: (s) => s.loss, iterations: 1,
  }));
  assert.throws(() => monteCarloSimulate({
    factors: { loss: { mean: 1, stdDev: 1 } }, combine: (s) => s.loss, iterations: 1e9,
  }));
});

test('stressTest: multiplier increases risk and is capped at 1 per component', () => {
  const [result] = stressTest(
    { threat: 0.5, exposure: 0.5, vulnerability: 0.5 },
    [{ name: 'shock', threatMultiplier: 3 }]
  );
  assert.equal(result.threat, 1); // capped
  assert.equal(result.risk, 0.25); // 1 * 0.5 * 0.5
});

test('geographicConcentration: two equal-share groups give HHI = 0.5', () => {
  const { herfindahlIndex, shares } = geographicConcentration([
    { group: 'Bogotá', value: 1000 },
    { group: 'Medellín', value: 1000 },
  ]);
  assert.equal(herfindahlIndex, 0.5);
  assert.equal(shares.length, 2);
});

test('geographicConcentration: single group gives maximum concentration (HHI = 1)', () => {
  const { herfindahlIndex } = geographicConcentration([{ group: 'Bogotá', value: 500 }]);
  assert.equal(herfindahlIndex, 1);
});

test('geographicConcentration: rejects items without group/value', () => {
  assert.throws(() => geographicConcentration([{ value: 100 }]));
});
