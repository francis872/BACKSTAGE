const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAssessmentInput, classifyAssessment } = require('./riskAssessment');

test('normaliza una evaluación y calcula su promedio reproducible', () => {
  const result = normalizeAssessmentInput({ location_id: 7, flood_risk: 0, landslide_risk: 0.2, crime_risk: 0.4, climate_exposure: 0.6, data_mode: 'measured', confidence: 0.9 }, { requireLocation: true });
  assert.equal(result.location_id, 7); assert.equal(result.flood_risk, 0); assert.equal(result.score, 0.3);
  assert.equal(result.details.model, 'arithmetic-mean-v1'); assert.equal(result.details.confidence, 0.9);
});

test('rechaza indicadores incompletos o fuera del intervalo', () => {
  assert.throws(() => normalizeAssessmentInput({ location_id: 1, flood_risk: 2 }, { requireLocation: true }), /flood_risk/);
  assert.throws(() => normalizeAssessmentInput({ location_id: 1, flood_risk: 0.1, landslide_risk: 0.2, crime_risk: 0.3 }), /climate_exposure/);
});

test('clasifica el puntaje con bandas operativas', () => {
  assert.equal(classifyAssessment({ score: 0.1 }), 'low'); assert.equal(classifyAssessment({ score: 0.45 }), 'high'); assert.equal(classifyAssessment({ score: 0.8 }), 'critical');
});
