const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOpportunityRanking } = require('./opportunities');

test('agrupa factores, calcula promedio y ordena oportunidades', () => {
  const rows = [
    { location_id: 1, location_name: 'A', category: 'demand', factor_score: '80', score_id: 1 },
    { location_id: 1, location_name: 'A', category: 'access', factor_score: '100', score_id: 2 },
    { location_id: 2, location_name: 'B', category: 'demand', factor_score: '70', score_id: 3 },
  ];
  const result = buildOpportunityRanking(rows);
  assert.equal(result[0].location_id, 1); assert.equal(result[0].opportunity_score, 90); assert.equal(result[0].factor_count, 2); assert.equal(result[0].rank, 1);
});

test('descarta factores inválidos sin fabricar valores', () => {
  assert.deepEqual(buildOpportunityRanking([{ location_id: 1, factor_score: 120 }]), []);
});
