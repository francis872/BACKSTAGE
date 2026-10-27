const test = require('node:test');
const assert = require('node:assert/strict');
const analysisRepository = require('../repositories/analysis.repository');
const analyticsJobsRepository = require('../repositories/analyticsJobs.repository');

process.env.NODE_ENV = 'test';
process.env.SPATIAL_STORE = 'memory';
process.env.JWT_SECRET = 'territorial-comparison-test-secret-32-characters';

const identityModule=require('../services/mongoIdentity.service');
Object.assign(identityModule.service,identityModule.createMongoIdentityService(require('./helpers/fakeIdentityMongo').fakeIdentityMongo()));
const documentFixture=require('./helpers/soiMongoMemoryFixture').fixture();
const mongo=require('../infrastructure/soiMongo');
mongo.getMongoDatabase=async()=>documentFixture.options.database;mongo.nextId=documentFixture.options.nextId;mongo.withMongoTransaction=documentFixture.options.transaction;
Object.assign(require('../infrastructure/atlasDocuments'),{nextId:mongo.nextId,withMongoTransaction:mongo.withMongoTransaction});
const app = require('../index');

test('POST /analysis/compare runs TOPSIS for three resolved cities and persists the result', async (context) => {
  const originalMethods = {
    computeCandidateMetrics: analysisRepository.computeCandidateMetrics,
    createAnalysisRun: analysisRepository.createAnalysisRun,
    replaceAnalysisResults: analysisRepository.replaceAnalysisResults,
    setAnalysisRecommendation: analysisRepository.setAnalysisRecommendation,
    createJob: analyticsJobsRepository.createJob,
    completeJob: analyticsJobsRepository.completeJob,
    failJob: analyticsJobsRepository.failJob,
  };
  const evidenceByCity = {
    Medellín: { population_total_zone: 120000, poi_count_1200m: 12, competitor_distance_m: 2100, own_store_distance_m: 2600, flood_risk: 0.12, landslide_risk: 0.18, crime_risk: 0.22, climate_exposure: 0.15 },
    Bogotá: { population_total_zone: 200000, poi_count_1200m: 9, competitor_distance_m: 1700, own_store_distance_m: 1800, flood_risk: 0.2, landslide_risk: 0.1, crime_risk: 0.3, climate_exposure: 0.22 },
    Cali: { population_total_zone: 85000, poi_count_1200m: 8, competitor_distance_m: 2900, own_store_distance_m: 3100, flood_risk: 0.1, landslide_risk: 0.14, crime_risk: 0.24, climate_exposure: 0.18 },
  };
  const persistedRuns = new Map();
  const analyticsJobs = new Map();
  const insertedResults = new Map();
  let nextRunId = 700;
  let nextJobId = 900;

  analysisRepository.computeCandidateMetrics = async ({ city }) => evidenceByCity[city];
  analysisRepository.createAnalysisRun = async (input) => {
    const run = {
      analysis_run_id: nextRunId++,
      project_name: input.projectName,
      city: input.city,
      organization_id: input.organizationId,
      metadata: input.metadata,
      created_at: new Date().toISOString(),
    };
    persistedRuns.set(run.analysis_run_id, run);
    insertedResults.set(run.analysis_run_id, []);
    return run;
  };
  analysisRepository.replaceAnalysisResults = async ({ analysisRunId, ranked }) => {
    insertedResults.set(analysisRunId, ranked);
  };
  analysisRepository.setAnalysisRecommendation = async (analysisRunId, text, payload) => {
    const run = persistedRuns.get(analysisRunId);
    run.recommendation = text;
    run.recommendation_payload = payload;
  };
  analyticsJobsRepository.createJob = async (input) => {
    const job = { analytics_job_id: nextJobId++, status: 'running', ...input };
    analyticsJobs.set(job.analytics_job_id, job);
    return job;
  };
  analyticsJobsRepository.completeJob = async (id, payload) => {
    Object.assign(analyticsJobs.get(id), payload, { status: 'succeeded' });
  };
  analyticsJobsRepository.failJob = async (id, payload) => {
    Object.assign(analyticsJobs.get(id), payload, { status: 'failed' });
  };

  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    Object.assign(analysisRepository, {
      computeCandidateMetrics: originalMethods.computeCandidateMetrics,
      createAnalysisRun: originalMethods.createAnalysisRun,
      replaceAnalysisResults: originalMethods.replaceAnalysisResults,
      setAnalysisRecommendation: originalMethods.setAnalysisRecommendation,
    });
    Object.assign(analyticsJobsRepository, {
      createJob: originalMethods.createJob,
      completeJob: originalMethods.completeJob,
      failJob: originalMethods.failJob,
    });
    server.close();
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const email = `territory-${Date.now()}@example.test`;

  const registration = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Comparison Owner', email, password: 'valid-test-password', organization_name: 'Comparison Workspace' }),
  });
  assert.equal(registration.status, 201);
  const session = await registration.json();

  const response = await fetch(`${baseUrl}/analysis/compare`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_name: 'Comparar Medellín, Bogotá y Cali',
      ranking_method: 'topsis',
      candidates: [
        { name: 'Medellín', city: 'Medellín', lat: 6.2442, lng: -75.5812, source: 'test territory resolver' },
        { name: 'Bogotá', city: 'Bogotá', lat: 4.711, lng: -74.0721, source: 'test territory resolver' },
        { name: 'Cali', city: 'Cali', lat: 3.4516, lng: -76.532, source: 'test territory resolver' },
      ],
    }),
  });
  assert.equal(response.status, 201);
  const comparison = await response.json();

  assert.equal(comparison.ranking_method, 'topsis');
  assert.equal(comparison.ranking.length, 3);
  assert.equal(comparison.pairwise.length, 3);
  assert.ok(comparison.recommendation);
  assert.ok(comparison.analysis_run_id);
  assert.equal(analyticsJobs.get(comparison.analytics_job_id).algorithmName, 'multicriteria.topsis');
  assert.equal(analyticsJobs.get(comparison.analytics_job_id).status, 'succeeded');
  assert.equal(insertedResults.get(comparison.analysis_run_id).length, 3);
  assert.deepEqual(
    persistedRuns.get(comparison.analysis_run_id).metadata.comparison_candidates.map((candidate) => candidate.name),
    ['Medellín', 'Bogotá', 'Cali']
  );
  assert.equal(persistedRuns.get(comparison.analysis_run_id).recommendation, comparison.recommendation);
});
