const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const defaults = require('../../shared/businessRules.v1.json');
const { appendPlatformAudit } = require('./platformAudit.service');
const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message, status = 400) => { throw new ApiError(status, message); };
const id = value => { if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) fail('Identificador inválido.'); return Number(value); };
function materialize(stored) {
  const rules = { ...defaults, sla_hours: { ...defaults.sla_hours, ...stored?.sla_hours }, source_max_age_hours: { ...defaults.source_max_age_hours, ...stored?.source_max_age_hours }, exception_max_hours: stored?.exception_max_hours ?? defaults.exception_max_hours };
  return { rules, revision: stored?.revision || 0, sha256: digest(rules), updated_at: stored?.updated_at || null, updated_by: stored?.updated_by || null };
}
function normalize(input) {
  const result = {};
  for (const field of ['sla_hours', 'source_max_age_hours']) {
    if (!input[field] || typeof input[field] !== 'object' || Array.isArray(input[field])) fail(`Completa ${field}.`);
    result[field] = {};
    if (Object.keys(input[field]).some(key => !Object.hasOwn(defaults[field], key))) fail('Categoría o etapa desconocida.');
    for (const key of Object.keys(defaults[field])) {
      const value = input[field][key];
      if (field === 'source_max_age_hours' && ['HISTORICAL','SIMULATED'].includes(key)) { if (value !== null) fail('Históricos y simulaciones conservan su clasificación explícita.'); result[field][key] = null; continue; }
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 87600) fail('Los plazos deben ser horas positivas, máximo 10 años.');
      result[field][key] = value;
    }
  }
  if (typeof input.exception_max_hours !== 'number' || !Number.isFinite(input.exception_max_hours) || input.exception_max_hours <= 0 || input.exception_max_hours > 168) fail('Una excepción debe durar como máximo siete días.');
  result.exception_max_hours = input.exception_max_hours;
  return result;
}
function evaluateSources(sources, policy, exceptions = [], now = Date.now()) {
  if (!Array.isArray(sources) || sources.length > 100) fail('Declara hasta 100 fuentes.');
  if(new Set(sources.map(s=>typeof s?.reference==='string'?s.reference.trim():'')).size!==sources.length)fail('Cada referencia de fuente debe ser única.');
  return sources.map(source => {
    if (!source || typeof source.reference !== 'string' || !source.reference.trim() || source.reference.length > 200 || !Object.hasOwn(policy.rules.source_max_age_hours, source.category)) fail('Fuente y categoría válidas requeridas.');
    const limit = policy.rules.source_max_age_hours[source.category];
    const observed = typeof source.observed_at === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(source.observed_at) ? Date.parse(source.observed_at) : NaN;
    let status = source.category === 'SIMULATED' ? 'simulated' : source.category === 'HISTORICAL' ? 'historical_snapshot' : !Number.isFinite(observed) ? 'timestamp_missing' : observed > now ? 'timestamp_in_future' : now - observed > limit * 3600000 ? 'stale' : 'fresh';
    const reference=source.reference.trim(), observedAt=Number.isFinite(observed)?new Date(observed).toISOString():null;
    const sourceHash=digest({reference,category:source.category,observed_at:observedAt});
    const exception = exceptions.find(e => e.source_reference === reference && e.source_sha256 === sourceHash && e.policy_sha256 === policy.sha256 && e.policy_revision === policy.revision && Date.parse(e.expires_at) > now && ['stale','timestamp_missing'].includes(status));
    if (exception) status = 'exception_recorded';
    return { reference, category: source.category, observed_at: observedAt, source_sha256: sourceHash, max_age_hours: limit, status, source_verified: false, exception_id: exception?.exception_id || null };
  });
}
function createBusinessRulesService(injected) {
  const infra = () => injected || require('../infrastructure/platformMongo');
  async function member(database, session, context, admin) {
    const filter = { organization_id: id(context.organizationId), user_id: id(context.userId) };
    const membership = await database.collection('identity_memberships').findOne(filter, { session });
    const user = await database.collection('identity_users').findOne({ user_id: filter.user_id }, { session });
    const organization = await database.collection('identity_organizations').findOne({ organization_id: filter.organization_id, status: 'active' }, { session });
    if (!membership || !user || user.status === 'disabled' || !organization || admin && membership.role !== 'admin' || !admin && !['admin','analyst'].includes(membership.role)) fail('Se requiere autorización vigente en la organización.', 403);
    return organization;
  }
  async function get(organizationId) {
    const database = await infra().getMongoDatabase();
    const organization = await database.collection('identity_organizations').findOne({ organization_id: id(organizationId), status: 'active' });
    if (!organization) fail('Organización no encontrada.', 404);
    return materialize(organization.business_policy);
  }
  async function save(context, input) {
    const values = normalize(input);
    if (!Number.isSafeInteger(input.revision) || input.revision < 0) fail('Revisión de reglas requerida.');
    return infra().withMongoTransaction(async (database, session) => {
      const organization = await member(database, session, context, true), before = materialize(organization.business_policy);
      if (input.revision !== before.revision) fail('Las reglas cambiaron; vuelve a consultarlas.',409);
      const stored = { ...values, revision: before.revision + 1, updated_by: context.userId, updated_at: new Date() };
      await database.collection('identity_organizations').updateOne({ organization_id: context.organizationId }, { $set: { business_policy: stored } }, { session });
      const after = materialize(stored);
      await appendPlatformAudit(infra(), database, session, context, 'business_rules.updated', 'identity_organizations', context.organizationId, { previous_sha256: before.sha256, ...after });
      return after;
    });
  }
  async function review(context, input) {
    return infra().withMongoTransaction(async (database, session) => {
      const organization = await member(database, session, context, false);
      const project = await database.collection('analysis_runs').findOne({ organization_id: context.organizationId, analysis_run_id: id(input.project_id) },{session});
      if (!project) fail('Proyecto no encontrado.',404);
      const policy = materialize(organization.business_policy);
      const sources = evaluateSources(input.sources, policy, project.metadata?.business_exceptions || []);
      const result = { policy_version: policy.rules.version, policy_revision: policy.revision, policy_sha256: policy.sha256, evaluated_at: new Date(), evaluated_by: context.userId, sources, requires_attention: !sources.length || sources.some(s=>['stale','timestamp_missing','timestamp_in_future'].includes(s.status)), evidence_basis: 'organization_supplied_source_metadata', scope: 'source_freshness_review_not_engine_or_source_certification' };
      // Freeze against concurrent policy edits and identity revocations through the org row.
      await database.collection('identity_organizations').updateOne({organization_id:context.organizationId},{$inc:{business_review_revision:1}},{session});
      await database.collection('analysis_runs').updateOne({organization_id:context.organizationId,analysis_run_id:project.analysis_run_id},{$set:{'metadata.business_review':result}},{session});
      await appendPlatformAudit(infra(),database,session,context,'business_rules.reviewed','analysis_runs',project.analysis_run_id,result);
      return result;
    });
  }
  async function exception(context, input) {
    if (input.rule !== 'source_freshness') fail('Solo se admiten excepciones de revisión de vigencia. Los controles de seguridad, capacidad e integridad permanecen obligatorios.');
    if (typeof input.reason !== 'string' || input.reason.trim().length < 10 || input.reason.length > 2000 || typeof input.source_reference !== 'string' || !input.source_reference.trim() || input.source_reference.length > 200) fail('Referencia y motivo de al menos diez caracteres requeridos.');
    return infra().withMongoTransaction(async (database, session) => {
      const organization = await member(database,session,context,true), policy = materialize(organization.business_policy);
      const until = typeof input.expires_at === 'string' ? Date.parse(input.expires_at) : NaN, now=Date.now();
      if(!Number.isFinite(until)||until<=now||until-now>policy.rules.exception_max_hours*3600000) fail('Vencimiento fuera del plazo autorizado.');
      if(input.policy_revision!==policy.revision||input.policy_sha256!==policy.sha256)fail('Las reglas cambiaron; revisa la excepción.',409);
      const filter={organization_id:context.organizationId,analysis_run_id:id(input.project_id)};
      const project=await database.collection('analysis_runs').findOne(filter,{session});if(!project)fail('Proyecto no encontrado.',404);
      const review=project.metadata?.business_review;
      const reviewed=review?.policy_revision===policy.revision&&review?.policy_sha256===policy.sha256?review.sources.find(s=>s.reference===input.source_reference.trim()):null;
      if(!reviewed||!['stale','timestamp_missing'].includes(evaluateSources([reviewed],policy,[],now)[0].status))fail('Primero revisa una fuente vencida o sin fecha con las reglas vigentes.',409);
      const previous=project.metadata?.business_exceptions||[];if(previous.length>=50)fail('El proyecto alcanzó 50 excepciones; conserva y revisa su historial.',409);
      const record={exception_id:crypto.randomUUID(),rule:'source_freshness',source_reference:input.source_reference.trim(),source_sha256:reviewed.source_sha256,reason:input.reason.trim(),approved_by:context.userId,approved_role:'admin',approved_at:new Date(),expires_at:new Date(until).toISOString(),policy_sha256:policy.sha256,policy_revision:policy.revision};
      await database.collection('identity_organizations').updateOne({organization_id:context.organizationId},{$inc:{business_review_revision:1}},{session});
      await database.collection('analysis_runs').updateOne(filter,{$set:{'metadata.business_exceptions':[...previous,record]}},{session});
      await appendPlatformAudit(infra(),database,session,context,'business_rules.exception_approved','analysis_runs',project.analysis_run_id,record);return record;
    });
  }
  async function assertFreshnessIn(database, session, context, projectId) {
    const organization = await member(database, session, context, false);
    const project = await database.collection('analysis_runs').findOne({organization_id:id(context.organizationId),analysis_run_id:id(projectId)},{session});
    if(!project)fail('Proyecto no encontrado.',404);
    const policy=materialize(organization.business_policy),review=project.metadata?.business_review;
    if(!review||review.policy_revision!==policy.revision||review.policy_sha256!==policy.sha256||!Array.isArray(review.sources)||!review.sources.length)fail('Revisa las fuentes del proyecto con las reglas vigentes antes de aprobar o cerrar.',409);
    const sources=evaluateSources(review.sources,policy,project.metadata?.business_exceptions||[],Date.now());
    if(sources.some(s=>!['fresh','historical_snapshot','simulated','exception_recorded'].includes(s.status)))fail('Hay fuentes vencidas, sin fecha o futuras. Actualízalas o registra una excepción autorizada antes de aprobar o cerrar.',409);
    // Serialize this decision with policy edits, source reviews and other gates.
    await database.collection('identity_organizations').updateOne({organization_id:context.organizationId},{$inc:{business_review_revision:1}},{session});
    const result={policy_revision:policy.revision,policy_sha256:policy.sha256,evaluated_at:new Date(),evaluated_by:context.userId,sources,evidence_basis:'organization_supplied_source_metadata',source_certification:false};
    await database.collection('analysis_runs').updateOne({organization_id:context.organizationId,analysis_run_id:project.analysis_run_id},{$set:{'metadata.business_last_gate':result}},{session});
    await appendPlatformAudit(infra(),database,session,context,'business_rules.gate_passed','analysis_runs',project.analysis_run_id,result);
    return result;
  }
  return { get,save,review,exception,assertFreshnessIn };
}
module.exports = { createBusinessRulesService, materialize, normalize, evaluateSources, service: createBusinessRulesService() };
