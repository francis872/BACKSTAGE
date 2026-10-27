// Read-only guard: a missing gate is a blocker, never an implicit approval.
const fs = require('node:fs');
const {target}=require('../backend/domain/deploymentTarget');
function evaluate({ env = process.env, acceptance = {}, stagingTarget } = {}) {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed: passed === true });
  let productionTarget;
  try { productionTarget = target(env.MONGODB_URI, env.MONGODB_DB); } catch {}
  check('explicit_production_environment', env.BACKSTAGE_RUNTIME_ENV === 'production');
  check('production_database_distinct_from_staging', Boolean(productionTarget && stagingTarget && productionTarget !== stagingTarget));
  check('production_atlas_project_and_cluster_verified', acceptance.atlas_isolation_verified === true);
  check('scoped_database_credentials_verified', acceptance.least_privilege_verified === true);
  check('supervised_worker_verified', acceptance.worker_restart_recovery_verified === true);
  check('independent_monitor_verified', acceptance.independent_monitor_verified === true);
  check('scheduled_backup_external_custody_verified', acceptance.backup_schedule_and_custody_verified === true);
  check('isolated_restore_verified', acceptance.isolated_restore_verified === true);
  check('commercial_freshness_workflows_verified', acceptance.freshness_workflows_verified === true);
  check('capacity_and_functional_acceptance_verified', acceptance.capacity_and_functional_acceptance_verified === true);
  check('compatible_rollback_verified', acceptance.compatible_rollback_verified === true);
  check('mail_delivery_verified', acceptance.mail_delivery_verified === true);
  check('authorized_gps_delivery_verified', acceptance.authorized_gps_delivery_verified === true);
  check('satellite_catalog_verified', acceptance.satellite_catalog_verified === true);
  const ids = acceptance.deployment_ids;
  check('acceptance_bound_to_exact_deployments', typeof ids?.api === 'string' && /^dpl_[a-zA-Z0-9]+$/.test(ids.api) && typeof ids?.web === 'string' && /^dpl_[a-zA-Z0-9]+$/.test(ids.web));
  check('acceptance_recent', Number.isFinite(Date.parse(acceptance.checked_at)) && Date.now() - Date.parse(acceptance.checked_at) >= 0 && Date.now() - Date.parse(acceptance.checked_at) <= 24 * 3600000);
  return { status: checks.every(c => c.passed) ? 'ready_for_review' : 'blocked', mode: 'offline_operational_checklist',
    evidence_authenticity_verified: false, automatic_promotion_authorized: false,
    checked_at: new Date().toISOString(), production_changes: false, checks };
}
if (require.main === module) {
  try {
    const filename = process.argv[2], acceptance = filename ? JSON.parse(fs.readFileSync(filename, 'utf8')) : {};
    const stagingTarget = process.env.BACKSTAGE_STAGING_TARGET_SHA256;
    const result = evaluate({ acceptance, stagingTarget }); console.log(JSON.stringify(result, null, 2));
    if (result.status !== 'ready_for_review') process.exitCode = 1;
  } catch { console.error(JSON.stringify({ status: 'blocked', code: 'INVALID_PREFLIGHT_CONFIGURATION', production_changes: false })); process.exitCode = 1; }
}
module.exports = { target, evaluate };
