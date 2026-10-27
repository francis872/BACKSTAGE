const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const { hash, canonicalJson, CONTRACT_VERSION } = require('./intelligenceContract.service');
const core = require('../spatial/core');
const rules = require('../../shared/spatialRules.v1.json');
const VERSION = 'backstage-gis-core-1';
const REFERENCE = Object.freeze({ datum: 'WGS84', crs: 'OGC:CRS84', coordinate_order: 'longitude_latitude', angular_unit: 'degree', reprojection: 'none' });
const supported = name => ['gis.distance_matrix', 'gis.point_in_polygon'].includes(name);
const fail = message => { throw new ApiError(400, message); };
function coordinate(value) {
  if (!Array.isArray(value) || value.length !== 2 || value.some(v => typeof v !== 'number' || !Number.isFinite(v)) || Math.abs(value[0]) > 180 || Math.abs(value[1]) > 90) fail('Coordenadas WGS84: [longitud, latitud] numéricas dentro de rango.');
  return [...value];
}
function source(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 2000) fail('Declara la fuente de las coordenadas.');
  return { name: value.name.trim(), data_type: ['ORGANIZATION_PROVIDED', 'IMPORTED', 'EXTERNAL_API', 'HISTORICAL', 'SIMULATED'].includes(value.data_type) ? value.data_type : 'UNKNOWN', certification: 'not_verified' };
}
function canonicalInput(name, raw) {
  canonicalJson(raw);
  if (raw.crs != null && raw.crs !== REFERENCE.crs || raw.coordinate_order != null && raw.coordinate_order !== REFERENCE.coordinate_order) fail('Usa OGC:CRS84 y orden longitud-latitud; no hay reproyección implícita.');
  const p = { spatial_reference: REFERENCE, source: source(raw.source) };
  if (name === 'gis.distance_matrix') {
    if (!Array.isArray(raw.coordinates) || raw.coordinates.length < 2 || raw.coordinates.length > 100) fail('Se requieren entre 2 y 100 puntos.');
    p.coordinates = raw.coordinates.map(coordinate);
  } else {
    p.point = coordinate(raw.point);
    if (!Array.isArray(raw.ring) || raw.ring.length < 4 || raw.ring.length > 1000) fail('Anillo cerrado de 4 a 1000 posiciones requerido.');
    p.ring = raw.ring.map(coordinate);
    if (hash(p.ring[0]) !== hash(p.ring.at(-1))) fail('El anillo debe estar cerrado.');
    if (p.ring.some((v, i) => i && Math.abs(v[0] - p.ring[i - 1][0]) > 180)) fail('Divide los polígonos que cruzan el antimeridiano antes del cálculo planar.');
    if (new Set(p.ring.map(JSON.stringify)).size < 3) fail('El anillo requiere tres vértices distintos.');
    p.boundary_policy = 'reported_separately_excluded_from_interior';
  }
  return p;
}
function onBoundary(p, ring) {
  return ring.slice(1).some((b, i) => { const a = ring[i], dx = b[0] - a[0], dy = b[1] - a[1]; return Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) <= 1e-12 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0]) && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]); });
}
function run(name, p) {
  if (name === 'gis.distance_matrix') return { distance_m: p.coordinates.map(a => p.coordinates.map(b => Number(core.haversineDistance({ lng: a[0], lat: a[1] }, { lng: b[0], lat: b[1] }).toFixed(6)))), method: 'spherical_haversine', earth_radius_m: core.EARTH_RADIUS_M, road_distance: false, physical_accuracy_m: null };
  const boundary = onBoundary(p.point, p.ring);
  return { inside: !boundary && core.pointInPolygon({ lng: p.point[0], lat: p.point[1] }, p.ring), on_boundary: boundary, method: 'planar_ray_casting_single_ring', boundary_tolerance_degree_squared: 1e-12, topological_validity_certified: false };
}
const fingerprints = new Map();
function fingerprint(kind) {
  if (!fingerprints.has(kind)) {
    const files = ['shared/spatialRules.v1.json', 'backend/services/spatialEvidence.service.js', 'backend/services/intelligenceContract.service.js', ...(kind === 'gis' ? ['backend/spatial/core.js'] : ['backend/services/optimizationEvidence.service.js', 'sanitary/routing.py', 'sanitary/engine.py'])];
    fingerprints.set(kind, hash(files.map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../..', file))).digest('hex') }))));
  }
  return fingerprints.get(kind);
}
function manifest(body) { return { ...body, manifest_sha256: hash(body) }; }
function build(name, input, result) {
  return manifest({ contract_version: CONTRACT_VERSION, engine: { id: name, version: VERSION, source_sha256: fingerprint('gis') }, input_sha256: hash(input), result_sha256: hash(result), spatial_reference: REFERENCE, business_rules: { version: rules.version, sha256: hash(rules) }, provenance: input.source, numeric_policy: { arithmetic: 'IEEE754_binary64', distance_output_decimals: 6, physical_accuracy: 'not_inferred_from_decimal_precision' }, reproducibility: { deterministic: true, runtime: process.version, external_fetches: false }, uncertainty: { confidence_interval: null, note: 'Distancia esférica y contención planar; no acredita acceso vial, precisión topográfica ni validez topológica del polígono.' } });
}
function verify(job) {
  const base = { checked_at: new Date().toISOString(), verified: false, historical_integrity: false, snapshot_modified: false };
  if (job.algorithm_version !== VERSION) return { ...base, status: 'unsupported_version' };
  if (job.status !== 'succeeded') return { ...base, status: 'not_completed' };
  if (!job.analysis) return { ...base, status: 'missing_contract' };
  try {
    const raw = { ...job.params, crs: job.params.spatial_reference?.crs, coordinate_order: job.params.spatial_reference?.coordinate_order };
    const input = canonicalInput(job.algorithm_name, raw), result = run(job.algorithm_name, input), expected = build(job.algorithm_name, input, result);
    const verified = hash(job.params) === expected.input_sha256 && hash(job.result) === expected.result_sha256 && hash(job.analysis) === hash(expected);
    return { ...base, status: verified ? 'verified' : 'mismatch', verified, historical_integrity: verified };
  } catch { return { ...base, status: 'invalid_snapshot' }; }
}
module.exports = { rules, REFERENCE, VERSION, supported, versionFor: () => VERSION, canonicalInput, run, build, verify, fingerprint, manifest, coordinate };
