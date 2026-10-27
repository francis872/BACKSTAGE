const C = require('../domain/horizontalProperty');
const O = require('../domain/propertyOperations');
const { currentActor } = require('./resourceAuthorization.service');
const { appendPlatformAudit } = require('./platformAudit.service');
const { createHebraCipher, canonical } = require('./hebraCipher.service');
const KIND = 'ph.record.version', TAG = 'metadata.horizontal_property';
function createPropertyOperationsService({ infrastructure = require('../infrastructure/platformMongo'), cipher = createHebraCipher(), now = Date.now } = {}) {
  const scope = (actor, locationId) => ({ organization_id: actor.organizationId, kind: KIND, 'ph.location_id': C.identifier(locationId) });
  const binding = row => ({ organization_id: row.organization_id, location_id: row.ph.location_id, record_id: row.ph.record_id, revision: row.ph.revision, record_type: row.ph.type, root_id: row.ph.root_id, created_by: row.ph.created_by, state: row.ph.status, public: row.ph.public });
  const manager = actor => ['admin', 'analyst'].includes(actor.role);
  const canTransition = (actor,row,status) => {
    if (['assembly','charge','payment','budget','expense'].includes(row.ph.type)) return actor.role==='admin';
    if (manager(actor)) return true;
    return row.ph.created_by===actor.userId && (['pqrs','reservation'].includes(row.ph.type)&&status==='cancelled' || row.ph.type==='pqrs'&&row.ph.status==='responded'&&['closed','in_review'].includes(status));
  };
  async function access(db, session, context, id, write = false) {
    const actor = await currentActor(db, session, context), asset = await db.collection('locations').findOne({ organization_id: actor.organizationId, location_id: C.identifier(id), [`${TAG}.version`]: 1, 'metadata.archived': { $ne: true } }, { session });
    if (!asset) C.fail('Selecciona una entidad PH activa de tu organización.', 404);
    if (write) {
      if (!cipher.configured()) C.fail('La protección cifrada de datos no está configurada. Contacta al administrador.', 503);
      await db.collection('identity_organizations').updateOne({ organization_id: actor.organizationId, status: 'active' }, { $inc: { membership_revision: 1 } }, { session });
      await db.collection('locations').updateOne({ organization_id: actor.organizationId, location_id: asset.location_id, 'metadata.archived': { $ne: true } }, { $inc: { [`${TAG}.operation_revision`]: 1 } }, { session });
    }
    return { actor, asset };
  }
  const allowed = (actor, row) => O.TYPES[row.ph.type].financial ? actor.role === 'admin' || actor.role === 'analyst' : manager(actor) || row.ph.created_by === actor.userId;
  function publicRecord(row, actor, payload, financialData) {
    const publicFields={...row.ph.public};
    if(O.TYPES[row.ph.type].financial && manager(actor))for(const field of ['amount_minor','due_at','issued_at','starts_at','ends_at'])if((payload||financialData)?.[field]!=null)publicFields[field]=(payload||financialData)[field];
    return { record_id: row.ph.record_id, revision: row.ph.revision, type: row.ph.type, status: row.ph.status, location_id: row.ph.location_id,
      public: publicFields, created_at: row.ph.created_at, updated_at: row.created_at, is_mine: row.ph.created_by === actor.userId,
      content_erased: row.ph.content_erased === true, commitment: row.ph.commitment, ...(payload ? { data: payload } : {}),
      can_read_content: allowed(actor, row) && !row.ph.content_erased && cipher.configured(), payment_nature: row.ph.type === 'payment' ? 'organization_recorded_manual_payment_not_bank_confirmation' : null };
  }
  async function current(db, session, actor, locationId, recordId) {
    const row = await db.collection('operational_events').findOne({ ...scope(actor, locationId), 'ph.record_id': C.identifier(recordId), 'ph.current': true }, { session });
    if (!row) C.fail('Registro no disponible en este objeto.', 404); return row;
  }
  const open = row => { if (row.ph.content_erased || !row.ph.envelope) C.fail('El contenido personal de este registro fue eliminado.', 410); return cipher.open(row.ph.envelope, row.ph.commitment, binding(row)); };
  const financial = row => ({...row.ph.public,...open(row).body});
  async function fact(db, session, actor, asset, row, action) {
    await appendPlatformAudit(infrastructure, db, session, actor, `ph.operation.${action}`, 'locations', asset.location_id, { record_id: row.ph.record_id, revision: row.ph.revision, record_type: row.ph.type, state: row.ph.status, content_commitment: row.ph.commitment });
  }
  async function replay(db, session, actor, asset, key, request) {
    const row = await db.collection('operational_events').findOne({ ...scope(actor, asset.location_id), 'ph.command_key': key }, { session });
    if (!row) return null;
    if (row.ph.command_by !== actor.userId || !allowed(actor, row)) C.fail('La clave de esta operación ya fue utilizada.', 409);
    if (canonical(open(row).request) !== canonical(request)) C.fail('La clave idempotente corresponde a otro contenido.', 409);
    return { created: false, replayed: true, data: publicRecord(row, actor, open(row).body) };
  }
  async function save(db, session, actor, asset, { type, body, status, prior, key, request, publicFields }) {
    const eventId = await infrastructure.nextId('operational_events', session), timestamp = new Date(now());
    const p = { type, location_id: asset.location_id, root_id: asset.metadata.horizontal_property.root_id, record_id: prior?.ph.record_id || eventId, revision: (prior?.ph.revision || 0) + 1, status, current: true,
      created_by: prior?.ph.created_by || actor.userId, command_by: actor.userId, command_key: key, created_at: prior?.ph.created_at || timestamp, public: publicFields || prior?.ph.public || {} };
    const row = { organization_id: actor.organizationId, operational_event_id: eventId, kind: KIND, event_type: `ph.${type}.${status}`, title: O.TYPES[type].label, severity: 'info', created_at: timestamp, resolved_at: timestamp, ph: p };
    const sealed = cipher.seal({ body, request }, binding(row)); p.envelope = sealed.envelope; p.commitment = sealed.commitment;
    if (prior) {
      const changed = await db.collection('operational_events').updateOne({ ...scope(actor, asset.location_id), operational_event_id: prior.operational_event_id, 'ph.current': true, 'ph.revision': prior.ph.revision }, { $set: { 'ph.current': false } }, { session });
      if (changed.modifiedCount !== 1) C.fail('El registro cambió. Vuelve a consultarlo.', 409);
    }
    await db.collection('operational_events').insertOne(row, { session }); await fact(db, session, actor, asset, row, prior ? 'transitioned' : 'created');
    return { created: !prior, data: publicRecord(row, actor, body) };
  }
  async function paymentTotal(db, session, actor, locationId, chargeId) {
    const rows = await db.collection('operational_events').find({ ...scope(actor, locationId), 'ph.current': true, 'ph.type': 'payment', 'ph.status': 'posted', 'ph.public.charge_id': chargeId }, { session }).limit(5001).toArray();
    if (rows.length > 5000) C.fail('El libro requiere una consulta paginada especializada.', 413);
    let total = 0; for (const row of rows) { total += financial(row).amount_minor; if (!Number.isSafeInteger(total)) C.fail('El acumulado monetario excede el rango permitido.', 413); } return total;
  }
  async function create(context, locationId, type, input, key) {
    key = C.requestKey(key); const body = O.values(type, input), spec = O.TYPES[type], request = { type, body };
    return infrastructure.withMongoTransaction(async (db, session) => {
      const { actor, asset } = await access(db, session, context, locationId, true);
      if (!spec.roles.includes(actor.role) || spec.kinds && !spec.kinds.includes(asset.metadata.horizontal_property.kind)) C.fail('Esta operación no está permitida para tu rol u objeto.', 403);
      if (type === 'expense' && Date.parse(body.paid_at) > now()) C.fail('No registres como realizado un egreso con fecha futura.');
      const repeated = await replay(db, session, actor, asset, key, request); if (repeated) return repeated;
      for (const field of ['host_user_id', 'assignee_user_id']) if (body[field] && !await db.collection('identity_memberships').findOne({ organization_id: actor.organizationId, user_id: body[field] }, { session })) C.fail('La persona debe pertenecer a la organización.', 404);
      const publicFields = {};
      for (const field of ['starts_at', 'ends_at', 'due_at', 'issued_at', 'amount_minor', 'currency', 'scale']) if (body[field] != null) publicFields[field] = body[field];
      if (type === 'payment') {
        const charge = await current(db, session, actor, locationId, body.charge_id);
        open(charge);
        if (charge.ph.type !== 'charge' || charge.ph.status !== 'posted') C.fail('Selecciona una cuenta por cobrar vigente.', 409);
        const paid = await paymentTotal(db, session, actor, locationId, charge.ph.record_id);
        if (paid + body.amount_minor > financial(charge).amount_minor) C.fail('El pago excede el saldo de la cuenta.', 409);
        Object.assign(publicFields, { charge_id: charge.ph.record_id, currency: charge.ph.public.currency, scale: charge.ph.public.scale });
      }
      if(spec.financial)for(const field of ['amount_minor','due_at','issued_at','starts_at','ends_at'])delete publicFields[field];
      return save(db, session, actor, asset, { type, body, status: spec.initial, key, request, publicFields });
    });
  }
  async function transition(context, locationId, recordId, input, key) {
    C.object(input, ['revision', 'status', 'note', 'response', 'minutes']); C.identifier(input.revision); key = C.requestKey(key);
    if (typeof input.status !== 'string' || input.note != null && (typeof input.note !== 'string' || !input.note.trim() || input.note.length > 8000)) C.fail('Indica un estado y observaciones válidos.');
    for (const field of ['response', 'minutes']) if (input[field] != null && (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > 16000)) C.fail('La respuesta o acta no es válida.');
    const request = { record_id: C.identifier(recordId), transition: input };
    return infrastructure.withMongoTransaction(async (db, session) => {
      const { actor, asset } = await access(db, session, context, locationId, true), prior = await current(db, session, actor, locationId, recordId);
      if (!allowed(actor, prior)) C.fail('No puedes modificar este registro.', 403);
      const repeated = await replay(db, session, actor, asset, key, request); if (repeated) return repeated;
      if (prior.ph.revision !== input.revision) C.fail('El registro cambió. Vuelve a consultarlo.', 409);
      const type = prior.ph.type, spec = O.TYPES[type];
      if (!spec.transitions[prior.ph.status]?.includes(input.status)) C.fail('La transición de estado no está permitida.', 409);
      if (!canTransition(actor,prior,input.status)) C.fail('La transición requiere un responsable autorizado.', 403);
      const body = open(prior).body;
      if (type === 'budget' && input.status === 'approved') {
        if (!input.note?.trim()) C.fail('Registra la referencia de aprobación interna del presupuesto.');
        body.approval = { approved_by: actor.userId, approved_at: new Date(now()).toISOString(), reference: input.note.trim(), nature: 'internal_approval_not_legal_certification' };
      }
      if (type === 'pqrs' && input.status === 'responded' && !input.response?.trim()) C.fail('Registra la respuesta antes de marcar la PQRS respondida.');
      if (type === 'assembly' && input.status === 'closed' && !input.minutes?.trim()) C.fail('Registra el acta aportada antes del cierre.');
      if (['completed', 'voided'].includes(input.status) && !input.note?.trim()) C.fail('Indica la evidencia o motivo de esta acción.');
      if (type === 'reservation' && input.status === 'confirmed') {
        const conflict = await db.collection('operational_events').findOne({ ...scope(actor, locationId), 'ph.current': true, 'ph.type': 'reservation', 'ph.status': 'confirmed', 'ph.public.starts_at': { $lt: prior.ph.public.ends_at }, 'ph.public.ends_at': { $gt: prior.ph.public.starts_at } }, { session });
        if (conflict) C.fail('El recurso ya tiene una reserva confirmada en ese horario.', 409);
        if (Date.parse(prior.ph.public.ends_at) <= now()) C.fail('No se puede confirmar una reserva que ya terminó.', 409);
      }
      if (type === 'reservation' && input.status === 'completed' && Date.parse(prior.ph.public.ends_at) > now()) C.fail('La reserva aún no ha terminado.', 409);
      if (type === 'assembly' && input.status === 'open' && Date.parse(prior.ph.public.starts_at) > now()) C.fail('La asamblea todavía no ha alcanzado su hora prevista.', 409);
      if (type === 'charge' && input.status === 'voided' && await paymentTotal(db, session, actor, locationId, prior.ph.record_id) > 0) C.fail('Revierte los pagos vinculados antes de anular la cuenta.', 409);
      const updated = { ...body, ...(input.response ? { response: input.response.trim() } : {}), ...(input.minutes ? { minutes: input.minutes.trim() } : {}), ...(input.note ? { last_note: input.note.trim() } : {}) };
      const publicFields = { ...prior.ph.public };
      if (type === 'gate_entry' && ['arrived', 'departed'].includes(input.status)) publicFields[`${input.status}_at`] = new Date(now()).toISOString();
      return save(db, session, actor, asset, { type, body: updated, status: input.status, prior, key, request, publicFields });
    });
  }
  async function list(context, locationId, query = {}) {
    C.object(query, ['type', 'before', 'limit']);
    const db = await infrastructure.getMongoDatabase(), { actor, asset } = await access(db, undefined, context, locationId);
    const limit = query.limit == null ? 30 : C.identifier(query.limit); if (limit > 100) C.fail('Máximo cien registros por consulta.');
    const filter = { ...scope(actor, locationId), 'ph.current': true };
    if (query.type) { if (!O.TYPES[query.type]) C.fail('Tipo no reconocido.'); filter['ph.type'] = query.type; }
    if (!manager(actor)) filter.$or = [{ 'ph.created_by': actor.userId }, { 'ph.type': 'reservation' }];
    if (query.before) filter.operational_event_id = { $lt: C.identifier(query.before) };
    const rows = await db.collection('operational_events').find(filter).sort({ operational_event_id: -1 }).limit(limit + 1).toArray();
    const page = rows.slice(0, limit).filter(row => !O.TYPES[row.ph.type].financial || manager(actor));
    return { data: page.map(row => publicRecord(row, actor,undefined,O.TYPES[row.ph.type].financial?financial(row):undefined)), next_before: rows.length > limit ? rows[limit - 1].operational_event_id : null,
      catalog: O.catalog(asset.metadata.horizontal_property.kind, actor.role), encryption_configured: cipher.configured(), identity_provider: 'backstage_identity' };
  }
  async function get(context, locationId, recordId) {
    return infrastructure.withMongoTransaction(async (db, session) => {
      const { actor, asset } = await access(db, session, context, locationId), row = await current(db, session, actor, locationId, recordId);
      if (!allowed(actor, row)) C.fail('El contenido de este registro es privado.', 403);
      const body = row.ph.content_erased ? null : open(row).body;
      if (body) await fact(db, session, actor, asset, row, 'content_read');
      return { data: publicRecord(row, actor, body), transitions: (O.TYPES[row.ph.type].transitions[row.ph.status] || []).filter(state=>canTransition(actor,row,state)) };
    });
  }
  async function history(context, locationId, before) {
    const db = await infrastructure.getMongoDatabase(), { actor } = await access(db, undefined, context, locationId);
    const filter = { organization_id: actor.organizationId, resource_type: 'locations', resource_id: String(C.identifier(locationId)) };
    if (before) filter.audit_log_id = { $lt: C.identifier(before) };
    if (!manager(actor)) filter.user_id = actor.userId;
    const rows = await db.collection('soi_audit_events').find(filter).sort({ audit_log_id: -1 }).limit(51).toArray();
    const page=rows.slice(0,50),valid=page.every(row=>require('./mongoAudit.service').hashEntry(row,row.prev_hash||null)===row.event_hash);
    return { data: page.map(({ _id, ...row }) => row), next_before: rows.length > 50 ? rows[49].audit_log_id : null, scope: manager(actor) ? 'selected_object' : 'own_actions_on_selected_object', integrity:{checked:true,valid,scope:'displayed_event_hashes_not_complete_organization_chain'}, verification: 'verify_complete_organization_chain_separately' };
  }
  async function erase(context, locationId, recordId, input) {
    C.object(input, ['revision', 'reason_code']); C.identifier(input.revision);
    if (!['user_request', 'retention_expired', 'administrative_correction'].includes(input.reason_code)) C.fail('Indica un motivo de eliminación válido.');
    return infrastructure.withMongoTransaction(async (db, session) => {
      const { actor, asset } = await access(db, session, context, locationId, true), row = await current(db, session, actor, locationId, recordId);
      if (actor.role !== 'admin') C.fail('La eliminación del contenido requiere administración.', 403);
      if (O.TYPES[row.ph.type].financial || !['closed', 'cancelled', 'departed', 'completed'].includes(row.ph.status)) C.fail('No se elimina contenido de registros financieros ni de operaciones abiertas.', 409);
      if (row.ph.revision !== input.revision) C.fail('El registro cambió.', 409);
      if (!row.ph.content_erased) {
        await db.collection('operational_events').updateMany({ ...scope(actor, locationId), 'ph.record_id': row.ph.record_id }, { $unset: { 'ph.envelope': '' }, $set: { 'ph.content_erased': true, 'ph.erased_at': new Date(now()), 'ph.erasure_reason_code': input.reason_code } }, { session });
        await fact(db, session, actor, asset, row, 'content_erased');
      }
      return { erased: true, record_id: row.ph.record_id, references_retained: true, backups_erasure_verified: false };
    });
  }
  async function economics(context, locationId) {
    return infrastructure.withMongoTransaction(async (db, session) => {
      const { actor, asset } = await access(db, session, context, locationId); if (!manager(actor)) C.fail('Se requiere permiso de gestión para consultar cartera.', 403);
      const rows = await db.collection('operational_events').find({ organization_id: actor.organizationId, kind: KIND, 'ph.root_id': asset.metadata.horizontal_property.root_id, 'ph.current': true, 'ph.type': { $in: ['charge', 'payment', 'budget'] }, ...(asset.location_id === asset.metadata.horizontal_property.root_id ? {} : { 'ph.location_id': asset.location_id }) }, { session }).limit(5001).toArray();
      if (rows.length > 5000) C.fail('El libro excede el límite de esta consulta.', 413);
      const groups = {};
      const decoded=new Map(rows.map(row=>[row.ph.record_id,financial(row)]));
      for (const row of rows) {
        if (row.ph.status === 'voided') continue; const p = decoded.get(row.ph.record_id), key = `${p.currency}:${p.scale}`;
        const g = groups[key] ||= { currency: p.currency, scale: p.scale, billed_minor: 0, collected_minor: 0, outstanding_minor: 0, overdue_minor: 0, budget_minor: 0 };
        if (row.ph.type === 'charge') { g.billed_minor += p.amount_minor; const paid = rows.filter(r => r.ph.type === 'payment' && r.ph.status === 'posted' && r.ph.public.charge_id === row.ph.record_id).reduce((sum, r) => sum + decoded.get(r.ph.record_id).amount_minor, 0); if (Date.parse(p.due_at) < now()) g.overdue_minor += p.amount_minor - paid; }
        if (row.ph.type === 'payment') g.collected_minor += p.amount_minor;
        if (row.ph.type === 'budget') g.budget_minor += p.amount_minor;
      }
      for (const g of Object.values(groups)) { g.outstanding_minor = g.billed_minor - g.collected_minor; g.recorded_coverage = g.budget_minor ? { numerator: g.collected_minor, denominator: g.budget_minor } : null; if (Object.values(g).some(v => typeof v === 'number' && !Number.isSafeInteger(v))) C.fail('El acumulado excede el rango monetario permitido.', 413); }
      await appendPlatformAudit(infrastructure, db, session, actor, 'ph.economics.read', 'locations', asset.location_id, { ledger_records: rows.length, calculation_version: 'ph-ledger-1' });
      return { version: 'ph-ledger-1', evaluated_at: new Date(now()).toISOString(), groups: Object.values(groups), nature: 'recorded_organization_ledger_not_bank_reconciliation', forecast: null, normative_compliance: 'not_evaluated', cross_currency_aggregation: false };
    });
  }
  async function spatialSnapshot(context, locationId, parameters) {
    return infrastructure.withMongoTransaction(async (db, session) => {
      const { actor, asset } = await access(db, session, context, locationId);
      if (!manager(actor)) C.fail('El análisis territorial requiere administración o análisis.', 403);
      return require('./propertySpatialDataset').build({ db, session, actor, asset, parameters, decode: financial, now: now() });
    });
  }
  async function economicSnapshot(context, locationId, { currency, scale }) {
    return infrastructure.withMongoTransaction(async (db, session) => {
      const { actor, asset } = await access(db, session, context, locationId);
      if (!manager(actor)) C.fail('El informe económico requiere administración o análisis.', 403);
      return require('./economicSnapshot').build({ db, session, actor, asset, currency, scale, decode: financial, now: now() });
    });
  }
  return { create, transition, list, get, history, erase, economics, spatialSnapshot, economicSnapshot };
}
module.exports = { createPropertyOperationsService, KIND };
