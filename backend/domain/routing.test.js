const test = require('node:test');
const assert = require('node:assert/strict');

const { buildRoadGraph, nearestNode, shortestPath } = require('../spatial/routing');
const { MemorySpatialStore } = require('../spatial/store');
const { SpatialIngestionPipeline } = require('../spatial/ingestion');

const roads = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', properties: { name: 'Ruta directa', speedKph: 30 }, geometry: { type: 'LineString', coordinates: [[-76.66, 5.69], [-76.65, 5.69], [-76.64, 5.69]] } },
    { type: 'Feature', properties: { name: 'Desvío', speedKph: 10 }, geometry: { type: 'LineString', coordinates: [[-76.66, 5.69], [-76.65, 5.70], [-76.64, 5.69]] } },
  ],
};

test('construye grafo vial y ajusta coordenadas al nodo cercano', () => {
  const graph = buildRoadGraph(roads);
  assert.equal(graph.nodes.size, 4);
  const node = nearestNode(graph, [-76.6599, 5.6901]);
  assert.deepEqual(node.coordinate, [-76.66, 5.69]);
});

test('A* y Dijkstra encuentran la ruta conectada de menor costo', () => {
  const graph = buildRoadGraph(roads);
  const astar = shortestPath(graph, [-76.66, 5.69], [-76.64, 5.69], 'astar');
  const dijkstra = shortestPath(graph, [-76.66, 5.69], [-76.64, 5.69], 'dijkstra');
  assert.deepEqual(astar.geometry.coordinates, [[-76.66, 5.69], [-76.65, 5.69], [-76.64, 5.69]]);
  assert.ok(Math.abs(astar.durationSeconds - dijkstra.durationSeconds) < 1e-6);
  assert.ok(astar.distanceM > 2000);
});

test('búsqueda y cercanía consultan objetos territoriales activos', async () => {
  const store = new MemorySpatialStore(); const pipeline = new SpatialIngestionPipeline(store);
  const source = await pipeline.registerSource({ organizationId: 3, provider: 'Municipio', dataset: 'red', version: '1', license: 'ODC' });
  await pipeline.ingestGeoJSON({ organizationId: 3, worldId: '3:earth', sourceId: source._id, collection: roads, minZoom: 10, maxZoom: 10 });
  const results = await pipeline.search({ organizationId: 3, worldId: '3:earth', query: 'directa' });
  assert.equal(results.length, 1);
  const nearby = await pipeline.nearby({ organizationId: 3, worldId: '3:earth', lng: -76.65, lat: 5.69, radiusM: 2000 });
  assert.equal(nearby.length, 2);
  assert.ok(nearby[0].distanceM <= nearby[1].distanceM);
});
