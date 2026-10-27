const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const { hash, canonicalJson, CONTRACT_VERSION } = require('./intelligenceContract.service');
const risk = require('../domain/analytics/risk');
const legacyFinancial = require('../domain/analytics/financial');
const FINANCIAL_VERSION = 'backstage-financial-2', MONTE_CARLO_VERSION = 'backstage-monte-carlo-2';
const supported = name => ['financial.npv_irr', 'financial.cap_rate', 'financial.payback', 'financial.dcf', 'risk.monte_carlo'].includes(name);
const versionFor = name => name.startsWith('financial.') ? FINANCIAL_VERSION : MONTE_CARLO_VERSION;
function label(value, field, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new ApiError(400, `${field} inválido.`);
  return value.trim();
}
const finite = (v, field) => { if (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e100) throw new ApiError(400, `${field} debe ser un número finito dentro del rango admitido.`); return v; };
async function canonicalInput(name, raw) {
  canonicalJson(raw);
  const { decimal } = await import('../../shared/decimal.mjs');
  const p = {};
  const money = value => decimal(value).text;
  if (name.startsWith('financial.')) {
    const fields = { 'financial.npv_irr': ['cashFlows', 'discountRate'], 'financial.cap_rate': ['netOperatingIncome', 'propertyValue'], 'financial.payback': ['cashFlows'], 'financial.dcf': ['projectedCashFlows', 'discountRate'] }[name];
    for (const key of fields) {
      if (['cashFlows', 'projectedCashFlows'].includes(key)) {
        if (!Array.isArray(raw[key]) || raw[key].length > 121) throw new ApiError(400, 'Flujos de caja inválidos o fuera del horizonte admitido.');
        p[key] = raw[key].map(money);
      } else p[key] = money(raw[key]);
    }
    if (name === 'financial.payback' && raw.discountRate != null) p.discountRate = money(raw.discountRate);
    if (name === 'financial.dcf') p.terminalValue = money(raw.terminalValue ?? '0');
  } else {
    if (!raw.factors || typeof raw.factors !== 'object' || Array.isArray(raw.factors) || !Object.keys(raw.factors).length || Object.keys(raw.factors).length > 30) throw new ApiError(400, 'Se requieren entre 1 y 30 factores.');
    p.factors = Object.create(null); p.factorWeights = Object.create(null);
    for (const key of Object.keys(raw.factors).sort()) {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(key) || ['constructor', 'prototype', '__proto__'].includes(key)) throw new ApiError(400, 'Identificador de factor inválido.');
      const f = raw.factors[key];
      if (!f || Array.isArray(f)) throw new ApiError(400, 'Distribución inválida.');
      p.factors[key] = { mean: finite(f.mean, 'Media'), stdDev: finite(f.stdDev, 'Desviación') };
      if (f.stdDev < 0) throw new ApiError(400, 'La desviación no puede ser negativa.');
      p.factorWeights[key] = finite(raw.factorWeights?.[key] ?? 1, 'Peso');
    }
    if (raw.factorWeights != null && (typeof raw.factorWeights !== 'object' || Array.isArray(raw.factorWeights) || Object.keys(raw.factorWeights).some(k => !Object.hasOwn(p.factors, k)))) throw new ApiError(400, 'Los pesos deben corresponder a los factores declarados.');
    p.iterations = raw.iterations ?? 10000; p.seed = raw.seed ?? 42;
    if (!Number.isInteger(p.iterations) || p.iterations < 100 || p.iterations > 200000) throw new ApiError(400, 'Iteraciones: entero entre 100 y 200000.');
    if (!Number.isInteger(p.seed) || p.seed < 0 || p.seed > 4294967295) throw new ApiError(400, 'Semilla: entero entre 0 y 4294967295.');
    p.model = 'independent_normal_weighted_sum';
    if (raw.model != null && raw.model !== p.model) throw new ApiError(400, 'Modelo no soportado.');
  }
  p.currency = raw.currency == null ? null : label(raw.currency, 'Moneda', 3).toUpperCase();
  if (p.currency && !/^[A-Z]{3}$/.test(p.currency)) throw new ApiError(400, 'Declara un código de moneda de tres letras.');
  p.unit = raw.unit == null ? p.currency : label(raw.unit, 'Unidad', 100);
  if (p.currency && p.unit !== p.currency) throw new ApiError(400, 'La unidad debe coincidir con la moneda; no hay conversión implícita.');
  p.period = raw.period ?? null;
  if (p.period != null && !['year', 'quarter', 'month', 'day', 'custom'].includes(p.period)) throw new ApiError(400, 'Periodicidad no soportada.');
  p.rate_period = raw.rate_period ?? p.period;
  if (p.rate_period !== p.period) throw new ApiError(400, 'La tasa y los flujos deben usar el mismo periodo.');
  p.source = raw.source == null ? 'Declarado por el usuario' : label(raw.source, 'Fuente');
  p.data_type = ['ORGANIZATION_PROVIDED', 'IMPORTED', 'HISTORICAL', 'DEMO', 'SIMULATED'].includes(raw.data_type) ? raw.data_type : 'UNKNOWN';
  if (raw.assumptions != null && (!Array.isArray(raw.assumptions) || raw.assumptions.length > 30)) throw new ApiError(400, 'Supuestos inválidos.');
  p.assumptions = (raw.assumptions || []).map(x => label(x, 'Supuesto'));
  return p;
}
async function run(name, input) {
  if (name.startsWith('financial.')) return (await import('../../shared/financial.v2.mjs')).runFinancial(name, input);
  const keys = Object.keys(input.factors).sort();
  return risk.monteCarloSimulate({ factors: input.factors, iterations: input.iterations, seed: input.seed, combine: s => keys.reduce((total, k) => total + s[k] * input.factorWeights[k], 0) });
}
const fingerprintCache = new Map();
function fingerprint(name, version) {
  const key = `${name}:${version}`;
  if (!fingerprintCache.has(key)) {
    const files = version === '1.0.0' ? name.startsWith('financial.') ? ['backend/domain/analytics/financial.js'] : ['backend/domain/analytics/risk.js', 'backend/domain/analytics/normalization.js'] : ['backend/services/analyticsEvidence.service.js', 'backend/services/intelligenceContract.service.js', ...(name.startsWith('financial.') ? ['shared/financial.v2.mjs', 'shared/decimal.mjs'] : ['backend/domain/analytics/risk.js', 'backend/domain/analytics/normalization.js'])];
    fingerprintCache.set(key, hash(files.map(file => ({ file, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../..', file))).digest('hex') }))));
  }
  return fingerprintCache.get(key);
}
async function build(name, input, result) {
  const financial = name.startsWith('financial.');
  const body = { contract_version: CONTRACT_VERSION, engine: { id: name, version: versionFor(name), source_sha256: fingerprint(name, versionFor(name)) }, input_sha256: hash(input), result_sha256: hash(result),
    quantities: { currency: input.currency, unit: input.unit, period: input.period, rate_period: input.rate_period, conversions: 'none', cash_flow_timing: !financial ? null : name === 'financial.dcf' ? 'first_projection_at_period_1_terminal_at_horizon' : name === 'financial.cap_rate' ? 'net_operating_income_for_declared_period_over_value' : 'initial_cash_flow_at_period_0_then_end_of_period' },
    provenance: { source: input.source, data_type: input.data_type, certification: 'not_verified', assumptions: input.assumptions, missing_metadata: ['currency', 'unit', 'period'].filter(k => input[k] == null) },
    numeric_policy: financial ? (await import('../../shared/financial.v2.mjs')).NUMERIC_POLICY : { arithmetic: 'IEEE754_binary64', output_digits: 4, factor_order: 'sorted_keys' },
    reproducibility: { deterministic: true, random_seed: financial ? null : input.seed, generator: financial ? null : 'mulberry32_box_muller', iterations: financial ? null : input.iterations, model: financial ? 'equally_spaced_explicit_cash_flows' : input.model, external_fetches: false, runtime: process.version, comparison: 'exact-sha256' },
    uncertainty: { status: financial ? 'not_estimated' : 'conditional_simulated_distribution', confidence_interval: null, note: financial ? 'Depende de los flujos y supuestos declarados.' : 'P5/P50/P95 son percentiles simulados bajo normales independientes; no son intervalos de confianza ni mediciones observadas.' } };
  return { ...body, manifest_sha256: hash(body) };
}
function runLegacy(name, p) {
  const f = legacyFinancial;
  if (name === 'financial.npv_irr') return { npv: f.netPresentValue(p.cashFlows, p.discountRate), irr: f.internalRateOfReturn(p.cashFlows) };
  if (name === 'financial.cap_rate') return { capRate: f.capRate(p.netOperatingIncome, p.propertyValue) };
  if (name === 'financial.payback') return { simple: f.paybackPeriod(p.cashFlows), discounted: p.discountRate != null ? f.discountedPaybackPeriod(p.cashFlows, p.discountRate) : null };
  if (name === 'financial.dcf') return f.discountedCashFlowValue(p.projectedCashFlows, p.discountRate, p.terminalValue);
  const keys = Object.keys(p.factors);
  return risk.monteCarloSimulate({ ...p, combine: s => keys.reduce((sum, k) => sum + s[k] * (p.factorWeights?.[k] ?? 1), 0) });
}
async function verify(job) {
  const base = { checked_at: new Date().toISOString(), snapshot_modified: false, engine_version: job.algorithm_version, verified: false, historical_integrity: false };
  if (!supported(job.algorithm_name)) return { ...base, status: 'unsupported_engine' };
  if (job.status !== 'succeeded') return { ...base, status: 'not_completed' };
  const version = job.algorithm_version, legacy = version === '1.0.0';
  if (!legacy && version !== versionFor(job.algorithm_name)) return { ...base, status: 'unsupported_version' };
  try {
    // Validate legacy inputs without changing their original ordering or numeric semantics.
    const canonical = await canonicalInput(job.algorithm_name, job.params);
    const result = legacy ? runLegacy(job.algorithm_name, job.params) : await run(job.algorithm_name, canonical);
    canonicalJson(result);
    if (!job.analysis) {
      const matches = hash(result) === hash(job.result);
      return { ...base, status: legacy ? matches ? 'legacy_replayed' : 'mismatch' : 'missing_contract', verified: legacy && matches, result_matches: matches };
    }
    if (job.analysis.contract_version !== CONTRACT_VERSION) return { ...base, status: 'unsupported_contract' };
    if (legacy || job.analysis.engine?.id !== job.algorithm_name || job.analysis.engine?.version !== version || job.analysis.engine?.source_sha256 !== fingerprint(job.algorithm_name, version)) return { ...base, status: 'engine_changed' };
    const expected = await build(job.algorithm_name, canonical, result), { manifest_sha256, ...body } = job.analysis;
    const input_matches = hash(job.params) === expected.input_sha256 && expected.input_sha256 === job.analysis.input_sha256;
    const result_matches = hash(job.result) === expected.result_sha256 && expected.result_sha256 === job.analysis.result_sha256;
    const manifest_matches = hash(body) === manifest_sha256 && manifest_sha256 === expected.manifest_sha256;
    const verified = input_matches && result_matches && manifest_matches;
    return { ...base, status: verified ? 'verified' : 'mismatch', verified, historical_integrity: verified, input_matches, result_matches, manifest_matches };
  } catch (error) {
    if (error.code === 'ENOENT') throw new ApiError(503, 'Fuentes del motor no disponibles en este despliegue.');
    return { ...base, status: 'invalid_snapshot' };
  }
}
module.exports = { supported, versionFor, canonicalInput, run, build, verify, FINANCIAL_VERSION, MONTE_CARLO_VERSION };
