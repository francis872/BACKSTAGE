const crypto = require('node:crypto');
const C = require('../domain/horizontalProperty');
const { currentActor } = require('./resourceAuthorization.service');
const { appendPlatformAudit } = require('./platformAudit.service');
const TAG = 'metadata.horizontal_property';
const meta = row => row.metadata.horizontal_property;
function present(row) {
  const p = meta(row);
  return { asset_id: `platform:${row.location_id}`, location_id: row.location_id, name: row.name, kind: p.kind,
    parent_id: p.parent_id, root_id: p.root_id, ancestry_ids: p.ancestry_ids, revision: p.revision,
    geometry: row.geometry || null, crs: 'EPSG:4326', coefficient_pct: p.coefficient_units == null ? null : p.coefficient_units / 10000,
    archived: row.metadata.archived === true, provenance: row.metadata.provenance, created_at: row.created_at, updated_at: row.updated_at };
}
function createHorizontalPropertyService(infrastructure = require('../infrastructure/platformMongo')) {
  const scoped = actor => ({ organization_id: actor.organizationId, [`${TAG}.version`]: C.VERSION });
  async function required(db, session, actor, id, active = true) {
    const row = await db.collection('locations').findOne({ ...scoped(actor), location_id: C.identifier(id), ...(active ? { 'metadata.archived': { $ne: true } } : {}) }, { session });
    if (!row) C.fail('Entidad no disponible en esta organización.', 404);
    return row;
  }
  async function authorize(db, session, context, write = false, archive = false) {
    const actor = await currentActor(db, session, context);
    if (write && (archive ? actor.role !== 'admin' : !['admin', 'analyst'].includes(actor.role))) C.fail('Tu rol no permite esta operación.', 403);
    if (write) await db.collection('identity_organizations').updateOne({ organization_id: actor.organizationId, status: 'active' }, { $inc: { membership_revision: 1 } }, { session });
    return actor;
  }
  async function lockRoot(db, session, actor, root, delta = 0) {
    const p = meta(root), total = p.coefficient_total_units + delta;
    if (!Number.isSafeInteger(total) || total < 0 || total > C.TOTAL_UNITS) C.fail('La suma de coeficientes no puede superar 100%.', 409);
    const changed = await db.collection('locations').updateOne({ ...scoped(actor), location_id: root.location_id, [`${TAG}.tree_revision`]: p.tree_revision, 'metadata.archived': { $ne: true } }, { $inc: { [`${TAG}.tree_revision`]: 1 }, $set: { [`${TAG}.coefficient_total_units`]: total } }, { session });
    if (changed.modifiedCount !== 1) C.fail('La jerarquía cambió. Vuelve a consultar e inténtalo otra vez.', 409);
  }
  const audit = (db, session, actor, action, row) => appendPlatformAudit(infrastructure, db, session, actor, `horizontal_property.${action}`, 'locations', row.location_id, { kind: meta(row).kind, root_id: meta(row).root_id, revision: meta(row).revision });
  async function list(context, query = {}) {
    C.object(query, ['parent_id', 'root_id', 'limit', 'offset']);
    const db = await infrastructure.getMongoDatabase(), actor = await authorize(db, undefined, context);
    const limit = query.limit == null ? 50 : C.identifier(query.limit), offset = query.offset == null ? 0 : Number(query.offset);
    if (limit > 500 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) C.fail('Paginación fuera del límite.');
    const filter = { ...scoped(actor), 'metadata.archived': { $ne: true } };
    if (query.root_id != null) filter[`${TAG}.root_id`] = C.identifier(query.root_id);
    else filter[`${TAG}.parent_id`] = query.parent_id == null || query.parent_id === 'null' ? null : C.identifier(query.parent_id);
    const rows = await db.collection('locations').find(filter).sort({ location_id: 1 }).skip(offset).limit(limit).toArray();
    const total = await db.collection('locations').countDocuments(filter);
    return { data: rows.map(present), pagination: { total, offset, limit, next: offset + rows.length < total ? offset + rows.length : null } };
  }
  async function get(context, id) {
    return infrastructure.withMongoTransaction(async (db, session) => {
      const actor = await authorize(db, session, context), row = await required(db, session, actor, id, false), p = meta(row);
      const ancestors = await db.collection('locations').find({ ...scoped(actor), location_id: { $in: p.ancestry_ids } }, { session }).limit(12).toArray();
      const ordered = p.ancestry_ids.map(id => ancestors.find(r => r.location_id === id)).filter(Boolean);
      const located = row.geometry ? row : [...ordered].reverse().find(r => r.geometry);
      const root = p.root_id === row.location_id ? row : ordered.find(r => r.location_id === p.root_id);
      const unassigned = await db.collection('locations').countDocuments({ ...scoped(actor), [`${TAG}.root_id`]: p.root_id, [`${TAG}.kind`]: 'private_unit', [`${TAG}.coefficient_units`]: null, 'metadata.archived': { $ne: true } }, { session });
      return { data: present(row), ancestors: ordered.map(present), spatial_reference: { mode: row.geometry ? 'own_geometry' : located ? 'linked_ancestor' : 'unlocated', location_id: located?.location_id || null, name: located?.name || null, geometry: located?.geometry || null },
        allocation: { total_pct: root ? meta(root).coefficient_total_units / 10000 : null, unassigned_private_units: unassigned, complete: root ? meta(root).coefficient_total_units === C.TOTAL_UNITS && unassigned === 0 : false, nature: 'organization_declared_arithmetic_only' } };
    });
  }
  async function geojson(context) {
    const db = await infrastructure.getMongoDatabase(), actor = await authorize(db, undefined, context);
    const filter = { ...scoped(actor), 'metadata.archived': { $ne: true }, geometry: { $ne: null } };
    const rows = await db.collection('locations').find(filter).sort({ location_id: 1 }).limit(500).toArray();
    const total = await db.collection('locations').countDocuments(filter);
    return { type: 'FeatureCollection', features: rows.map(row => ({ type: 'Feature', id: row.location_id, geometry: row.geometry, properties: { location_id: row.location_id, asset_id: `platform:${row.location_id}`, name: row.name, kind: meta(row).kind, root_id: meta(row).root_id, source_kind: 'ORGANIZATION_PROVIDED', geometry_mode: 'own_geometry' } })), total_located: total, truncated: total > rows.length, crs_identifier: 'EPSG:4326' };
  }
  async function create(context, input, key) {
    key = C.requestKey(key); const v = C.values(input, { create: true }), hash = crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
    return infrastructure.withMongoTransaction(async (db, session) => {
      const actor = await authorize(db, session, context, true);
      const existing = await db.collection('locations').findOne({ ...scoped(actor), [`${TAG}.creation_key`]: key }, { session });
      if (existing) { if (meta(existing).input_sha256 !== hash) C.fail('La clave ya corresponde a otro registro.', 409); return { created: false, data: present(existing) }; }
      const parent = v.parent_id == null ? null : await required(db, session, actor, v.parent_id);
      if (parent && !C.KINDS[v.kind].parents.includes(meta(parent).kind)) C.fail('Ese tipo de entidad no puede registrarse dentro del contenedor seleccionado.');
      const ancestry = parent ? [...meta(parent).ancestry_ids, parent.location_id] : [];
      if (ancestry.length > 12) C.fail('La jerarquía excede doce niveles.');
      const id = await infrastructure.nextId('locations', session), rootId = parent ? meta(parent).root_id : id;
      if (parent) await lockRoot(db, session, actor, await required(db, session, actor, rootId), v.coefficient_units || 0);
      const now = new Date(), p = { version: C.VERSION, kind: v.kind, parent_id: v.parent_id, root_id: rootId, ancestry_ids: ancestry, revision: 1, coefficient_units: v.coefficient_units, creation_key: key, input_sha256: hash, ...(parent ? {} : { tree_revision: 0, coefficient_total_units: 0 }) };
      const row = { location_id: id, organization_id: actor.organizationId, name: v.name, type: v.kind === 'coproperty' || v.kind === 'private_unit' ? 'property' : 'facility', geometry: v.geometry,
        ...(v.geometry?.type === 'Point' ? { longitude: v.geometry.coordinates[0], latitude: v.geometry.coordinates[1] } : {}),
        metadata: { archived: false, horizontal_property: p, provenance: { data_type: 'ORGANIZATION_PROVIDED', verified: false, validated: false, source: { name: v.source_name }, recorded_at: now.toISOString(), actor_user_id: actor.userId, crs: 'EPSG:4326', coordinate_order: 'longitude_latitude' } }, created_at: now, updated_at: now };
      await db.collection('locations').insertOne(row, { session }); await audit(db, session, actor, 'created', row);
      return { created: true, data: present(row) };
    });
  }
  async function mutate(context, id, input, archive = false) {
    if (archive) C.object(input, ['revision']);
    const revision = C.identifier(input?.revision);
    return infrastructure.withMongoTransaction(async (db, session) => {
      const actor = await authorize(db, session, context, true, archive), row = await required(db, session, actor, id), p = meta(row);
      if (p.revision !== revision) C.fail('El registro cambió. Vuelve a consultarlo antes de guardar.', 409);
      const v = archive ? null : C.values(input, { current: { ...p, name: row.name, geometry: row.geometry, source_name: row.metadata.provenance.source.name } });
      if (archive && await db.collection('locations').countDocuments({ ...scoped(actor), [`${TAG}.parent_id`]: row.location_id, 'metadata.archived': { $ne: true } }, { session })) C.fail('Archiva primero los elementos contenidos.', 409);
      if (archive && await db.collection('operational_events').countDocuments({ organization_id: actor.organizationId, kind: 'ph.record.version', 'ph.location_id': row.location_id, 'ph.current': true, 'ph.status': { $in: ['open', 'in_review', 'responded', 'requested', 'confirmed', 'expected', 'arrived', 'scheduled', 'in_progress', 'posted', 'planned', 'approved'] } }, { session })) C.fail('Resuelve primero las operaciones y movimientos vigentes de este objeto.', 409);
      const delta = archive ? -(p.coefficient_units || 0) : (v.coefficient_units || 0) - (p.coefficient_units || 0);
      await lockRoot(db, session, actor, await required(db, session, actor, p.root_id), delta);
      const now = new Date(), set = { updated_at: now, [`${TAG}.revision`]: revision + 1 };
      if (archive) set['metadata.archived'] = true;
      else Object.assign(set, { name: v.name, geometry: v.geometry, longitude: v.geometry?.type === 'Point' ? v.geometry.coordinates[0] : null, latitude: v.geometry?.type === 'Point' ? v.geometry.coordinates[1] : null, [`${TAG}.coefficient_units`]: v.coefficient_units,
        'metadata.provenance': { ...row.metadata.provenance, source: { name: v.source_name }, recorded_at: now.toISOString(), actor_user_id: actor.userId } });
      const changed = await db.collection('locations').findOneAndUpdate({ ...scoped(actor), location_id: row.location_id, [`${TAG}.revision`]: revision }, { $set: set }, { session, returnDocument: 'after', includeResultMetadata: false });
      if (!changed) C.fail('El registro cambió durante la operación.', 409);
      await audit(db, session, actor, archive ? 'archived' : 'updated', changed); return { data: present(changed) };
    });
  }
  return { list, get, geojson, create, update: (ctx, id, input) => mutate(ctx, id, input), archive: (ctx, id, input) => mutate(ctx, id, input, true), catalog: () => ({ version: C.VERSION, kinds: C.KINDS, coefficient_precision: 4, crs: 'EPSG:4326' }) };
}
module.exports = { createHorizontalPropertyService };
