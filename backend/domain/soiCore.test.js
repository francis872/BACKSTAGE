const test = require('node:test');
const assert = require('node:assert/strict');
const { previewImport, parseCsv, normalizeAsset, geometry, createSoiService } = require('../services/soi.service');

const context = { organizationId: 7, userId: 12, role: 'admin' };
const upload = { format: 'csv', source: { name: 'Inventario verificado', license: 'Interna' },
  content: 'name,type,latitude,longitude,external_id\nPunto A,container,4.6,-74.1,A\nPunto B,depot,4.7,-74.2,B' };

test('assets never inherit the legacy Colombia default for unspecified or foreign countries', () => {
  const asset = { name: 'Facility', longitude: -80.19, latitude: 25.76 };
  assert.equal(normalizeAsset(asset).country, 'UNKNOWN');
  assert.equal(normalizeAsset({ ...asset, country: 'United States', region: 'Florida' }).country, 'United States');
  assert.equal(normalizeAsset({ ...asset, country: 'United States', region: 'Florida' }).region, 'Florida');
});

test('CSV supports quoted commas, escaped quotes, multiline and BOM', () => {
  assert.deepEqual(parseCsv('\uFEFFname,city\r\n"Punto, \"\"uno\"\"","Bogotá\nNorte"\r\n'), [{ name: 'Punto, "uno"', city: 'Bogotá\nNorte' }]);
  for (const malformed of ['name,name\na,b', 'name,city\na', 'name\n"a', 'name\n"a"x']) assert.throws(() => parseCsv(malformed), { statusCode: 400 });
});

test('preview validates all records without writing and binds digest to tenant and source', () => {
  const preview = previewImport(upload, 7);
  assert.equal(preview.valid, true); assert.equal(preview.assets.length, 2);
  assert.equal(preview.assets[0].geometry.coordinates[0], -74.1);
  assert.notEqual(preview.preview_hash, previewImport(upload, 8).preview_hash);
  assert.notEqual(preview.preview_hash, previewImport({ ...upload, source: { name: 'Otro inventario' } }, 7).preview_hash);
  const invalid = previewImport({ ...upload, content: 'name,latitude,longitude\nA,91,0\nB,,0' }, 7);
  assert.equal(invalid.valid, false); assert.equal(invalid.errors.length, 2);
  assert.equal(previewImport({ ...upload, content: upload.content.replace(',B', ',A') }, 7).valid, false);
});

test('geometry rejects empty, invalid WGS84, short lines and unclosed rings', () => {
  for (const shape of [{ type: 'Point', coordinates: [] }, { type: 'Point', coordinates: [181, 0] },
    { type: 'Point', coordinates: ['1', 2] }, { type: 'LineString', coordinates: [[0,0]] },
    { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1]]] }]) assert.throws(() => geometry(shape), { statusCode: 400 });
  assert.equal(normalizeAsset({ name: 'Zona', geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,0]]] } }).type, 'other');
});

test('GeoJSON has per-record errors and requires WGS84 FeatureCollection', () => {
  const result = previewImport({ format: 'geojson', source: { name: 'Catastro' }, content: {
    type: 'FeatureCollection', features: [{ type: 'Feature', properties: { name: 'Nodo', type: 'network_node' }, geometry: { type: 'Point', coordinates: [0,0] } }],
  } }, 7);
  assert.equal(result.valid, true);
  assert.throws(() => previewImport({ ...upload, format: 'geojson', content: '{broken' }, 7), { statusCode: 400 });
});

