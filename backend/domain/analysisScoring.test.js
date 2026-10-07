const test = require('node:test');
const assert = require('node:assert/strict');
const { buildDimensionScores } = require('../services/analysis.service');

test('no crea puntajes cuando faltan métricas territoriales', () => {
  assert.deepEqual(buildDimensionScores({}), {});
  assert.deepEqual(buildDimensionScores({
    flood_risk: null,
    landslide_risk: null,
    crime_risk: null,
    climate_exposure: null,
  }), {});
});

test('conserva valores observados de cero y distingue cero de ausencia', () => {
  const scores = buildDimensionScores({
    population_total_zone: 0,
    poi_count_1200m: 0,
    competitor_distance_m: 0,
    own_store_distance_m: 0,
    flood_risk: 0,
  });

  assert.equal(scores.population_potential, 0);
  assert.equal(scores.accessibility, 0);
  assert.equal(scores.competition_intensity, 0);
  assert.equal(scores.cannibalization, 0);
  assert.equal(scores.territorial_risk, 100);
});