const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');

const SECTORS = ['general', 'waste', 'water', 'energy', 'logistics', 'public_services', 'environment'];
const CAPABILITIES = ['assets', 'operations', 'fleet', 'incidents', 'imports', 'trips'];
const ASSET_TYPES = ['container', 'collection_point', 'facility', 'depot', 'customer', 'network_node', 'service_area', 'land', 'building', 'plant', 'station', 'vehicle', 'equipment', 'network', 'infrastructure', 'environmental_asset', 'other'];
const { DATA_TYPES } = require('../domain/provenance');
function provenance(dataType, source, actorUserId) {
  return { data_type: dataType, validated: false, quality: 'unassessed', source,
    recorded_at: new Date().toISOString(), access_scope: 'organization', ...(actorUserId ? { actor_user_id: actorUserId } : {}) };
}
function customMetadata(value) {
  const clean = { ...metadata(value) };
  for (const key of ['provenance','data_type','validated','verified','quality','source','access_scope','recorded_at']) delete clean[key];
  return clean;
}
function assetRecord(record) {
  const current = record.metadata?.provenance;
  const authoritative = current ? { ...current, data_type: DATA_TYPES.includes(current.data_type) && current.data_type !== 'REAL_VERIFIED' ? current.data_type : 'UNKNOWN',
    validated: false, verified: false, quality: 'unassessed', access_scope: 'organization' } :
    { data_type: 'UNKNOWN', validated: false, quality: 'unassessed', source: { name: 'Inventario heredado sin clasificación' },
      recorded_at: record.created_at || null, access_scope: 'organization' };
  return { ...record, metadata: { ...customMetadata(record.metadata || {}), provenance: authoritative } };
}
const fail = (message) => { throw new ApiError(400, message); };
function text(value, field, max = 200, required = true) {
  if ((value == null || value === '') && !required) return null;
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${field} debe ser texto de hasta ${max} caracteres.`);
  return value.trim();
}
function enumeration(value, values, field) {
  if (!values.includes(value)) fail(`${field} inválido. Valores: ${values.join(', ')}.`);
  return value;
}
function positive(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) fail(`${field} debe ser positivo.`);
  return number;
}
function id(value, field = 'id') {
  if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) fail(`${field} inválido.`);
  return Number(value);
}
function metadata(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 20000) fail('metadata inválida o excede 20 KB.');
  return value;
}
const { geometry } = require('../domain/geometry');
function normalizeAsset(input, fallbackType) {
  let shape = input.geometry;
  if (!shape && input.longitude !== '' && input.latitude !== '' && input.longitude != null && input.latitude != null) {
    shape = { type: 'Point', coordinates: [Number(input.longitude), Number(input.latitude)] };
  }
  const capacity = input.capacity == null || input.capacity === '' ? null : positive(input.capacity, 'capacity');
  if (capacity !== null && (!Number.isSafeInteger(capacity) || capacity > 2147483647)) fail('capacity debe ser un entero positivo dentro del rango permitido.');
  return { name: text(input.name, 'name'), type: enumeration(input.type || fallbackType || 'other', ASSET_TYPES, 'type'),
    external_id: text(input.external_id, 'external_id', 200, false), geometry: geometry(shape), capacity,
    address: text(input.address, 'address', 500, false), city: text(input.city, 'city', 200, false),
    country: text(input.country, 'country', 100, false) || 'UNKNOWN', region: text(input.region, 'region', 200, false),
    metadata: metadata(input.metadata) };
}

// RFC 4180 quoting, including escaped quotes and newlines. No external parser or execution.
function parseCsv(content) {
  const rows = []; let row = []; let value = ''; let quoted = false; let closed = false;
  content = content.replace(/^\uFEFF/, '');
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === '"' && !value && !closed) quoted = true;
    else if (char === ',' || char === '\n' || char === '\r') {
      row.push(value); value = ''; closed = false;
      if (char !== ',') { if (char === '\r' && content[i + 1] === '\n') i++; rows.push(row); row = []; }
    } else { if (closed || char === '"') fail('CSV con comillas inválidas.'); value += char; }
  }
  if (quoted) fail('CSV con comillas sin cerrar.');
  if (value || row.length || closed) { row.push(value); rows.push(row); }
  const headers = rows.shift()?.map((header) => header.trim());
  if (!headers || !headers.includes('name') || new Set(headers).size !== headers.length || headers.some((h) => !h)) fail('CSV requiere encabezados únicos incluyendo name.');
  return rows.filter((record) => record.some((cell) => cell.trim())).map((record, index) => {
    if (record.length !== headers.length) fail(`Fila ${index + 2}: cantidad de columnas inconsistente.`);
    return Object.fromEntries(headers.map((header, column) => [header, record[column]]));
  });
}
function previewImport(input, organizationId) {
  const format = enumeration(input.format, ['csv', 'geojson'], 'format');
  if (JSON.stringify(input.content)?.length > 2000000) throw new ApiError(413, 'El archivo excede 2 MB.');
  const source = { name: text(input.source?.name, 'source.name'), url: text(input.source?.url, 'source.url', 1000, false),
    license: text(input.source?.license, 'source.license', 500, false), kind: 'user_upload' };
  let raw;
  if (format === 'csv') {
    if (typeof input.content !== 'string') fail('content debe ser texto CSV.');
    raw = parseCsv(input.content);
  } else {
    let collection = input.content;
    try { if (typeof collection === 'string') collection = JSON.parse(collection); } catch { fail('GeoJSON inválido.'); }
    if (collection?.type !== 'FeatureCollection' || !Array.isArray(collection.features) || collection.crs) fail('Se requiere FeatureCollection WGS84 sin CRS alternativo.');
    raw = collection.features.map((feature) => {
      if (feature?.type !== 'Feature') fail('Cada elemento debe ser Feature.');
      return { ...feature.properties, geometry: feature.geometry };
    });
  }
  if (!raw.length || raw.length > 1000) fail('Importa entre 1 y 1000 activos por lote.');
  const assets = []; const asset_rows = []; const errors = []; const seen = new Set();
  raw.forEach((record, index) => {
    try {
      const asset = normalizeAsset(record, input.asset_type);
      if (asset.external_id && seen.has(asset.external_id)) fail('external_id duplicado en el lote.');
      if (asset.external_id) seen.add(asset.external_id);
      assets.push(asset);
      asset_rows.push(index + 1);
    } catch (error) { if (!(error instanceof ApiError)) throw error; errors.push({ row: index + 1, message: error.message }); }
  });
  const preview_hash = crypto.createHash('sha256').update(JSON.stringify({ organizationId, source, assets })).digest('hex');
  return { valid: !errors.length, row_count: raw.length, errors, preview_hash, source, assets, asset_rows };
}

module.exports = { previewImport, parseCsv, normalizeAsset, geometry, SECTORS, CAPABILITIES, ASSET_TYPES, DATA_TYPES };
