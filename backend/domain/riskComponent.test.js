const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRiskComponent, canonicalComponentType } = require('./riskComponent');

test('normaliza un componente y conserva el puntaje cero', () => {
  assert.deepEqual(normalizeRiskComponent({ risk_id: '4', component_type: 'Threat', component_score: '0', notes: ' Evidencia ' }), { risk_id: 4, component_type: 'threat', component_score: 0, notes: 'Evidencia' });
});

test('migra aliases heredados a la dimensión de amenaza', () => {
  assert.equal(canonicalComponentType('Flood'), 'threat');
  assert.equal(normalizeRiskComponent({ risk_id: 2, component_type: 'Crime', component_score: 0.4 }).component_type, 'threat');
});

test('rechaza tipos desconocidos y puntajes fuera de rango', () => {
  assert.throws(() => normalizeRiskComponent({ risk_id: 1, component_type: 'other', component_score: 0.2 }), /component_type/);
  assert.throws(() => normalizeRiskComponent({ risk_id: 1, component_type: 'threat', component_score: 3 }), /component_score/);
});
