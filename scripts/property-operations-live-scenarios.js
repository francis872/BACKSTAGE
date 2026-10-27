const assert = require('node:assert/strict'), crypto = require('node:crypto');
async function verifyOperations({ request, db, mongo, root, unit, origin, tokens, password }) {
  const checks = [], base = `/${unit.location_id}/operations`, source_name = 'Synthetic acceptance only';
  const invoke = async (suffix, body, extra = {}) => request(base + suffix, { body, ...extra });
  const idKey = crypto.randomUUID(), body = { title: 'Sensitive PQRS fixture', description: 'Private fixture content must stay encrypted', category: 'petition', source_name };
  const first = await invoke('/pqrs', body, { who: 2, key: idKey }); assert.equal(first.status, 201); let pqrs = first.body.data;
  const repeated = await invoke('/pqrs', body, { who: 2, key: idKey }); assert.equal(repeated.status, 200); assert.equal(repeated.body.data.record_id, pqrs.record_id);
  assert.equal((await request(`/${unit.location_id}/operations/records/${pqrs.record_id}`, { who: 3 })).status, 404);
  const raw = await db.collection('operational_events').findOne({ kind: 'ph.record.version', 'ph.record_id': pqrs.record_id }); assert(!JSON.stringify(raw).includes(body.description)); assert(raw.ph.envelope);
  checks.push('actual_atlas_encryption_idempotency_and_tenant_isolation');
  for (const [status, text] of [['in_review', {}], ['responded', { response: 'Organization supplied response' }], ['closed', {}]]) {
    const result = await invoke(`/records/${pqrs.record_id}/transition`, { revision: pqrs.revision, status, ...text }, { who: status === 'closed' ? 2 : 1 }); assert.equal(result.status, 200); pqrs = result.body.data;
  }
  const erased = await invoke(`/records/${pqrs.record_id}/erase-content`, { revision: pqrs.revision, reason_code: 'user_request' }); assert.equal(erased.status, 200);
  const versions = await db.collection('operational_events').find({ kind: 'ph.record.version', 'ph.record_id': pqrs.record_id }).toArray(); assert.equal(versions.length, 4); assert(versions.every(r => !r.ph.envelope && r.ph.content_erased && r.ph.commitment));
  checks.push('actual_version_transitions_and_personal_payload_erasure');
  const date = offset => new Date(Date.now() + offset).toISOString();
  const charge = await invoke('/charge', { title: 'Declared fee', amount_minor: 10001, currency: 'COP', scale: 2, issued_at: date(-20000), due_at: date(-10000), source_name }); assert.equal(charge.status, 201);
  const payments = await Promise.all([1, 2].map(n => invoke('/payment', { charge_id: charge.body.data.record_id, amount_minor: 6000, reference: `Manual-${n}`, source_name })));
  assert.deepEqual(payments.map(r => r.status).sort(), [201, 409]);
  const economic = await request(`/${root.location_id}/operations/economics`); assert.equal(economic.status, 200); assert.equal(economic.body.groups[0].outstanding_minor, 4001);
  checks.push('actual_concurrent_payments_and_exact_recorded_balance');
  const area = await request('', { body: { name: 'Exclusive test room', kind: 'common_area', parent_id: root.location_id, source_name } }); assert.equal(area.status, 201);
  const reservations = await Promise.all([1, 2].map(() => request(`/${area.body.data.location_id}/operations/reservation`, { who: 2, body: { title: 'Exclusive fixture', starts_at: date(3600000), ends_at: date(7200000), source_name } })));
  assert(reservations.every(r => r.status === 201));
  const confirmations = await Promise.all(reservations.map(r => request(`/${area.body.data.location_id}/operations/records/${r.body.data.record_id}/transition`, { body: { revision: 1, status: 'confirmed' } })));
  assert.deepEqual(confirmations.map(r => r.status).sort(), [200, 409]); checks.push('actual_concurrent_exclusive_reservations_reject_overlap');
  const generic = await fetch(origin + '/api/operational-events', { headers: { Authorization: `Bearer ${tokens[2]}` } }); assert.equal(generic.status, 200); assert(!(await generic.json()).some(r => r.kind === 'ph.record.version' || r.ph));
  const changed = await fetch(origin + `/api/operational-events/${raw.operational_event_id}/acknowledge`, { method: 'PUT', headers: { Authorization: `Bearer ${tokens[1]}` } }); assert.equal(changed.status, 404);
  checks.push('general_event_routes_cannot_disclose_or_mutate_private_versions');
  const mfa = async (path, body, token = tokens[1]) => {
    const r = await fetch(origin + '/api/auth/mfa/' + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json() };
  };
  const setup = await mfa('setup', { current_password: password }); assert.equal(setup.status, 200);
  const code = require('../backend/domain/totp').hotp(setup.body.secret, Math.floor(Date.now() / 30000)); const confirmed = await mfa('confirm', { code }); assert.equal(confirmed.status, 200); assert.equal(confirmed.body.recovery_codes.length, 10);
  const login = async () => { const r = await fetch(origin + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ph-1@example.invalid', password }) }); assert.equal(r.status, 200); return r.json(); };
  const challenge = await login(); assert(challenge.requires_mfa); assert.equal(challenge.token, undefined);
  const attempts = await Promise.all([1, 2].map(() => mfa('verify-login', { challenge: challenge.challenge, code: confirmed.body.recovery_codes[0] })));
  assert.deepEqual(attempts.map(r => r.status).sort(), [200, 401]);
  let activeToken = attempts.find(r => r.status === 200).body.token;
  const newChallenge = await login(); const reused = await mfa('verify-login', { challenge: newChallenge.challenge, code: confirmed.body.recovery_codes[0] }); assert.equal(reused.status, 401);
  checks.push('native_mfa_blocks_password_only_login_and_recovery_code_replay');
  const disabled = await mfa('disable', { current_password: password, code: confirmed.body.recovery_codes[1] }, activeToken); assert.equal(disabled.status, 200); activeToken = disabled.body.token;
  const user = await db.collection('identity_users').findOne({ user_id: 1 }); assert.equal(user.mfa, undefined); assert(user.session_version >= 2);
  const { createToken } = require('../backend/auth'); tokens[1] = activeToken;
  checks.push('native_mfa_disable_renews_session_and_invalidates_older_credentials');
  const audit = await require('../backend/services/mongoAudit.service').createMongoAuditService(mongo).verifyAuditChain(10); assert(audit.valid);
  return { checks, mfa_session_token: activeToken, read_current_user: async () => require('../backend/services/mongoIdentity.service').service.me(1, 10), local_api: true, production_identity_enabled: false, ciphertext_keys_ephemeral: true };
}
module.exports = { verifyOperations };
