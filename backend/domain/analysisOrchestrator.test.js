const test = require('node:test');
const assert = require('node:assert/strict');
const { createAnalysisOrchestrator, parseIntent } = require('../services/analysisOrchestrator.service');

test('interpreta una intención territorial simple sin exigir parámetros técnicos', () => {
  assert.deepEqual(parseIntent('Analizar Medellín').territoryQueries, ['Medellín']);
});

test('extrae el territorio de solicitudes de riesgo y oportunidad', () => {
  assert.deepEqual(parseIntent('Analizar riesgo territorial de Quibdó').territoryQueries, ['Quibdó']);
  assert.deepEqual(parseIntent('Buscar oportunidades inmobiliarias en Antioquia').territoryQueries, ['Antioquia']);
});

test('separa alternativas en solicitudes comparativas', () => {
  assert.deepEqual(parseIntent('Comparar Medellín, Bogotá y Cali').territoryQueries, ['Medellín', 'Bogotá', 'Cali']);
});

test('prepara los tres territorios con coordenadas y motores explícitos para Comparator', async () => {
  const cities = [
    ['Medellín', -75.5812, 6.2442, 'Antioquia'],
    ['Bogotá', -74.0721, 4.7110, 'Bogotá D.C.'],
    ['Cali', -76.5320, 3.4516, 'Valle del Cauca'],
  ];
  const orchestrator = createAnalysisOrchestrator({
    searchTerritories: async () => [],
    geocodeTerritories: async (query) => {
      const [, longitude, latitude, region] = cities.find(([name]) => name === query);
      return [{
        id: `resolved:${query}`,
        name: query,
        displayName: `${query}, ${region}, Colombia`,
        city: query,
        region,
        country: 'Colombia',
        coordinates: [longitude, latitude],
        geometry: { type: 'Point', coordinates: [longitude, latitude] },
        properties: { name: query, city: query, region, country: 'Colombia' },
        source: 'test resolver',
      }];
    },
    dataResolver: {
      resolve: async () => ({ status: 'insufficient_data', data_quality: { missing_inputs: ['population'] } }),
    },
  });

  const prompt = 'Comparar Medellín, Bogotá y Cali';
  const plan = await orchestrator.createPlan(17, prompt);

  assert.equal(plan.intentType, 'comparison');
  assert.equal(plan.rawInput, prompt);
  assert.deepEqual(plan.territories, ['Medellín', 'Bogotá', 'Cali']);
  assert.deepEqual(plan.requestedEngines, ['territory_resolution', 'data_resolution', 'multicriteria']);
  assert.equal(plan.territoryCandidates.length, 3);
  assert.deepEqual(plan.territoryCandidates.map((candidate) => candidate.matchedQuery), plan.territories);
  assert.ok(plan.territoryCandidates.every((candidate) => Number.isFinite(Number(candidate.coordinates[0])) && Number.isFinite(Number(candidate.coordinates[1]))));
});

test('resuelve candidatos dentro de la organización y no fabrica resultados vacíos', async () => {
  const calls = [];
  const orchestrator = createAnalysisOrchestrator({
    searchTerritories: async (organizationId, query) => {
      calls.push({ organizationId, query });
      return query.q === 'Medellín' ? [{ id: 'territory-1', properties: { name: 'Medellín' } }] : [];
    },
    geocodeTerritories: async () => [],
  });

  const plan = await orchestrator.createPlan(17, 'Analizar Medellín');

  assert.equal(plan.status, 'plan_ready');
  assert.equal(plan.territoryCandidates[0].id, 'territory-1');
  assert.equal(calls[0].organizationId, 17);
  assert.equal(calls[0].query.worldId, 'earth');
  assert.equal((await orchestrator.createPlan(17, 'Analizar un territorio sin fuente')).status, 'insufficient_data');
});

test('uses the public territory adapter when Atlas has no match and carries resolved data state', async () => {
  const orchestrator = createAnalysisOrchestrator({
    searchTerritories: async () => [],
    geocodeTerritories: async (query) => [{
      id: `osm:${query}`,
      properties: { name: query, city: query },
      geometry: { type: 'Point', coordinates: [-75.6026, 6.2697] },
      bounds: [-75.72, 6.16, -75.47, 6.38],
      provenance: { source: 'OpenStreetMap Nominatim', license: 'ODbL-1.0', dataMode: 'derived' },
    }],
    dataResolver: {
      resolve: async ({ organizationId, territory }) => ({
        status: 'insufficient_data',
        organizationId,
        territoryId: territory.id,
        data_quality: { missing_inputs: ['population_total_zone'], confidence: null },
      }),
    },
  });

  const plan = await orchestrator.createPlan(17, 'Analizar Medellín');
  assert.equal(plan.status, 'plan_ready');
  assert.equal(plan.data_status, 'insufficient_data');
  assert.equal(plan.territoryCandidates[0].provenance.license, 'ODbL-1.0');
  assert.deepEqual(plan.missing_inputs, ['population_total_zone']);
});

test('rechaza prompts cortos y planes sin organización', async () => {
  assert.throws(() => parseIntent('ok'), { statusCode: 400 });
  await assert.rejects(createAnalysisOrchestrator().createPlan(null, 'Analizar Medellín'), { statusCode: 401 });
});