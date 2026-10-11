const test = require('node:test');
const assert = require('node:assert/strict');
const database = require('../db');
const analysisService = require('../services/analysis.service');
const analysisRepository = require('../repositories/analysis.repository');
const analyticsJobsRepository = require('../repositories/analyticsJobs.repository');

test('comparison with missing evidence returns 422 before ranking jobs or analysis persistence', async (context) => {
  const original = {
    buildCandidateFromCoordinates: analysisRepository.buildCandidateFromCoordinates,
    computeCandidateMetrics: analysisRepository.computeCandidateMetrics,
    createAnalysisRun: analysisRepository.createAnalysisRun,
    createJob: analyticsJobsRepository.createJob,
  };
  let jobCount = 0;
  let runCount = 0;
  analysisRepository.buildCandidateFromCoordinates = async ({ name, city, lat, lng }) => ({
    name, city, latitude: lat, longitude: lng, location_id: null,
  });
  analysisRepository.computeCandidateMetrics = async () => ({
    population_total_zone: null,
    poi_count_1200m: null,
    competitor_distance_m: null,
    own_store_distance_m: null,
    flood_risk: null,
    landslide_risk: null,
    crime_risk: null,
    climate_exposure: null,
  });
  analysisRepository.createAnalysisRun = async () => { runCount += 1; };
  analyticsJobsRepository.createJob = async () => { jobCount += 1; };
  context.after(() => {
    Object.assign(analysisRepository, {
      buildCandidateFromCoordinates: original.buildCandidateFromCoordinates,
      computeCandidateMetrics: original.computeCandidateMetrics,
      createAnalysisRun: original.createAnalysisRun,
    });
    analyticsJobsRepository.createJob = original.createJob;
  });

  await assert.rejects(
    analysisService.compareCandidates({
      candidates: [
        { name: 'Medellín', city: 'Medellín', lat: 6.24, lng: -75.58 },
        { name: 'Bogotá', city: 'Bogotá', lat: 4.71, lng: -74.07 },
        { name: 'Cali', city: 'Cali', lat: 3.45, lng: -76.53 },
      ],
    }, { user_id: 1, organization_id: 9 }, { organization_id: 9 }),
    (error) => {
      assert.equal(error.statusCode, 422);
      assert.match(error.message, /No se generó un ranking/);
      assert.match(error.message, /Medellín.*población del área/);
      assert.match(error.message, /Bogotá.*equipamientos y accesibilidad/);
      assert.match(error.message, /Cali.*exposición climática/);
      return true;
    }
  );
  assert.equal(jobCount, 0);
  assert.equal(runCount, 0);
});

test('candidate metrics distinguish absent coverage from observed zero values', async () => {
  const originalQuery = database.query;
  const repositoryPath = require.resolve('../repositories/analysis.repository');
  const originalRepositoryModule = require.cache[repositoryPath];
  const geometry = {
    type: 'Polygon',
    coordinates: [[[-75.6, 6.2], [-75.5, 6.2], [-75.5, 6.3], [-75.6, 6.3], [-75.6, 6.2]]],
  };
  let hasCoveredZone = false;
  let hasPoiCoverage = false;
  database.query = async (sql) => {
    if (sql.includes('FROM territorial_zones')) {
      return { rows: hasCoveredZone ? [{ geometry, population: 0 }] : [], rowCount: hasCoveredZone ? 1 : 0 };
    }
    if (sql.includes('FROM points_of_interest')) {
      return { rows: hasPoiCoverage ? [{ latitude: 6.2, longitude: -75.6 }] : [], rowCount: hasPoiCoverage ? 1 : 0 };
    }
    return { rows: [], rowCount: 0 };
  };
  delete require.cache[repositoryPath];
  const repository = require('../repositories/analysis.repository');
  try {
    const missingCoverage = await repository.computeCandidateMetrics({ city: null, latitude: 6.24, longitude: -75.55 });
    assert.equal(missingCoverage.population_total_zone, null);
    assert.equal(missingCoverage.poi_count_1200m, null);

    hasCoveredZone = true;
    hasPoiCoverage = true;
    const observedZeros = await repository.computeCandidateMetrics({ city: null, latitude: 6.24, longitude: -75.55 });
    assert.equal(observedZeros.population_total_zone, 0);
    assert.equal(observedZeros.poi_count_1200m, 0);
  } finally {
    database.query = originalQuery;
    delete require.cache[repositoryPath];
    require.cache[repositoryPath] = originalRepositoryModule;
  }
});