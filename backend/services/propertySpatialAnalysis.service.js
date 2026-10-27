const fs = require('node:fs'), path = require('node:path');
const C = require('../domain/horizontalProperty');
const D = require('../domain/propertySpatialAnalysis');
const { currentActor } = require('./resourceAuthorization.service');
const { appendPlatformAudit } = require('./platformAudit.service');
const { createHebraCipher, digest, canonical } = require('./hebraCipher.service');
const KIND = 'territorial.analysis', VERSION = 'ph-spatial-context-1';
const engineHash = () => digest(['bsie/engine.py', 'bsie/temporal.py'].map(file => ({ file, sha256: require('node:crypto').createHash('sha256').update(fs.readFileSync(path.resolve(__dirname, '../..', file))).digest('hex') })));
function createPropertySpatialAnalysisService({ infrastructure = require('../infrastructure/platformMongo'), cipher = createHebraCipher(), operations, runner = require('./bsie.service').executePython, now = Date.now } = {}) {
  operations ||= require('./propertyOperations.service').createPropertyOperationsService({ infrastructure, cipher, now });
  const scope = (actor, location) => ({ organization_id: actor.organizationId, kind: KIND, 'territorial.location_id': C.identifier(location) });
  const binding = row => ({ organization_id: row.organization_id, kind: KIND, analysis_id: row.operational_event_id, location_id: row.territorial.location_id, created_by: row.actor_user_id, command_key: row.territorial.command_key, version: row.territorial.version });
  async function access(db, session, context, location) {
    const actor = await currentActor(db, session, context);
    if (!['admin', 'analyst'].includes(actor.role)) C.fail('El análisis territorial requiere administración o análisis.', 403);
    const asset = await db.collection('locations').findOne({ organization_id: actor.organizationId, location_id: C.identifier(location), 'metadata.horizontal_property.version': 1, 'metadata.archived': { $ne: true } }, { session });
    if (!asset) C.fail('Selecciona un objeto PH activo de tu organización.', 404);
    return actor;
  }
  const open = row => cipher.open(row.territorial.envelope, row.territorial.commitment, binding(row));
  const publicRow = row => ({ analysis_id: row.operational_event_id, location_id: row.territorial.location_id, created_at: row.created_at, version: row.territorial.version, commitment: row.territorial.commitment });
  const fact = (db, session, actor, location, action, metadata) => appendPlatformAudit(infrastructure, db, session, actor, `ph.spatial.${action}`, 'locations', C.identifier(location), metadata);
  async function preview(context, location, input) {
    const parameters = D.parameters(input);
    const snapshot = await operations.spatialSnapshot(context, location, parameters);
    return { parameters, provenance: snapshot.provenance, encryption_configured: cipher.configured(), minimum_observations: parameters.method === 'weights' || parameters.method === 'kde' ? 2 : 4 };
  }
  async function list(context, location) {
    const db = await infrastructure.getMongoDatabase(), actor = await access(db, undefined, context, location);
    const rows = await db.collection('operational_events').find(scope(actor, location)).sort({ operational_event_id: -1 }).limit(31).toArray();
    return { data: rows.slice(0, 30).map(publicRow), truncated: rows.length > 30, encryption_configured: cipher.configured() };
  }
  async function loadIn(db, session, actor, location, id) {
    const row = await db.collection('operational_events').findOne({ ...scope(actor, location), operational_event_id: C.identifier(id) }, { session });
    if (!row) C.fail('El análisis no está disponible para este objeto.', 404);
    return row;
  }
  async function get(context, location, id) {
    return infrastructure.withMongoTransaction(async (db, session) => {
      const actor = await access(db, session, context, location), row = await loadIn(db, session, actor, location, id), content = open(row);
      await fact(db, session, actor, location, 'read', { analysis_id: row.operational_event_id, commitment: row.territorial.commitment });
      return { data: { ...publicRow(row), ...content } };
    });
  }
  function payload(parameters, snapshot) {
    const q = parameters;
    const input = { operation: q.method, source_crs: 'EPSG:4326', variable: 'value', data: snapshot.data, weights: q.weights, permutations: q.permutations, seed: q.seed, alpha: q.alpha, alternative: 'two_sided', correction: 'bh', repair_invalid: false, source: { name: 'PH: registros de la organización', type: 'ORGANIZATION_PROVIDED', verified: false, captured_at: snapshot.provenance.captured_at } };
    if (q.method === 'kde') input.density = { ...q.density, observation_weights: snapshot.data.features.map(f => f.properties.value) };
    if (q.method === 'temporal') { input.periods = snapshot.periods; input.method = q.temporal_method; delete input.data; }
    if (Buffer.byteLength(canonical(input)) > 40000) C.fail('La geometría o periodos exceden el tamaño de este incremento; reduce la selección.', 413);
    return input;
  }
  async function run(context, location, input, key) {
    key = C.requestKey(key);
    const parameters = D.parameters(input), db = await infrastructure.getMongoDatabase();
    const actor = await access(db, undefined, context, location);
    if (!cipher.configured()) C.fail('Configura las claves del servidor antes de guardar análisis sensibles.', 503);
    const filter = { ...scope(actor, location), 'territorial.command_key': key };
    const prior = await db.collection('operational_events').findOne(filter);
    if (prior) {
      const content = open(prior);
      if (prior.actor_user_id !== actor.userId || canonical(parameters) !== canonical(content.parameters)) C.fail('La clave idempotente corresponde a otra solicitud.', 409);
      return { created: false, data: { ...publicRow(prior), ...content } };
    }
    const snapshot = await operations.spatialSnapshot(context, location, parameters), request = payload(parameters, snapshot);
    const sourceHash = engineHash();
    const result = await runner(request, { organizationId: actor.organizationId });
    if (!result || result.operation !== parameters.method || result.version !== 'bsie-1.1.0') C.fail('La respuesta del motor científico es incompatible.', 503);
    const content = { parameters, snapshot, input: request, result, manifest: { version: VERSION, engine_version: result.version, engine_source_sha256: sourceHash, source_fingerprint_scope: 'local_repository_files_not_remote_attestation', execution_mode: process.env.SOI_SCIENCE_RPC_URL ? 'configured_science_rpc' : 'local_python', input_sha256: digest(request), result_sha256: digest(D.stable(result)), snapshot_sha256: digest(snapshot), runtime_versions: result.runtime_versions, reproducibility: 'fixed_snapshot_seed_and_configured_runtime', multiple_testing: ['local_moran', 'gi_star'].includes(parameters.method === 'temporal' ? parameters.temporal_method : parameters.method) ? 'bh_per_spatial_analysis_not_across_periods_or_repeated_runs' : null } };
    return infrastructure.withMongoTransaction(async (store, session) => {
      const current = await access(store, session, context, location);
      // Serialize role revocation and same-command requests before publishing a result.
      await store.collection('identity_organizations').updateOne({ organization_id: current.organizationId, status: 'active' }, { $inc: { membership_revision: 1 } }, { session });
      const repeat = await store.collection('operational_events').findOne(filter, { session });
      if (repeat) {
        const saved = open(repeat);
        if (repeat.actor_user_id !== current.userId || canonical(parameters) !== canonical(saved.parameters)) C.fail('La clave corresponde a otra solicitud.', 409);
        return { created: false, data: { ...publicRow(repeat), ...saved } };
      }
      const row = { operational_event_id: await infrastructure.nextId('operational_events', session), organization_id: current.organizationId, actor_user_id: current.userId, kind: KIND, event_type: 'ph.spatial.completed', title: 'Análisis territorial registrado', severity: 'info', resolved_at: new Date(now()), created_at: new Date(now()), territorial: { location_id: C.identifier(location), version: VERSION, command_key: key } };
      const sealed = cipher.seal(content, binding(row)); row.territorial.envelope = sealed.envelope; row.territorial.commitment = sealed.commitment;
      await store.collection('operational_events').insertOne(row, { session });
      await fact(store, session, current, location, 'completed', { analysis_id: row.operational_event_id, commitment: sealed.commitment, engine_source_sha256: sourceHash });
      return { created: true, data: { ...publicRow(row), ...content } };
    });
  }
  async function reproduce(context, location, id) {
    const { data } = await get(context, location, id);
    if (data.manifest.engine_source_sha256 !== engineHash()) C.fail('El código del motor cambió; usa su versión histórica para reproducir.', 409);
    if (digest(data.input) !== data.manifest.input_sha256 || digest(data.snapshot) !== data.manifest.snapshot_sha256 || digest(D.stable(data.result)) !== data.manifest.result_sha256) C.fail('El manifiesto no coincide con su instantánea.', 409);
    const result = await runner(data.input, { organizationId: context.organizationId });
    const matches = digest(D.stable(result)) === data.manifest.result_sha256;
    await infrastructure.withMongoTransaction(async (db, session) => {
      const actor = await access(db, session, context, location);
      await fact(db, session, actor, location, 'reproduced', { analysis_id: data.analysis_id, matches });
    });
    return { analysis_id: data.analysis_id, verified: matches, scope: 'same_frozen_snapshot_and_seed', source_snapshot_changed: false, historical_result_modified: false };
  }
  return { preview, list, get, run, reproduce };
}
module.exports = { createPropertySpatialAnalysisService, KIND, VERSION };
