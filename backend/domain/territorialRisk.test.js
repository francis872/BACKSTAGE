const test = require('node:test');
const assert = require('node:assert/strict');

const { classify, evaluateRisk } = require('../spatial/riskModels');

test('clasifica los umbrales de riesgo de forma determinista', () => {
  assert.equal(classify(0.19), 'very_low');
  assert.equal(classify(0.2), 'low');
  assert.equal(classify(0.6), 'high');
  assert.equal(classify(0.8), 'critical');
});

test('calcula incendio con contribuciones explicables', () => {
  const result = evaluateRisk({
    dataMode: 'measured', confidence: 0.9,
    wildfire: { dryness: 1, temperature: 1, wind: 1, vegetationFuel: 1, slope: 1, humidity: 0 },
  });
  assert.equal(result.hazards.wildfire.score, 1);
  assert.equal(result.hazards.wildfire.classification, 'critical');
  assert.equal(result.hazards.wildfire.contributions.humidity.normalized, 1);
  assert.equal(result.confidence, 0.9);
});

test('combina amenazas sin confundir confianza con riesgo', () => {
  const result = evaluateRisk({
    confidence: 0.2,
    flood: { rainfall: 0.5, drainageDeficit: 0.5, riverProximity: 0.5, impermeability: 0.5, soilSaturation: 0.5, relativeElevation: 0.5 },
    landslide: { slope: 0.5, rainfall: 0.5, soilSaturation: 0.5, geologySusceptibility: 0.5, vegetationLoss: 0.5, seismicity: 0.5 },
  });
  assert.equal(result.hazards.flood.score, 0.5);
  assert.equal(result.hazards.landslide.score, 0.5);
  assert.equal(result.combined.score, 0.75);
  assert.equal(result.confidence, 0.2);
});

test('rechaza entradas incompletas, fuera de rango o modos inválidos', () => {
  assert.throws(() => evaluateRisk({ wildfire: { dryness: 0.5 } }), /temperature/);
  assert.throws(() => evaluateRisk({ flood: { rainfall: 2 } }), /rainfall/);
  assert.throws(() => evaluateRisk({ dataMode: 'official' }), /dataMode/);
});
