// Local verification of recorded acceptance, source hashes and public artifacts.
// No database connection, deployment or mutation of historical evidence.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), base = 'docs/evidence/';
const read = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/^\uFEFF/, '');
const json = p => JSON.parse(read(p));
const hash = p => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, p))).digest('hex');
const output = base + 'spatial-context-postflight.json';
const live = json(base + 'spatial-context-live.json');
assert.equal(live.status, 'passed'); assert.equal(live.owned_temporary_database_removed, true); assert.equal(live.audit_chain_valid, true);
assert.equal(live.spatial.synthetic_only, true); assert.equal(live.spatial.source_engine_modified, false);
assert.equal(live.spatial.engine, 'bsie-1.1.0'); assert.equal(live.spatial.checks.length, 8);
assert(Math.abs(live.spatial.moran_statistic - live.spatial.independent_reference) < 1e-12);
assert.equal(live.browser.runtime_errors.length, 0);
assert(live.browser.checks.includes('actual_ui_builds_context_dataset_and_calculates_python_moran_in_test_atlas'));
assert(live.browser.checks.includes('actual_ui_reproduces_encrypted_historical_snapshot_with_same_seed'));
assert(live.browser.checks.includes('actual_ui_recalculates_with_current_data_as_a_new_evidence_record'));
for (const flag of ['production_changes', 'remote_deployment', 'docker_used']) assert.equal(live[flag], false);
function regression(file) {
  const text = read(base + file), n = field => Number(text.match(new RegExp('\\b' + field + ' (\\d+)\r?\n'))?.[1]);
  const result = { total: n('tests'), passed: n('pass'), skipped: n('skipped'), failed: n('fail') };
  assert(result.total > 0); assert.equal(result.failed, 0); assert.equal(result.total, result.passed + result.skipped); return result;
}
const regressionResults = { backend: regression('spatial-context-backend-tests.txt'), frontend: regression('spatial-context-frontend-tests.txt') };
const baseline = { backend: regression('spatial-context-baseline-backend.txt'), frontend: regression('spatial-context-baseline-frontend.txt') };
const science = read(base + 'spatial-context-science-tests.txt'); assert.match(science, /Ran 27 tests/); assert.match(science, /\bOK\b/);
assert.match(read(base + 'spatial-context-build.txt'), /built in [\d.]+s/);
const old = json('.vercel/automation-source-1792973296397/source-manifest.json');
const services = ['algorithmRuntime', 'analysis', 'comparisons', 'geography', 'scoring', 'soiSanitary'];
const preserved = old.files.filter(f => /^worker\/(bsie|shared)\//.test(f.path) || /worker\/backend\/(routes\/bsie.routes.js|scripts\/bsie-worker.js|services\/intelligenceContract.service.js)$/.test(f.path) || services.some(name => f.path === `worker/backend/services/${name}.service.js`));
assert.equal(preserved.length, 24);
for (const source of preserved) assert.equal(hash(source.path.replace(/^worker\//, '')), source.sha256, `Changed scientific/shared source: ${source.path}`);
const docs = ['docs/BACKSTAGE_SPATIAL_CONTEXT_INCREMENT.md', 'docs/BACKSTAGE_UNIFIED_INCREMENTAL_PLAN.md']; let links = 0;
for (const doc of docs) for (const m of read(doc).matchAll(/\]\(([^)]+)\)/g)) {
  const target = m[1].split('#')[0]; if (!target || /^https?:/.test(target)) continue;
  const full = path.resolve(root, path.dirname(doc), target); assert(full.startsWith(root + path.sep));
  if (full !== path.join(root, output)) assert(fs.existsSync(full), `Broken document link: ${doc} -> ${target}`); links++;
}
const sources = [
  'backend/domain/propertySpatialAnalysis.js', 'backend/domain/propertySpatialAnalysis.test.js',
  'backend/domain/helpers/soiMongoMemoryFixture.js', 'backend/services/propertySpatialDataset.js',
  'backend/services/bsie.service.js', 'backend/domain/bsie.test.js',
  'backend/services/propertySpatialAnalysis.service.js', 'backend/services/propertyOperations.service.js',
  'backend/routes/propertySpatialAnalysis.routes.js', 'backend/routes/assets.routes.js',
  'backend/repositories/operationalEvents.repository.js', 'backend/infrastructure/mongoIndexRegistry.js',
  'backend/infrastructure/propertySpatialOpenApi.js', 'backend/infrastructure/coreOpenApi.js',
  'frontend/src/components/PropertySpatialAnalysisPanel.jsx', 'frontend/src/components/HorizontalPropertyLayer.jsx',
  'scripts/property-spatial-live-scenarios.js', 'scripts/verify-horizontal-property.js',
  'frontend/scripts/horizontal-property-browser.mjs', 'scripts/verify-spatial-context-postflight.js',
];
const artifacts = ['spatial-context-live.json', 'spatial-context-backend-tests.txt', 'spatial-context-frontend-tests.txt', 'spatial-context-science-tests.txt', 'spatial-context-build.txt', 'spatial-context-baseline-backend.txt', 'spatial-context-baseline-frontend.txt'].map(f => base + f);
for (const file of [...artifacts, ...docs]) assert(!/mongodb(?:\+srv)?:\/\/|pk\.eyJ|bsc-[a-f0-9]{20}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/.test(read(file)), `Potential credential in public artifact: ${file}`);
const api = require('../backend/infrastructure/coreOpenApi');
assert.equal(Object.keys(api.paths).filter(p => p.includes('/horizontal-property/{id}/analysis')).length, 4);
const result = {
  checked_at: new Date().toISOString(), status: 'passed_with_explicit_scope_limits',
  scope: 'contextual_ph_spatial_analysis_local_python_api_browser_and_owned_test_atlas',
  baseline, regression: { ...regressionResults, scientific_passed: 27, build_passed: true },
  atlas_spatial_checks: live.spatial.checks.length, retained_operations_checks: live.operations_checks.length,
  prior_operations_acceptance_reference: live.retained_operations_acceptance || null,
  browser_checks: live.browser.checks.length, moran_statistic: live.spatial.moran_statistic, independent_reference: live.spatial.independent_reference,
  owned_temporary_database_removed: true, audit_chain_valid: true, scientific_and_shared_sources_unchanged: preserved.length,
  scientific_transport_change: 'explicit_utf8_python_stdio_and_incremental_stream_decoding_no_algorithm_changes',
  primary_navigation_unchanged: true, new_dependencies: [], docker_used: false, remote_deployment: false, production_changes: false,
  sensitive_real_data_used: false, external_identity_dependencies: false, scoped_credential_scan_passed: true, local_document_links_checked: links,
  webgl_rendering_verified: false, thematic_result_map_layer_implemented: false, production_readiness: 'NO_GO',
  sources: sources.map(file => ({ file, sha256: hash(file) })), artifacts: [...artifacts, ...docs].map(file => ({ file, sha256: hash(file) })),
};
if (fs.existsSync(path.join(root, output))) fs.copyFileSync(path.join(root, output), path.join(root, output.replace('.json', `-${Date.now()}.json`)));
fs.writeFileSync(path.join(root, output), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, regression: result.regression, atlas_checks: result.atlas_spatial_checks, browser_checks: result.browser_checks, owned_database_removed: true, preserved_sources: preserved.length }));
