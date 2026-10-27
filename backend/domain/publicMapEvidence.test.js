const test = require('node:test');
const assert = require('node:assert/strict');
const { createPublicMapEvidenceService, nearbyTiles, distanceM, decodeTile } = require('../services/publicMapEvidence.service');

test('consulta hasta nueve teselas y cruza el antimeridiano sin índices inválidos', () => {
  const tiles = nearbyTiles([179.999, 6], 1200);
  assert.equal(tiles.length, 9);
  assert.ok(tiles.some((tile) => tile.x === 0));
  assert.ok(tiles.every((tile) => tile.x >= 0 && tile.x < 2 ** tile.z && tile.y >= 0 && tile.y < 2 ** tile.z));
  assert.throws(() => nearbyTiles([0, 89], 1200), { statusCode: 503 });
  assert.ok(distanceM([179.999, 0], [-179.999, 0]) < 300);
});
test('decodifica protobuf vectorial auténtico conservando nombre, categoría y coordenadas', async () => {
  const { PbfWriter } = await import('pbf');
  const writer = new PbfWriter();
  writer.writeMessage(3, (_, layer) => {
    layer.writeStringField(1, 'poi');
    layer.writeVarintField(15, 2);
    layer.writeVarintField(5, 4096);
    for (const key of ['name', 'class', 'subclass']) layer.writeStringField(3, key);
    for (const value of ['Hospital de prueba', 'hospital', 'clinic']) layer.writeMessage(4, (text, valueWriter) => valueWriter.writeStringField(1, text), value);
    layer.writeMessage(2, (_, feature) => {
      feature.writeVarintField(1, 99);
      feature.writePackedVarint(2, [0, 0, 1, 1, 2, 2]);
      feature.writeVarintField(3, 1);
      feature.writePackedVarint(4, [9, 4096, 4096]);
    });
  });
  const rows = await decodeTile(writer.finish(), { x: 0, y: 0, z: 0 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].properties.name, 'Hospital de prueba');
  assert.equal(rows[0].properties.category, 'health');
  assert.deepEqual(rows[0].geometry.coordinates, [0, 0]);
});
test('deduplica puntos entre teselas, limita el radio y conserva versión y atribución', async () => {
  let requests = 0;
  const service = createPublicMapEvidenceService({
    fetchImpl: async (url) => {
      requests++;
      if (String(url).endsWith('/planet')) return { ok: true, json: async () => ({ tiles: ['https://tiles.openfreemap.org/planet/test-version/{z}/{x}/{y}.pbf'] }) };
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
    },
    decode: async () => [
      { type: 'Feature', id: 'near', geometry: { type: 'Point', coordinates: [0.001, 0] }, properties: { class: 'hospital', subclass: 'clinic', category: 'health' } },
      { type: 'Feature', id: 'far', geometry: { type: 'Point', coordinates: [1, 0] }, properties: { class: 'school', category: 'education' } },
    ],
  });
  const result = await service.mapContext(0, 0);
  assert.equal(result.counts.mappedPlaces, 1);
  assert.equal(result.counts.health, 1);
  assert.equal(result.counts.education, 0);
  assert.equal(result.source.version, 'test-version');
  assert.equal(result.source.license, 'ODbL 1.0');
  assert.equal(result.sourceUpdatedAt, null);
  assert.equal(result.source.dataMode, 'vector_tile_snapshot');
  await service.mapContext(0, 0);
  assert.equal(requests, 10, 'reutiliza el descriptor y las nueve teselas');
});
test('no devuelve ausencia de lugares cuando fallan todas las teselas', async () => {
  const service = createPublicMapEvidenceService({ fetchImpl: async (url) => String(url).endsWith('/planet')
    ? { ok: true, json: async () => ({ tiles: ['https://tiles.openfreemap.org/planet/test-version/{z}/{x}/{y}.pbf'] }) }
    : { ok: false } });
  await assert.rejects(() => service.mapContext(0, 0), { statusCode: 503 });
});
