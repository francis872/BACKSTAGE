// Read-only local evidence check. Does not connect to Atlas or deploy anything.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const json = name => JSON.parse(read(name).replace(/^\uFEFF/, ''));
const hash = name => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, name))).digest('hex');
const evidence = 'docs/evidence/';
const output = evidence + 'unified-operations-postflight.json';
const live = json(evidence + 'unified-operations-live.json');
assert.equal(live.status, 'passed');
assert.equal(live.owned_temporary_database_removed, true);
assert.equal(live.audit_chain_valid, true);
assert.equal(live.production_changes, false);
assert.equal(live.remote_deployment, false);
assert.equal(live.docker_used, false);
assert.equal(live.encryption_keys_ephemeral, true);
assert.equal(live.browser.runtime_errors.length, 0);
assert.equal(live.browser.login_journey_verified, true);
assert(live.checks.every(c => c.passed));
function regression(name) {
  const log = read(evidence + name);
  const number = label => Number(log.match(new RegExp('\\b' + label + ' (\\d+)\r?\n'))?.[1]);
  const result = { total: number('tests'), passed: number('pass'), failed: number('fail'), skipped: number('skipped') };
  assert(Number.isInteger(result.total) && result.total > 0);
  assert.equal(result.failed, 0);
  assert.equal(result.total, result.passed + result.skipped);
  return result;
}
const backend = regression('unified-operations-backend-tests.txt');
const frontend = regression('unified-operations-frontend-tests.txt');
assert.match(read(evidence + 'unified-operations-build.txt'), /built in [\d.]+s/);
const manifest = json('.vercel/automation-source-1792973296397/source-manifest.json');
const extraServices = ['algorithmRuntime', 'analysis', 'comparisons', 'geography', 'scoring', 'soiSanitary'];
const preserved = manifest.files.filter(f => /^worker\/(bsie|shared)\//.test(f.path) ||
  /worker\/backend\/(routes\/bsie.routes.js|scripts\/bsie-worker.js|services\/(bsie|intelligenceContract).service.js)$/.test(f.path) ||
  extraServices.some(s => f.path === `worker/backend/services/${s}.service.js`));
assert.equal(preserved.length, 25);
for (const file of preserved) assert.equal(hash(file.path.replace(/^worker\//, '')), file.sha256, `Changed preserved source: ${file.path}`);
const docs = ['BACKSTAGE_NATIVE_TRUST_ARCHITECTURE.md', 'BACKSTAGE_UNIFIED_OPERATIONS_REPORT.md', 'BACKSTAGE_UNIFIED_INCREMENTAL_PLAN.md', 'BACKSTAGE_UNIFIED_OPERATIONS_AUDIT.md'];
let links = 0;
for (const file of docs) {
  for (const match of read('docs/' + file).matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].split('#')[0];
    if (!target || /^(https?:|mailto:)/.test(target)) continue;
    const resolved = path.resolve(root, 'docs', target);
    assert(resolved.startsWith(root + path.sep));
    if (resolved !== path.join(root, output)) assert(fs.existsSync(resolved), `Missing document link: ${file} -> ${target}`);
    links++;
  }
}
const source = [
  'backend/domain/propertyOperations.js', 'backend/domain/totp.js', 'backend/utils/inputValidation.js',
  'backend/services/propertyOperations.service.js', 'backend/services/hebraCipher.service.js',
  'backend/services/identityMfa.service.js', 'backend/services/mongoIdentity.service.js',
  'backend/services/horizontalProperty.service.js', 'backend/routes/propertyOperations.routes.js',
  'backend/routes/identityMfa.routes.js', 'backend/routes/auth.routes.js', 'backend/routes/assets.routes.js',
  'backend/infrastructure/mongoIndexRegistry.js', 'backend/infrastructure/coreOpenApi.js', 'backend/infrastructure/unifiedOperationsOpenApi.js',
  'backend/repositories/operationalEvents.repository.js', 'backend/middleware/auditLogger.js',
  'frontend/src/App.jsx', 'frontend/src/components/IdentityMfaPanel.jsx',
  'frontend/src/components/AccountSecurityPanel.jsx', 'frontend/src/components/PropertyOperationsPanel.jsx',
  'frontend/src/components/HorizontalPropertyLayer.jsx', 'frontend/src/lib/api.js', 'frontend/src/lib/monetaryUnits.mjs',
  'scripts/verify-horizontal-property.js', 'scripts/property-operations-live-scenarios.js',
  'frontend/scripts/horizontal-property-browser.mjs', 'scripts/verify-unified-operations-postflight.js',
  'backend/domain/propertyOperations.test.js', 'backend/domain/identityMfa.test.js',
  'backend/domain/unifiedOperationsHttp.test.js', 'frontend/tests/monetaryUnits.test.mjs',
];
// Some tests live with their service; resolve only the expected alternative.
for (let i = 0; i < source.length; i++) if (!fs.existsSync(path.join(root, source[i])) && source[i].startsWith('backend/domain/')) {
  const alternate = source[i].replace('/domain/', '/services/');
  if (fs.existsSync(path.join(root, alternate))) source[i] = alternate;
}
const artifacts = ['unified-operations-live.json', 'unified-operations-audit.json', 'unified-operations-backend-tests.txt', 'unified-operations-frontend-tests.txt', 'unified-operations-build.txt'].map(f => evidence + f);
for (const file of [...artifacts, ...docs.map(f => 'docs/' + f)]) {
  const content = read(file);
  assert(!/mongodb(?:\+srv)?:\/\/|pk\.eyJ|bsc-[a-f0-9]{20}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+/.test(content), `Potential credential in public artifact: ${file}`);
}
const result = {
  checked_at: new Date().toISOString(), status: 'passed_with_explicit_scope_limits',
  scope: 'native_identity_security_hebra_and_contextual_ph_local_api_and_test_atlas',
  regression: { backend, frontend, build_passed: true }, live_checks: live.checks.length,
  operations_checks: live.operations_checks.length, browser_checks: live.browser.checks.length,
  owned_test_database_removed: true, canonical_audit_chain_valid: true,
  scientific_and_shared_files_unchanged: preserved.length, local_document_links_checked: links,
  scoped_public_artifact_credential_scan_passed: true, new_dependencies: [], docker_used: false,
  remote_deployment: false, production_changes: false, production_readiness: 'NO_GO',
  encryption_keys_configured_for_production: false, external_identity_dependencies: false,
  webgl_rendering_verified: false,
  sources: source.map(file => ({ file, sha256: hash(file) })),
  artifacts: [...artifacts, ...docs.map(f => 'docs/' + f)].map(file => ({ file, sha256: hash(file) })),
};
fs.writeFileSync(path.join(root, output), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, backend, frontend, operations_checks: result.operations_checks, browser_checks: result.browser_checks, preserved_sources: preserved.length }));
