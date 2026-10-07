const test = require('node:test');
const assert = require('node:assert/strict');
const analyticsJobsRepository = require('../repositories/analyticsJobs.repository');

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = '';
process.env.SPATIAL_STORE = 'memory';
process.env.JWT_SECRET = 'mathematical-api-test-secret-32-characters';
process.env.NOMINATIM_BASE_URL = 'https://geocoder.test/search';

const nativeFetch = global.fetch;
global.fetch = async (input, options) => {
  const url = new URL(input);
  if (url.hostname === 'geocoder.test') {
    return {
      ok: true,
      status: 200,
      json: async () => [{
        osm_type: 'relation', osm_id: 1343264, name: 'Medellín',
        display_name: 'Medellín, Antioquia, Colombia', lat: '6.2697324', lon: '-75.6025597',
        boundingbox: ['6.1633051', '6.3764208', '-75.7194283', '-75.4736400'],
        address: { city: 'Medellín', state: 'Antioquia', country: 'Colombia' },
      }],
    };
  }
  return nativeFetch(input, options);
};

const app = require('../index');
global.fetch = nativeFetch;

test('authenticated spatial and terrain APIs execute their mathematical engines', async (context) => {
  const server = app.listen(0, '127.0.0.1');
  const originalJobMethods = {
    createJob: analyticsJobsRepository.createJob,
    completeJob: analyticsJobsRepository.completeJob,
    failJob: analyticsJobsRepository.failJob,
  };
  const analyticsJobs = new Map();
  let nextAnalyticsJobId = 100;
  analyticsJobsRepository.createJob = async (input) => {
    const job = { analytics_job_id: nextAnalyticsJobId++, status: 'running', ...input };
    analyticsJobs.set(job.analytics_job_id, job);
    return job;
  };
  analyticsJobsRepository.completeJob = async (id, input) => {
    const job = analyticsJobs.get(id);
    Object.assign(job, input, { status: 'succeeded' });
    return job;
  };
  analyticsJobsRepository.failJob = async (id, input) => {
    const job = analyticsJobs.get(id);
    Object.assign(job, input, { status: 'failed' });
    return job;
  };
  context.after(() => {
    Object.assign(analyticsJobsRepository, originalJobMethods);
    server.close();
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const request = async (path, { method = 'GET', body, token, expectedStatus = 200 } = {}) => {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const payload = await response.json();
    assert.equal(response.status, expectedStatus, `${method} ${path}: ${JSON.stringify(payload)}`);
    return payload;
  };

  const session = await request('/auth/login', {
    method: 'POST',
    body: { email: 'admin@backstage.local', password: 'test123' },
  });
  const token = session.token;
  assert.ok(token);

  const source = await request('/spatial/sources', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: { provider: 'mathematical-api-test', dataset: 'roads', version: 'test-1', license: 'fixture-only' },
  });
  const roadCoordinates = [[-75.6, 6.2], [-75.599, 6.2], [-75.598, 6.2]];
  await request('/spatial/ingest/geojson', {
    method: 'POST',
    token,
    expectedStatus: 201,
    body: {
      worldId: 'earth',
      sourceId: source._id,
      collection: {
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          properties: { name: 'Fixture road', speedKph: 30 },
          geometry: { type: 'LineString', coordinates: roadCoordinates },
        }],
      },
      minZoom: 8,
      maxZoom: 12,
    },
  });

  const search = await request('/spatial/search?q=Fixture%20road&worldId=earth', { token });
  assert.equal(search.length, 1);
  assert.equal(search[0].properties.name, 'Fixture road');

  const nearby = await request('/spatial/nearby?lng=-75.599&lat=6.2&radiusM=100&worldId=earth', { token });
  assert.equal(nearby.length, 1);
  assert.ok(nearby[0].distanceM < 100);

  const route = await request('/spatial/routes/compute', {
    method: 'POST',
    token,
    body: { start: roadCoordinates[0], end: roadCoordinates[2], algorithm: 'astar', worldId: 'earth' },
  });
  assert.deepEqual(route.geometry.coordinates, roadCoordinates);
  assert.ok(route.distanceM > 200);
  assert.ok(route.durationSeconds > 0);

  const measured = await request('/spatial/measure', {
    method: 'POST',
    token,
    body: { geometry: { type: 'LineString', coordinates: roadCoordinates } },
  });
  assert.ok(measured.distanceM > 200);

  const surface = await request('/terrain/surface?bbox=-75.6,6.2,-75.598,6.202&resolution=5&contourInterval=10', { token });
  assert.equal(surface.resolution, 9);
  assert.equal(surface.elevation.length, 9);
  assert.ok(Array.isArray(surface.contours));

  const grid = [[9, 8, 7], [6, 2, 4], [3, 2, 1]];
  const terrain = await request('/terrain/analyze', { method: 'POST', token, body: { grid, cellSizeM: 10, contourInterval: 1 } });
  assert.equal(terrain.elevation.length, 3);
  assert.ok(terrain.slope.flat().some((value) => value > 0));
  assert.ok(Array.isArray(terrain.contours));

  const hydrology = await request('/terrain/hydrology', {
    method: 'POST', token,
    body: { grid, bbox: [-75.6, 6.2, -75.598, 6.202], cellSizeM: 10, streamThreshold: 1 },
  });
  assert.equal(hydrology.directions.length, 3);
  assert.ok(hydrology.accumulation.flat().some((value) => value > 1));

  const profile = await request('/terrain/profile', {
    method: 'POST', token,
    body: { grid, bbox: [-75.6, 6.2, -75.598, 6.202], start: [-75.6, 6.2], end: [-75.598, 6.202], samples: 5 },
  });
  assert.equal(profile.points.length, 5);
  assert.ok(profile.points.some((point) => point.elevationM !== null));

  const risk = await request('/spatial/risk/evaluate', {
    method: 'POST', token,
    body: {
      dataMode: 'declared',
      wildfire: { dryness: 1, temperature: 1, wind: 1, vegetationFuel: 1, slope: 1, humidity: 0 },
    },
  });
  assert.equal(risk.modelVersion, 'backstage-risk-v1');
  assert.equal(risk.hazards.wildfire.score, 1);
  assert.equal(risk.hazards.wildfire.classification, 'critical');

  const comparison = await request('/analytics/multicriteria', {
    method: 'POST', token, expectedStatus: 201,
    body: {
      method: 'topsis',
      alternatives: [
        { name: 'Medellín', criteria: { access: 90, market: 75 } },
        { name: 'Bogotá', criteria: { access: 80, market: 85 } },
        { name: 'Cali', criteria: { access: 65, market: 60 } },
      ],
      weights: { access: 0.6, market: 0.4 },
      directions: { access: 'benefit', market: 'benefit' },
    },
  });
  assert.equal(comparison.algorithm, 'multicriteria.topsis');
  assert.equal(comparison.result.ranking.length, 3);

  const financial = await request('/analytics/financial', {
    method: 'POST', token, expectedStatus: 201,
    body: { algorithm: 'npv_irr', cashFlows: [-100, 110], discountRate: 0.1 },
  });
  assert.ok(Math.abs(financial.result.npv) < 1e-9);
  assert.ok(Math.abs(financial.result.irr.irr - 0.1) < 1e-6);

  const componentRisk = await request('/analytics/risk-simulation', {
    method: 'POST', token, expectedStatus: 201,
    body: { algorithm: 'components', threat: 0.5, exposure: 0.5, vulnerability: 0.5 },
  });
  assert.equal(componentRisk.result.risk, 0.125);

  for (const execution of [comparison, financial, componentRisk]) {
    const job = analyticsJobs.get(execution.analytics_job_id);
    assert.equal(job.status, 'succeeded');
    assert.equal(job.organizationId, session.user.organization_id);
    assert.ok(job.algorithmVersion);
    assert.ok(Number.isFinite(job.durationMs));
  }

  const plan = await request('/analysis/plan', {
    method: 'POST', token,
    body: { prompt: 'Analizar Medellín para un centro logístico' },
  });
  assert.equal(plan.intent, 'territory');
  assert.equal(plan.status, 'plan_ready');
  assert.equal(plan.data_status, 'insufficient_data');
  assert.equal(plan.territoryCandidates[0].properties.name, 'Medellín');
  assert.equal(plan.territoryCandidates[0].provenance.license, 'ODbL-1.0');
  assert.ok(plan.missing_inputs.includes('population_total_zone'));
  assert.equal(plan.territoryCandidates[0].data.risk.status, 'insufficient_data');
});