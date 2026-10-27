const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const ApiError = require('../utils/ApiError');
const CONTRACT_VERSION = 'backstage-analysis-1';
function canonicalJson(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value))) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  throw new ApiError(400, 'El análisis debe contener únicamente datos JSON finitos.');
}
const hash = value => crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
const fingerprints = new Map();
function engineFingerprint(version) {
  if (fingerprints.has(version)) return fingerprints.get(version);
  const files = version === 'soi-weighted-minmax-1' ? ['comparison.v1.mjs'] : ['comparison.v1.mjs', 'comparison.v2.mjs', 'decimal.mjs'];
  const result = hash(files.map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../../shared', file))).digest('hex') })));
  fingerprints.set(version, result); return result;
}
async function canonicalComparisonInput(input) {
  const { decimal } = await import('../../shared/decimal.mjs');
  const text = (value, field, max = 2000) => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(400, `${field} inválido.`); return value.trim(); };
  const candidates = input.candidates.map(c => ({ id: c.id, name: text(c.name, 'Nombre', 200), lat: Number(c.lat), lng: Number(c.lng) }));
  const criteria = input.criteria.map(c => ({ id: c.id, name: text(c.name, 'Criterio', 200), definition: text(c.definition, 'Definición'), unit: text(c.unit, 'Unidad', 100), source: text(c.source, 'Fuente'), weight: decimal(c.weight).text, direction: c.direction, normalization: c.normalization, missing: c.missing,
    ...Object.fromEntries(['min', 'max'].filter(k => Object.hasOwn(c, k)).map(k => [k, c[k] == null || String(c[k]).trim() === '' ? '' : decimal(c[k]).text])) }));
  const observations = Object.create(null);
  for (const candidate of candidates) {
    observations[candidate.id] = Object.create(null);
    for (const criterion of criteria) {
      const raw = input.observations[candidate.id]?.[criterion.id]; if (!raw) continue;
      if (raw.source != null && typeof raw.source !== 'string') throw new ApiError(400, 'Fuente de observación inválida.');
      if (raw.observed_at != null && (typeof raw.observed_at !== 'string' || raw.observed_at.length > 64 || raw.observed_at && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?$/.test(raw.observed_at))) throw new ApiError(400, 'Fecha de observación inválida.');
      observations[candidate.id][criterion.id] = { value: raw.value == null || String(raw.value).trim() === '' ? null : decimal(raw.value).text, unit: criterion.unit, source: raw.source?.trim() ? text(raw.source, 'Fuente') : criterion.source, observed_at: raw.observed_at || null, data_type: raw.data_type };
    }
  }
  return { candidates, criteria, observations };
}
function contractBody(input, result) {
  return { contract_version: CONTRACT_VERSION, engine: { id: 'weighted-comparison', version: result.version, source_sha256: engineFingerprint(result.version) },
    input_sha256: hash(input), result_sha256: hash(result),
    quantities: input.criteria.map(c => ({ criterion_id: c.id, unit: c.unit, conversions: 'none' })),
    provenance: input.candidates.flatMap(candidate => input.criteria.map(c => { const o = input.observations[candidate.id]?.[c.id]; return { candidate_id: candidate.id, criterion_id: c.id, source: o?.source || c.source, data_type: o?.data_type || 'UNKNOWN', observed_at: o?.observed_at || null, timezone_declared: Boolean(o?.observed_at && /(?:Z|[+-]\d{2}:\d{2})$/.test(o.observed_at)), missing: o?.value == null }; })),
    numeric_policy: result.numeric_policy,
    reproducibility: { deterministic: true, random_seed: null, external_fetches: false, canonicalization: 'sorted-json-keys-1', comparison: 'exact-sha256' },
    uncertainty: { status: 'not_estimated', confidence_interval: null, note: 'El orden depende de los datos y pesos aportados; no estima certeza estadística ni certifica sus fuentes.' } };
}
function buildComparisonAnalysis(input, result) {
  const body = contractBody(input, result); return { ...body, manifest_sha256: hash(body) };
}
async function replaySnapshot(snapshot) {
  const { evaluateComparison, SUPPORTED_COMPARISON_VERSIONS, LEGACY_VERSION } = await import('../../shared/comparison.mjs');
  const checked_at = new Date().toISOString(), version = snapshot.result?.version;
  const base = { checked_at, engine_version: version || null, snapshot_modified: false };
  if (!SUPPORTED_COMPARISON_VERSIONS.includes(version)) return { ...base, status: 'unsupported_version', verified: false, historical_integrity: false };
  let recalculated;
  try { recalculated = evaluateComparison(snapshot.input, { version }); }
  catch { return { ...base, status: 'invalid_input', verified: false, historical_integrity: false }; }
  if (!snapshot.analysis) {
    const matches = hash(recalculated) === hash(snapshot.result), ready = recalculated.status === 'ready';
    return { ...base, status: version === LEGACY_VERSION ? !ready ? 'invalid_input' : matches ? 'legacy_replayed' : 'mismatch' : 'missing_contract', verified: version === LEGACY_VERSION && ready && matches, historical_integrity: false, result_matches: matches, note: 'El registro anterior no conserva huellas de origen; la repetición no acredita su integridad histórica.' };
  }
  if (snapshot.analysis.contract_version !== CONTRACT_VERSION) return { ...base, status: 'unsupported_contract', verified: false, historical_integrity: false };
  if (snapshot.analysis.engine?.version !== version || snapshot.analysis.engine?.source_sha256 !== engineFingerprint(version)) return { ...base, status: 'engine_changed', verified: false, historical_integrity: false };
  const expected = buildComparisonAnalysis(snapshot.input, recalculated);
  const { manifest_sha256: storedHash, ...storedBody } = snapshot.analysis;
  const result_matches = hash(recalculated) === hash(snapshot.result);
  const input_matches = expected.input_sha256 === snapshot.analysis.input_sha256;
  const manifest_matches = storedHash === hash(storedBody) && storedHash === expected.manifest_sha256;
  const verified = recalculated.status === 'ready' && result_matches && input_matches && manifest_matches;
  return { ...base, status: verified ? 'verified' : 'mismatch', verified, historical_integrity: verified, input_matches, result_matches, manifest_matches, input_sha256: expected.input_sha256, result_sha256: expected.result_sha256, manifest_sha256: expected.manifest_sha256 };
}
async function verifyComparisonSnapshot(snapshot) {
  try { return await replaySnapshot(snapshot); }
  catch (error) {
    if (error.code === 'ENOENT') throw new ApiError(503, 'La versión del motor no está disponible en este despliegue.');
    return { status: 'invalid_snapshot', verified: false, historical_integrity: false, engine_version: snapshot.result?.version || null, checked_at: new Date().toISOString(), snapshot_modified: false };
  }
}
function comparisonReference(snapshot) {
  return { method: 'weighted_sum', version: snapshot.result.version, comparison_snapshot_id: snapshot.comparison_id,
    ...(snapshot.analysis ? { contract_version: snapshot.analysis.contract_version, input_sha256: snapshot.analysis.input_sha256, result_sha256: snapshot.analysis.result_sha256, manifest_sha256: snapshot.analysis.manifest_sha256 } : { historical_integrity: 'not_recorded' }) };
}
module.exports = { CONTRACT_VERSION, canonicalJson, hash, canonicalComparisonInput, buildComparisonAnalysis, verifyComparisonSnapshot, comparisonReference };
