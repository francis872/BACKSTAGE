const test = require('node:test');
const assert = require('node:assert/strict');
const { applyScenario, evaluateScenario } = require('../spatial/riskScenarios');

const inputs = { dryness: 0.4, temperature: 0.4, wind: 0.4, vegetationFuel: 0.4, slope: 0.4, humidity: 0.4 };
const geometry = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] };

test('aplica cambios y limita las variables al intervalo unitario', () => {
  assert.deepEqual(applyScenario({ low: 0.1, high: 0.9 }, { low: -0.4, high: 0.5 }), { low: 0, high: 1 });
});

test('compara el riesgo base y el escenario por celda', () => {
  const result = evaluateScenario({ hazard: 'wildfire', cells: [{ id: 'a', geometry, inputs }], changes: { dryness: 0.4 } });
  assert.equal(result.type, 'FeatureCollection');
  assert.equal(result.features.length, 1);
  assert.ok(result.features[0].properties.delta > 0);
  assert.equal(result.metadata.deltaMean, result.features[0].properties.delta);
  assert.match(result.metadata.advisory, /no pronóstico/);
});

test('valida amenaza y cantidad de celdas', () => {
  assert.throws(() => evaluateScenario({ hazard: 'storm', cells: [{ geometry, inputs }] }), /hazard/);
  assert.throws(() => evaluateScenario({ hazard: 'wildfire', cells: [] }), /entre 1 y 2500/);
});
