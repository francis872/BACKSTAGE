const test = require('node:test');
const assert = require('node:assert/strict');

const { simplifyLine, simplifyGeometry, toleranceForZoom } = require('../spatial/simplify');
const TileCache = require('../spatial/tileCache');
const { validateRemoteUrl } = require('../spatial/remoteSources');

test('simplifica líneas conservando extremos y forma significativa', () => {
  const line = [[0, 0], [0.1, 0.001], [0.2, 0], [0.3, 0.2], [0.4, 0]];
  const simplified = simplifyLine(line, 0.01);
  assert.deepEqual(simplified[0], line[0]);
  assert.deepEqual(simplified.at(-1), line.at(-1));
  assert.ok(simplified.length < line.length);
  assert.ok(simplified.some((point) => point[1] === 0.2));
});

test('preserva anillos cerrados y reduce tolerancia al aumentar zoom', () => {
  const geometry = { type: 'Polygon', coordinates: [[[0, 0], [0.5, 0.001], [1, 0], [1, 1], [0, 1], [0, 0]]] };
  const simplified = simplifyGeometry(geometry, 0.01);
  assert.deepEqual(simplified.coordinates[0][0], simplified.coordinates[0].at(-1));
  assert.ok(toleranceForZoom(6) > toleranceForZoom(14));
});

test('caché LRU limita entradas y puede invalidarse', () => {
  const cache = new TileCache({ maxEntries: 2, ttlMs: 10000 });
  cache.set('a', 1); cache.set('b', 2); cache.get('a'); cache.set('c', 3);
  assert.equal(cache.get('b'), null);
  assert.equal(cache.get('a'), 1);
  cache.clear();
  assert.equal(cache.size, 0);
});

test('fuentes remotas solo aceptan HTTPS y dominios autorizados', () => {
  assert.equal(validateRemoteUrl('https://www.datos.gov.co/api/v3/views/demo/query.geojson').hostname, 'www.datos.gov.co');
  assert.throws(() => validateRemoteUrl('http://www.datos.gov.co/data.json'), /HTTPS/);
  assert.throws(() => validateRemoteUrl('https://example.com/data.geojson'), /dominio autorizado/);
  assert.throws(() => validateRemoteUrl('https://user:secret@datos.gov.co/data.json'), /credenciales/);
});
