// Opt-in verification against the user's authorized test Atlas environment.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const mongo = require('../infrastructure/soiMongo');
const report = { started_at: new Date().toISOString(), scope: 'atlas_native_services_test_tenant', checks: [], existing_records_modified: false };
const marker = `ATLAS VERIFICATION ONLY ${crypto.randomUUID()}`;
let org, user;
async function main() {
  assert(process.argv.includes('--test-environment'), 'Explicit test environment opt-in required');
  await mongo.initializeMongo({ apply: true });
  report.checks.push('additive_native_collection_indexes');
  const identity = require('../services/mongoIdentity.service').service;
  const session = await identity.register({ name: marker, organization_name: marker, email: `${crypto.randomUUID()}@example.invalid`, password: crypto.randomBytes(24).toString('hex') });
  org = session.user.organization_id; user = session.user.user_id;
  const other = org + 100000000;
  const locations = require('../services/locations.service');
  const asset = await locations.createLocation({ name: marker, type: 'property', latitude: 0, longitude: 0, metadata: { data_type: 'SIMULATED', verification_only: true } }, org);
  await assert.rejects(locations.getLocationById(asset.location_id, other), { statusCode: 404 });
  assert.equal((await locations.findNearby({ lat: 0, lng: 0, organizationId: org })).length, 1);
  report.checks.push('native_assets_zero_coordinates_and_tenant_isolation');
  const risks = require('../services/riskAssessments.service');
  const risk = await risks.createAssessment({ location_id: asset.location_id, flood_risk: .1, landslide_risk: .2, crime_risk: .3, climate_exposure: .4, data_mode: 'procedural', notes: marker }, org);
  const component = await require('../services/riskComponents.service').createComponent({ risk_id: risk.risk_id, component_type: 'threat', component_score: .2, notes: marker }, org);
  assert.equal((await risks.getLocationHistory(asset.location_id, org)).length, 1);
  assert.equal(component.organization_id, org);
  report.checks.push('native_risk_assessments_components_and_history');
  const estate = require('../services/realEstate.service');
  const valuation = await estate.createValuation({ location_id: asset.location_id, land_area_m2: 1, price_per_m2: 1, estimated_value: 1, details: { verification_only: true } }, org);
  await assert.rejects(estate.getValuationById(valuation.valuation_id, other), { statusCode: 404 });
  assert.equal((await estate.getPortfolio(org)).properties, 1);
  report.checks.push('native_valuations_and_portfolio');
  const analysis = require('../repositories/analysis.repository');
  const run = await analysis.createOperationalProject({ organizationId: org, requestedByUserId: user, projectName: marker });
  await analysis.addProjectCandidate({ analysisRunId: run.analysis_run_id, locationId: asset.location_id, organizationId: org, userId: user });
  await analysis.replaceAnalysisResults({ analysisRunId: run.analysis_run_id, ranked: [{ rank_position: 1, candidate_name: marker, location_id: asset.location_id, score_total: 80 }] });
  await analysis.bumpDependencyVersion({ analysisRunId: run.analysis_run_id, organizationId: org, dependency: 'candidates' });
  await analysis.saveProbabilityResult({ analysisRunId: run.analysis_run_id, organizationId: org, probabilityResult: { verification_only: true }, userId: user });
  const persisted = await analysis.getAnalysisRunByIdForOrganization(run.analysis_run_id, org);
  assert.equal(persisted.ranking.length, 1);
  assert.equal(persisted.metadata.dependency_versions.candidates_version, 1);
  assert.equal(await analysis.getAnalysisRunByIdForOrganization(run.analysis_run_id, other), null);
  report.checks.push('native_analysis_transaction_candidates_and_nested_metadata');
  const recommendations = require('../services/recommendations.service');
  const recommendation = await recommendations.createRecommendation({ location_id: asset.location_id, query_type: 'verification_only', analysis_run_id: run.analysis_run_id, title: marker, priority: 'low' }, session.user, { organization_id: org });
  await recommendations.reviewRecommendation(recommendation.recommendation_id, org, session.user, { decision: 'approved', notes: marker });
  assert.equal((await recommendations.getSummary(org)).by_status.approved, 1);
  report.checks.push('native_recommendation_review_events_and_aggregation');
  const events = require('../repositories/operationalEvents.repository');
  const input = { organizationId: org, eventType: 'verification_only', title: marker, dedupeKey: marker, severity: 'warning' };
  const first = await events.emitEvent(input), second = await events.emitEvent(input);
  assert.equal(first.operational_event_id, second.operational_event_id);
  assert.equal((await events.getAlertSummary({ organizationId: org })).warning, 1);
  await events.resolveEvent({ eventId: first.operational_event_id, organizationId: org, userId: user });
  report.checks.push('native_event_deduplication_resolution_and_summary');
  const territory = require('../services/territorial.service');
  const unit = await territory.createUnit({ name: marker, unit_type: 'verification_only', latitude: 0, longitude: 0 }, org);
  await territory.upsertDimensionScore({ unit_id: unit.unit_id, dimension: 'health', score: 50 }, org);
  assert.equal((await territory.getUnitIndex(unit.unit_id, org)).composite_score, 50);
  assert.equal((await territory.simulateUnit(unit.unit_id, { capacity: 1 }, org)).data_type, 'SIMULATED');
  report.checks.push('native_territorial_index_and_simulation');
  const ingestion = require('../ingestion');
  const source = await ingestion.registerIntegrationSource(marker, 'verification_only', {}, org);
  const event = await ingestion.recordIntegrationEvent(source.source_id, marker, { verification_only: true }, org);
  await assert.rejects(ingestion.markEventProcessed(event.event_id, 'processed', other), { statusCode: 404 });
  await ingestion.markEventProcessed(event.event_id, 'processed', org);
  assert.equal((await ingestion.getPendingEvents(10, org)).length, 0);
  report.checks.push('native_integration_events_and_tenant_isolation');
  assert.equal((await require('../services/insights.service').getSummary(org)).locations, 1);
  assert(!Object.keys(require.cache).some(name => /node_modules[\\/]pg[\\/]/.test(name)));
  report.checks.push('native_dashboard_and_no_alternate_database_driver');
  report.status = 'passed';
}
main().catch(error => { report.status = 'failed'; report.failure = { code: error.statusCode || error.code || error.name, message: error.name === 'AssertionError' ? error.message : 'Atlas service verification failed' }; process.exitCode = 1; }).finally(async () => {
  try {
    if (org) {
      const db = await mongo.getMongoDatabase();
      assert(await db.collection('identity_organizations').findOne({ organization_id: org, name: marker }), 'Cleanup ownership check');
      for (const name of Object.keys(mongo.INDEXES)) if (!['identity_users', 'identity_organizations', 'soi_counters', 'soi_audit_heads'].includes(name)) await db.collection(name).deleteMany({ organization_id: org });
      await db.collection('identity_users').deleteOne({ user_id: user, name: marker });
      await db.collection('identity_organizations').deleteOne({ organization_id: org, name: marker });
      report.cleanup = 'removed_only_owned_verification_tenant';
    }
  } catch { report.cleanup = 'ownership_or_connection_check_failed'; process.exitCode = 1; }
  await mongo.closeMongoConnection(); report.finished_at = new Date().toISOString();
  fs.writeFileSync(path.resolve(__dirname, '../../docs/evidence/soi-atlas-only-live.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
});
