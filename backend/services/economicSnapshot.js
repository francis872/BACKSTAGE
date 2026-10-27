const C = require('../domain/horizontalProperty');
const { hashEntry } = require('./mongoAudit.service');
const { digest } = require('./hebraCipher.service');
async function build({ db, session, actor, asset, currency, scale, decode, now }) {
  const root = asset.metadata.horizontal_property.root_id;
  const rows = await db.collection('locations').find({ organization_id: actor.organizationId, 'metadata.horizontal_property.version': 1, 'metadata.horizontal_property.root_id': root }, { session }).sort({ location_id: 1 }).limit(501).toArray();
  if (rows.length > 500) C.fail('El informe económico admite hasta quinientas entidades por copropiedad.', 413);
  const selected = rows.filter(r => r.location_id === asset.location_id || r.metadata.horizontal_property.ancestry_ids.includes(asset.location_id)), ids = selected.map(r => r.location_id);
  const versions = await db.collection('operational_events').find({ organization_id: actor.organizationId, kind: 'ph.record.version', 'ph.location_id': { $in: ids }, 'ph.type': { $in: ['charge', 'payment', 'expense', 'budget'] } }, { session }).sort({ operational_event_id: 1 }).limit(5001).toArray();
  if (versions.length > 5000) C.fail('Acota el informe: más de cinco mil versiones financieras.', 413);
  const audits = versions.length ? await db.collection('soi_audit_events').find({ organization_id: actor.organizationId, action: { $in: ['ph.operation.created', 'ph.operation.transitioned'] }, 'metadata.record_id': { $in: [...new Set(versions.map(r => r.ph.record_id))] } }, { session }).limit(5001).toArray() : [];
  const events = [], budgets = [], groups = new Map(), references = [];
  for (const row of versions) {
    const body = decode(row);
    const matching = audits.filter(a => a.metadata.record_id === row.ph.record_id && a.metadata.revision === row.ph.revision && a.resource_id === String(row.ph.location_id));
    if (matching.length !== 1 || matching[0].metadata.content_commitment !== row.ph.commitment || hashEntry(matching[0], matching[0].prev_hash || null) !== matching[0].event_hash) C.fail('No se pudo autenticar la historia financiera y sus fechas.', 409);
    const prior = groups.get(row.ph.record_id) || [];
    if (row.ph.revision !== prior.length + 1 || prior.length && prior.at(-1).row.ph.current) C.fail('La historia financiera tiene versiones ausentes o inconsistentes.', 409);
    prior.push({ row, body, at: new Date(matching[0].created_at).toISOString() }); groups.set(row.ph.record_id, prior);
    references.push({ record_id: row.ph.record_id, revision: row.ph.revision, commitment: row.ph.commitment, audit_log_id: matching[0].audit_log_id, event_hash: matching[0].event_hash });
  }
  for (const group of groups.values()) {
    if (!group.at(-1).row.ph.current) C.fail('Falta la versión financiera vigente.', 409);
    const first = group[0];
    if (first.body.currency !== currency || first.body.scale !== scale) continue;
    if (first.row.ph.type === 'budget') {
      const last = group.at(-1);
      budgets.push({ id: String(last.row.ph.record_id), revision: last.row.ph.revision, entity_id: String(last.row.ph.location_id), amount_minor: String(last.body.amount_minor), currency, scale, status: last.row.ph.status, starts_at: last.body.starts_at, ends_at: last.body.ends_at, source_ref: last.body.source_name, approval: last.body.approval || null });
      continue;
    }
    const type = { payment: 'receipt', charge: 'charge', expense: 'expense' }[first.row.ph.type];
    for (const version of group) {
      if (version.body.amount_minor !== first.body.amount_minor || version.body.currency !== currency || version.body.scale !== scale) C.fail('Se modificó un importe financiero que debía ser inmutable.', 409);
      if (version.row.ph.revision === 1 ? version.row.ph.status !== 'posted' : version.row.ph.status !== 'voided' || version.row.ph.revision !== 2) C.fail('Estado financiero no reconocido para reconstrucción.', 409);
      events.push({ id: String(version.row.operational_event_id), sequence: version.row.operational_event_id, record_id: String(version.row.ph.record_id), entity_id: String(version.row.ph.location_id), kind: version.row.ph.revision === 1 ? type : `void_${type}`, amount_minor: String(version.body.amount_minor), at: version.at, ...(type === 'receipt' ? { charge_id: String(version.body.charge_id) } : {}), ...(type === 'charge' ? { due_at: version.body.due_at, declared_issued_at: version.body.issued_at } : {}), ...(type === 'expense' ? { declared_paid_at: version.body.paid_at } : {}) });
    }
  }
  const entities = selected.map(r => ({ id: String(r.location_id), kind: r.metadata.horizontal_property.kind, ancestry_ids: r.metadata.horizontal_property.ancestry_ids.map(String), coefficient_units: r.metadata.horizontal_property.coefficient_units ?? null, revision: r.metadata.horizontal_property.revision, archived: r.metadata.archived === true, geometry: r.geometry || null, source: r.metadata.provenance }));
  const organization = await db.collection('identity_organizations').findOne({ organization_id: actor.organizationId }, { session });
  return { captured_at: new Date(now).toISOString(), organization_id: actor.organizationId, selected_location_id: asset.location_id, root_id: root, coefficient_scope_complete: asset.location_id === root, currency, scale, entities, events, budgets, scope_revision: organization.membership_revision || 0, basis_sha256: digest({ entities, events, budgets }), provenance: { source: 'authenticated_PH_versions_and_canonical_audit', time_basis: 'verified_recording_time', other_currency_versions_excluded: versions.filter(r => { const g = groups.get(r.ph.record_id)[0].body; return g.currency !== currency || g.scale !== scale; }).length, retained_versions: references, bank_reconciliation: false, completeness: 'recorded_data_only_not_independently_verified' } };
}
module.exports = { build };
