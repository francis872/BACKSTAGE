const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const { setup } = require('./helpers/computationalFixture');
const { createHorizontalPropertyService } = require('../services/horizontalProperty.service');
const { createPropertyOperationsService } = require('../services/propertyOperations.service');
const { createHebraCipher } = require('../services/hebraCipher.service');
const { createMongoAuditService } = require('../services/mongoAudit.service');
const env = () => ({ HEBRA_ACTIVE_KEY_ID: 'test', HEBRA_ENCRYPTION_KEYS: JSON.stringify({ test: crypto.randomBytes(32).toString('base64') }) });
const key = () => crypto.randomUUID();
async function fixture() {
  const s = setup(), ph = createHorizontalPropertyService(s.infra), cipher = createHebraCipher(env());
  const root = (await ph.create(s.owner, { name: 'Synthetic root', kind: 'coproperty', source_name: 'Fixture' }, key())).data;
  const unit = (await ph.create(s.owner, { name: 'Synthetic unit', kind: 'private_unit', parent_id: root.location_id, source_name: 'Fixture' }, key())).data;
  const area = (await ph.create(s.owner, { name: 'Synthetic area', kind: 'common_area', parent_id: root.location_id, source_name: 'Fixture' }, key())).data;
  return { ...s, ph, root, unit, area, cipher, ops: createPropertyOperationsService({ infrastructure: s.infra, cipher, now: s.now }) };
}
const date = (s, offset) => new Date(s.now() + offset).toISOString();
const create = async (s, type, body, who = s.owner, id = s.unit.location_id) => (await s.ops.create(who, id, type, { ...body, source_name: 'Isolated fixture' }, key())).data;
const change = async (s, record, status, extra = {}, who = s.owner) => (await s.ops.transition(who, record.location_id, record.record_id, { revision: record.revision, status, ...extra }, key())).data;

test('Hebra authenticates encrypted bodies and their territorial binding, supports key rotation and rejects absent keys', () => {
  const config = env(), cipher = createHebraCipher(config), binding = { organization_id: 10, location_id: 1 }, body = { secret: 'private visitor' };
  const sealed = cipher.seal(body, binding); assert(!JSON.stringify(sealed).includes('private visitor'));
  assert.deepEqual(cipher.open(sealed.envelope, sealed.commitment, binding), body);
  assert.throws(() => cipher.open(sealed.envelope, sealed.commitment, { organization_id: 20, location_id: 1 }), { statusCode: 409 });
  const tampered = structuredClone(sealed.envelope); tampered.data.ciphertext = 'AAAA'; assert.throws(() => cipher.open(tampered, sealed.commitment, binding), { statusCode: 409 });
  const ring = JSON.parse(config.HEBRA_ENCRYPTION_KEYS); ring.next = crypto.randomBytes(32).toString('base64');
  const rotated = createHebraCipher({ HEBRA_ACTIVE_KEY_ID: 'next', HEBRA_ENCRYPTION_KEYS: JSON.stringify(ring) }); assert.deepEqual(rotated.open(sealed.envelope, sealed.commitment, binding), body);
  assert.throws(() => createHebraCipher({}).seal(body, binding), { statusCode: 503 });
});

test('PQRS persists encrypted versions, enforces transitions and keeps a private response in the selected object', async () => {
  const s = await fixture(); let row = await create(s, 'pqrs', { title: 'Private request', description: 'Sensitive fixture text', category: 'petition' }, s.viewer);
  assert(!JSON.stringify(s.f.data().operational_events).includes('Sensitive fixture text'));
  await assert.rejects(s.ops.get(s.other, row.location_id, row.record_id), { statusCode: 404 });
  await assert.rejects(change(s, row, 'responded', { response: 'Answer' }), { statusCode: 409 });
  row = await change(s, row, 'in_review'); await assert.rejects(change(s, row, 'responded'), { statusCode: 400 });
  row = await change(s, row, 'responded', { response: 'Recorded response' });
  row = await change(s, row, 'closed', {}, s.viewer);
  assert.equal((await s.ops.get(s.viewer, row.location_id, row.record_id)).data.data.response, 'Recorded response');
  assert.equal(s.f.data().operational_events.filter(r => r.kind === 'ph.record.version').length, 4);
  assert.equal((await createMongoAuditService(s.infra).verifyAuditChain(10)).valid, true);
});

test('exclusive reservations serialize confirmation, permit adjacent slots and block archiving an occupied object', async () => {
  const s = await fixture(), body = { title: 'Exclusive space', starts_at: date(s, 10000), ends_at: date(s, 20000) };
  const a = await create(s, 'reservation', body, s.viewer, s.area.location_id), b = await create(s, 'reservation', body, s.viewer, s.area.location_id);
  const confirmed = await Promise.allSettled([a, b].map(row => change(s, row, 'confirmed')));
  assert.equal(confirmed.filter(r => r.status === 'fulfilled').length, 1); assert.equal(confirmed.find(r => r.status === 'rejected').reason.statusCode, 409);
  const adjacent = await create(s, 'reservation', { ...body, starts_at: date(s, 20000), ends_at: date(s, 30000) }, s.viewer, s.area.location_id); await change(s, adjacent, 'confirmed');
  await assert.rejects(s.ph.archive(s.owner, s.area.location_id, { revision: 1 }), { statusCode: 409 });
  await assert.rejects(change(s, confirmed.find(r => r.status === 'fulfilled').value, 'completed', { note: 'Too early' }), { statusCode: 409 });
});

