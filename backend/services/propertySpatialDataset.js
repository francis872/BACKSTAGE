// A captured, organization-scoped projection of existing PH facts, never a new ledger.
const C = require('../domain/horizontalProperty');
const D = require('../domain/propertySpatialAnalysis');
const { digest } = require('./hebraCipher.service');
const sum = (a, b) => { const value = a + b; if (!Number.isSafeInteger(value)) C.fail('El total monetario supera la precisión entera admitida.', 413); return value; };
async function build({ db, session, actor, asset, parameters: q, decode, now }) {
  const rootId = asset.metadata.horizontal_property.root_id;
  const all = await db.collection('locations').find({ organization_id: actor.organizationId, 'metadata.horizontal_property.version': 1, 'metadata.horizontal_property.root_id': rootId, 'metadata.horizontal_property.kind': q.unit_kind, 'metadata.archived': { $ne: true } }, { session }).sort({ location_id: 1 }).limit(1001).toArray();
  if (all.length > 1000) C.fail('Acota la selección: más de mil entidades del tipo elegido en la copropiedad.', 413);
  const candidates = all.filter(r => r.location_id === asset.location_id || r.metadata.horizontal_property.ancestry_ids.includes(asset.location_id));
  if (candidates.length > D.MAX_UNITS) C.fail(`El incremento admite hasta ${D.MAX_UNITS} entidades; selecciona un contenedor más pequeño.`, 413);
  const units = candidates.filter(r => r.geometry), ids = units.map(r => r.location_id);
  const records = ids.length ? await db.collection('operational_events').find({ organization_id: actor.organizationId, kind: 'ph.record.version', 'ph.current': true, 'ph.location_id': { $in: ids }, 'ph.type': { $in: q.metric.endsWith('_minor') ? ['charge', 'payment'] : ['pqrs'] } }, { session }).sort({ operational_event_id: 1 }).limit(D.MAX_RECORDS + 1).toArray() : [];
  if (records.length > D.MAX_RECORDS) C.fail('La selección supera dos mil registros; acota el contenedor.', 413);
  const retained = records.filter(r => !r.ph.content_erased);
  const authenticated = new Map(retained.map(row => [row.ph.record_id, decode(row)]));
  const creationEvents = q.method === 'temporal' ? await db.collection('soi_audit_events').find({ organization_id: actor.organizationId, action: 'ph.operation.created', resource_type: 'locations', 'metadata.record_id': { $in: retained.map(r => r.ph.record_id) } }, { session }).limit(D.MAX_RECORDS + 1).toArray() : [];
  const creationTime = new Map();
  if (q.method === 'temporal') {
    const { hashEntry } = require('./mongoAudit.service');
    for (const row of retained) {
      const events = creationEvents.filter(e => e.metadata.record_id === row.ph.record_id && e.resource_id === String(row.ph.location_id));
      if (events.length !== 1 || hashEntry(events[0], events[0].prev_hash || null) !== events[0].event_hash || !Number.isFinite(new Date(events[0].created_at).getTime())) C.fail('No se pudo verificar la fecha de creación en la auditoría; requiere revisión.', 409);
      creationTime.set(row.ph.record_id, new Date(events[0].created_at).getTime());
    }
  }
  const values = new Map(ids.map(id => [id, 0])), perUnit = new Map(ids.map(id => [id, []]));
  for (const row of retained) perUnit.get(row.ph.location_id).push(row);
  let ledger = [];
  if (q.metric.endsWith('_minor')) {
    // Decode every financial fact before trusting its amount or linking a payment.
    ledger = retained.map(row => ({ row, body: authenticated.get(row.ph.record_id) })).filter(({ body }) => body.currency === q.currency && body.scale === q.scale);
    for (const { row, body } of ledger) {
      if (row.ph.type !== 'charge' || row.ph.status !== 'posted') continue;
      const paid = ledger.filter(v => v.row.ph.type === 'payment' && v.row.ph.status === 'posted' && v.body.charge_id === row.ph.record_id).reduce((total, v) => sum(total, v.body.amount_minor), 0);
      const balance = body.amount_minor - paid;
      if (!Number.isSafeInteger(balance) || balance < 0) C.fail('El libro presenta un saldo inconsistente; requiere revisión.', 409);
      if (q.metric === 'outstanding_minor' || Date.parse(body.due_at) < now) values.set(row.ph.location_id, sum(values.get(row.ph.location_id), balance));
    }
  } else for (const id of ids) values.set(id, perUnit.get(id).filter(r => q.metric === 'pqrs_count' || ['open', 'in_review'].includes(r.ph.status)).length);
  const feature = (r, value) => ({ type: 'Feature', id: String(r.location_id), geometry: structuredClone(r.geometry), properties: { value } });
  const data = { type: 'FeatureCollection', features: units.map(r => feature(r, values.get(r.location_id))) };
  const captured = new Date(now).toISOString();
  if (q.periods?.some(p => Date.parse(p.end) > now)) C.fail('El análisis temporal no admite periodos futuros.');
  const periods = q.periods?.map((p, i) => ({ label: `period-${i + 1}`, interval: { ...p, closure: '[start,end)' }, data: { type: 'FeatureCollection', features: units.map(r => feature(r, perUnit.get(r.location_id).filter(row => { const t = creationTime.get(row.ph.record_id); return t >= Date.parse(p.start) && t < Date.parse(p.end); }).length)) } }));
  const provenance = {
    captured_at: captured, organization_id: actor.organizationId, selected_location_id: asset.location_id, root_id: rootId,
    metric: q.metric, unit_kind: q.unit_kind, monetary_unit: q.metric.endsWith('_minor') ? { currency: q.currency, scale: q.scale, unit: 'minor_unit' } : null,
    spatial_reference: { crs: 'EPSG:4326', coordinate_order: 'longitude_latitude', geometry_policy: 'own_geometry_only_no_ancestor_imputation' },
    coverage: { candidates: candidates.length, included: units.length, excluded_unlocated: candidates.filter(r => !r.geometry).map(r => r.location_id), erased_records_excluded: records.length - retained.length, retained_records: retained.length, completeness: 'recorded_data_only_not_verified_population' },
    entities: units.map(r => ({ location_id: r.location_id, revision: r.metadata.horizontal_property.revision, geometry_sha256: digest(r.geometry), source: r.metadata.provenance })),
    records: retained.map(r => ({ record_id: r.ph.record_id, revision: r.ph.revision, commitment: r.ph.commitment })),
    ...(q.method === 'temporal' ? { temporal_timestamp_source: 'verified_canonical_creation_audit', creation_events: creationEvents.map(e => ({ audit_log_id: e.audit_log_id, event_hash: e.event_hash })) } : {}),
    limitations: ['Los ceros significan ausencia de registros retenidos en esta selección; no acreditan cobertura completa.', 'No mide riesgo sanitario ni causalidad.', 'La cartera es el saldo manual al capturar; no reconstruye balances históricos.', 'Temporal cuenta PQRS retenidas por fecha de creación; no reconstruye sus estados históricos.'],
  };
  return { data, ...(periods ? { periods } : {}), provenance };
}
module.exports = { build };
