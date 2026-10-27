const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/soiMongoMemoryFixture');
const { createFleetService } = require('../services/soiFleet.service');
const base = Date.parse('2026-10-20T12:00:00Z');
function setup() {
  const clock = { now: base };
  const memory = fixture({ soi_configuration: [{ organization_id: 7, capabilities: ['fleet'] }, { organization_id: 8, capabilities: ['fleet'] }], soi_vehicles: [{ vehicle_id: 1, organization_id: 7, plate: 'TEST-ONLY' }, { vehicle_id: 2, organization_id: 8, plate: 'TEST-OTHER-TENANT' }] });
  const service = createFleetService({ ...memory.options, now: () => clock.now });
  const source = () => service.createSource(7, 12, { name: 'Isolated test integration', provider: 'Mock GPS vendor', authorization_reference: 'Test fixture consent only', consent: true, retention_days: 30, data_type: 'EXTERNAL_API', private_secret: 'must-not-persist' });
  const position = (offset = 10000, longitude = 0, event = 'test-1') => ({ event_id: event, longitude, latitude: 0, accuracy_m: 5, recorded_at: new Date(base + offset).toISOString(), private_flag: true });
  return { memory, service, clock, source, position };
}
test('Mongo test-double: source authorization whitelist, retention and capabilities', async () => {
  const f = setup();
  await assert.rejects(f.service.createSource(7, 12, { consent: false }), { statusCode: 400 });
  await assert.rejects(f.service.createSource(7, 12, { consent: true, data_type: 'SIMULATED', retention_days: 30 }), { statusCode: 400 });
  const source = await f.source(); assert.equal(typeof source.source_id, 'number'); assert.equal(source.private_secret, undefined); assert.equal(source.verification, 'ORGANIZATION_DECLARED_NOT_INDEPENDENTLY_VERIFIED');
  assert.equal(f.memory.data().soi_fleet_sources[0].private_secret, undefined); assert.equal((await f.service.sources(8)).length, 0);
  await assert.rejects(f.service.updateSource(8, source.source_id, { active: false }), { statusCode: 404 });
  await assert.rejects(f.service.sources(9), { statusCode: 409 });
});
test('Mongo test-double: ingestion uses explicit external source and tenant vehicle; browser flags discarded', async () => {
  const f = setup(), source = await f.source(); f.clock.now += 10000;
  const payload = { source_id: source.source_id, consent: true, positions: [f.position()] };
  await assert.rejects(f.service.ingest(7, 12, 2, payload), { statusCode: 404 });
  await assert.rejects(f.service.ingest(8, 12, 2, payload), { statusCode: 404 });
  assert.equal((await f.service.ingest(7, 12, 1, payload)).inserted, 1);
  const stored = (await f.service.positions(7, 1)).data[0]; assert.equal(stored.data_type, 'EXTERNAL_API'); assert.equal(stored.private_flag, undefined); assert.equal(stored.user_id, undefined); assert.equal(stored.ingested_by, 12);
  const status = await f.service.status(7); assert.equal(status.data.length, 1); assert.equal(status.data[0].transmission_status, 'RECENT'); assert.equal(status.data[0].latest_position.source_id, source.source_id);
});
test('Mongo test-double: event replay idempotent; conflicting duplicate and impossible jumps roll back', async () => {
  const f = setup(), source = await f.source(); f.clock.now += 30000;
  const payload = { source_id: source.source_id, consent: true, positions: [f.position()] };
  await f.service.ingest(7, 12, 1, payload); assert.equal((await f.service.ingest(7, 12, 1, payload)).duplicates, 1);
  await assert.rejects(f.service.ingest(7, 12, 1, { ...payload, positions: [f.position(10000, 1)] }), { statusCode: 409 });
  await assert.rejects(f.service.ingest(7, 12, 1, { ...payload, positions: [f.position(20000, 0.0001, 'test-2'), f.position(30000, 10, 'test-3')] }), { statusCode: 422 });
  assert.equal(f.memory.data().soi_vehicle_positions.length, 1); assert(f.memory.rolledBack() >= 2);
});
test('Mongo test-double: revoked sources deny ingestion, stale status and expired history are explicit', async () => {
  const f = setup(), source = await f.source(); f.clock.now += 10000;
  const payload = { source_id: source.source_id, consent: true, positions: [f.position()] }; await f.service.ingest(7, 12, 1, payload);
  f.clock.now += 121000; assert.equal((await f.service.status(7)).data[0].transmission_status, 'STALE');
  await f.service.updateSource(7, source.source_id, { active: false }); f.clock.now = base + 20000;
  await assert.rejects(f.service.ingest(7, 12, 1, { ...payload, positions: [f.position(20000, 0, 'test-2')] }), { statusCode: 404 });
  assert.equal((await f.service.status(7)).data[0].transmission_status, 'NO_AUTHORIZED_TRANSMISSION');
  f.clock.now += 31 * 86400000; assert.equal((await f.service.positions(7, 1)).data.length, 0);
});
test('Mongo test-double: pre-consent, absent event, inaccurate, stale and bulk duplicated events rejected', async () => {
  const f = setup(), source = await f.source(); f.clock.now += 10000;
  const payload = { source_id: source.source_id, consent: true };
  for (const positions of [[f.position(-1000)], [{ ...f.position(), event_id: '' }], [{ ...f.position(), accuracy_m: 101 }], [f.position(-61000)], [f.position(), f.position()]]) await assert.rejects(f.service.ingest(7, 12, 1, { ...payload, positions }), { statusCode: 400 });
  assert.equal((f.memory.data().soi_vehicle_positions || []).length, 0);
});
test('Mongo test-double: source authorization CAS conflict aborts every telemetry write', async () => {
  const f = setup(), source = await f.source(); f.clock.now += 10000;
  const originalCollection = f.memory.options.database.collection;
  f.memory.options.database.collection = (name) => { const collection = originalCollection(name); if (name === 'soi_fleet_sources') collection.updateOne = async () => ({ matchedCount: 0 }); return collection; };
  await assert.rejects(f.service.ingest(7, 12, 1, { source_id: source.source_id, consent: true, positions: [f.position()] }), { statusCode: 409 });
  assert.equal((f.memory.data().soi_vehicle_positions || []).length, 0);
  assert.equal(f.memory.data().soi_vehicles[0].telemetry_version, undefined);
});