test('manual payments cannot exceed debt under concurrency and reversals preserve ledger and exact minor units', async () => {
  const s = await fixture(), charge = await create(s, 'charge', { title: 'Fee', amount_minor: '10001', currency: 'COP', scale: 2, issued_at: date(s, -200000), due_at: date(s, -100000) });
  const attempts = await Promise.allSettled([1, 2].map(() => create(s, 'payment', { charge_id: charge.record_id, amount_minor: '6000', reference: 'Manual receipt' })));
  assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(attempts.find(r => r.status === 'rejected').reason.statusCode, 409);
  let group = (await s.ops.economics(s.owner, s.root.location_id)).groups[0]; assert.equal(group.collected_minor, 6000); assert.equal(group.outstanding_minor, 4001); assert.equal(group.overdue_minor, 4001);
  await assert.rejects(change(s, charge, 'voided', { note: 'Must reverse first' }), { statusCode: 409 });
  await change(s, attempts.find(r => r.status === 'fulfilled').value, 'voided', { note: 'Receipt correction' });
  await change(s, charge, 'voided', { note: 'Charge correction' }); group = (await s.ops.economics(s.owner, s.root.location_id)).groups[0]; assert.equal(group, undefined);
  await assert.rejects(s.ops.economics(s.viewer, s.root.location_id), { statusCode: 403 });
});

test('financial totals reject tampered public amounts instead of silently accepting modified ciphertext metadata', async () => {
  const s = await fixture(); const charge = await create(s, 'charge', { title: 'Fee', amount_minor: 100, currency: 'USD', scale: 2, issued_at: date(s, -2000), due_at: date(s, 2000) });
  s.f.data().operational_events.find(r => r.ph?.record_id === charge.record_id).ph.public.amount_minor = 1000;
  await assert.rejects(s.ops.economics(s.owner, s.root.location_id), { statusCode: 409 });
});

test('erasing completed personal content removes every encrypted version, preserves commitments and prevents resurrection', async () => {
  const s = await fixture(), body = { title: 'Private request', description: 'Erase me', category: 'petition', source_name: 'Fixture' }, command = key();
  let row = (await s.ops.create(s.viewer, s.unit.location_id, 'pqrs', body, command)).data;
  row = await change(s, row, 'cancelled', {}, s.viewer);
  await assert.rejects(s.ops.erase(s.viewer, row.location_id, row.record_id, { revision: 2, reason_code: 'user_request' }), { statusCode: 403 });
  const result = await s.ops.erase(s.owner, row.location_id, row.record_id, { revision: 2, reason_code: 'user_request' }); assert(result.erased);
  for (const version of s.f.data().operational_events.filter(r => r.ph?.record_id === row.record_id)) { assert.equal(version.ph.envelope, undefined); assert(version.ph.commitment); }
  assert.equal((await s.ops.get(s.viewer, row.location_id, row.record_id)).data.content_erased, true);
  await assert.rejects(s.ops.create(s.viewer, s.unit.location_id, 'pqrs', body, command), { statusCode: 410 });
  assert.equal((await createMongoAuditService(s.infra).verifyAuditChain(10)).valid, true);
});

test('portería, tasks and assemblies use real recorded state transitions without asserting physical access or legal quorum', async () => {
  const s = await fixture(); let entry = await create(s, 'gate_entry', { visitor_name: 'Private visitor', reason: 'Visit' });
  entry = await change(s, entry, 'arrived'); assert(entry.public.arrived_at); entry = await change(s, entry, 'departed'); assert(entry.public.departed_at);
  let task = await create(s, 'task', { title: 'Maintenance', description: 'Actual reported work' }); task = await change(s, task, 'in_progress'); await assert.rejects(change(s, task, 'completed'), { statusCode: 400 }); await change(s, task, 'completed', { note: 'Supplied work evidence' });
  let assembly = await create(s, 'assembly', { title: 'Meeting', starts_at: date(s, -1000), agenda: 'Provided agenda' }, s.owner, s.root.location_id);
  assembly = await change(s, assembly, 'open'); await assert.rejects(change(s, assembly, 'closed'), { statusCode: 400 }); await change(s, assembly, 'closed', { minutes: 'Organization-provided minutes' });
  await assert.rejects(create(s, 'assembly', { title: 'Forbidden', starts_at: date(s, -1000), agenda: 'Agenda' }, s.analyst, s.root.location_id), { statusCode: 403 });
});

test('commands are idempotent, current roles are rechecked and unconfigured encryption never falls back to plaintext', async () => {
  const s = await fixture(), body = { title: 'Task', description: 'Private work', source_name: 'Fixture' }, command = key();
  const first = await s.ops.create(s.owner, s.unit.location_id, 'task', body, command), replay = await s.ops.create(s.owner, s.unit.location_id, 'task', body, command); assert.equal(first.data.record_id, replay.data.record_id); assert(replay.replayed);
  await assert.rejects(s.ops.create(s.owner, s.unit.location_id, 'task', { ...body, title: 'Different' }, command), { statusCode: 409 });
  const unavailable = createPropertyOperationsService({ infrastructure: s.infra, cipher: createHebraCipher({}) }); await assert.rejects(unavailable.create(s.owner, s.unit.location_id, 'task', body, key()), { statusCode: 503 });
  const listed = await s.ops.list(s.viewer, s.unit.location_id); assert.equal(listed.data.length, 0);
  s.f.data().identity_memberships.find(m => m.user_id === 1).role = 'viewer'; await assert.rejects(s.ops.create(s.owner, s.unit.location_id, 'task', body, key()), { statusCode: 403 });
});
