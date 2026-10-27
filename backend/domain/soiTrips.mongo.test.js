const test = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/soiMongoMemoryFixture');
const { createTripsService } = require('../services/soiTrips.service');
process.env.SOI_GPS_RETENTION_DAYS = '30';
const base = Date.parse('2026-10-20T12:00:00Z');
const point = (offset, longitude = 0) => ({ longitude, latitude: 0, accuracy_m: 5, recorded_at: new Date(base + offset).toISOString() });
function setup() {
  const clock = { now: base };
  const memory = fixture({ soi_configuration: [{ organization_id: 7, capabilities: ['trips', 'operations'] }], soi_operations: [{ organization_id: 7, operation_id: 4 }] });
  return { memory, clock, service: createTripsService({ ...memory.options, now: () => clock.now }) };
}
test('Mongo test-double: trip consent, numeric IDs, owner/tenant isolation and operation ownership', async () => {
  const { service, memory } = setup();
  await assert.rejects(service.create(7, 12, { consent: false, retention_days: 30 }), { statusCode: 400 });
  await assert.rejects(service.create(7, 12, { consent: true, retention_days: 30, operation_id: 55 }), { statusCode: 404 });
  const trip = await service.create(7, 12, { consent: true, retention_days: 30, operation_id: 4, vehicle_id: 999 });
  assert.equal(trip.state, 'ACTIVE'); assert.equal(typeof trip.trip_id, 'number'); assert.equal(trip.vehicle_id, undefined); assert.equal(trip.expires_at.getTime(), base + 30 * 86400000);
  assert.equal((await service.list(7, 13)).length, 0);
  await assert.rejects(service.points(7, 13, trip.trip_id), { statusCode: 404 });
  await assert.rejects(service.points(8, 12, trip.trip_id), { statusCode: 409 });
  await assert.rejects(service.create(7, 12, { consent: true, retention_days: 30 }), { statusCode: 409 });
  assert.equal(memory.data().soi_trips.length, 1);
});
test('Mongo test-double: GPS append atomic distance, replay, pause, resume and terminal protection', async () => {
  const { service, clock } = setup(); const trip = await service.create(7, 12, { consent: true, retention_days: 30 }); clock.now += 30000;
  const result = await service.append(7, 12, trip.trip_id, { points: [point(20000, 0.0001), point(10000)] });
  assert.equal(result.inserted, 2); assert(result.distanceAddedM > 10 && result.distanceAddedM < 12);
  assert.equal((await service.append(7, 12, trip.trip_id, { points: [point(20000, 0.0001)] })).inserted, 0);
  assert.equal((await service.points(7, 12, trip.trip_id)).data.length, 2);
  assert.equal((await service.change(7, 12, trip.trip_id, { state: 'PAUSED' })).open, true);
  await assert.rejects(service.append(7, 12, trip.trip_id, { points: [point(30000)] }), { statusCode: 409 });
  await service.change(7, 12, trip.trip_id, { state: 'ACTIVE' });
  assert.equal((await service.change(7, 12, trip.trip_id, { state: 'COMPLETED' })).open, false);
  await assert.rejects(service.change(7, 12, trip.trip_id, { state: 'ACTIVE' }), { statusCode: 409 });
});
test('Mongo test-double: invalid batch rolls back every position and distance; no pre-consent positions', async () => {
  const { service, memory, clock } = setup(); const trip = await service.create(7, 12, { consent: true, retention_days: 30 }); clock.now += 30000;
  await assert.rejects(service.append(7, 12, trip.trip_id, { points: [point(10000), point(20000, 10)] }), { statusCode: 422 });
  assert.equal((memory.data().soi_trip_points || []).length, 0); assert.equal(memory.data().soi_trips[0].distance_m, 0); assert(memory.rolledBack() > 0);
  await assert.rejects(service.append(7, 12, trip.trip_id, { points: [point(-10000)] }), { statusCode: 400 });
});
test('Mongo test-double: expired positions hidden before TTL sweep and manual cleanup is owner scoped', async () => {
  const { service, memory, clock } = setup(); const trip = await service.create(7, 12, { consent: true, retention_days: 30 }); clock.now += 10000;
  await service.append(7, 12, trip.trip_id, { points: [point(10000)] }); clock.now += 31 * 86400000;
  assert.equal((await service.list(7, 12)).length, 0); await assert.rejects(service.points(7, 12, trip.trip_id), { statusCode: 404 });
  assert.equal((await service.purgeExpired(7, 13)).deletedTrips, 0);
  assert.equal((await service.purgeExpired(7, 12)).deletedTrips, 1); assert.equal((memory.data().soi_trip_points || []).length, 0);
});
test('Mongo test-double: injected document adapter is used without SQL queries', async () => {
  const { service } = setup(); assert.equal((await service.policy()).automaticDeletion, true); assert.deepEqual(await service.list(7, 12), []);
});
test('Mongo test-double: trip CAS conflict rejects batch without inserting positions', async () => {
  const f = setup(); const trip = await f.service.create(7, 12, { consent: true, retention_days: 30 }); f.clock.now += 10000;
  const originalCollection = f.memory.options.database.collection;
  f.memory.options.database.collection = (name) => { const collection = originalCollection(name); if (name === 'soi_trips') collection.updateOne = async () => ({ matchedCount: 0 }); return collection; };
  await assert.rejects(f.service.append(7, 12, trip.trip_id, { points: [point(10000)] }), { statusCode: 409 });
  assert.equal((f.memory.data().soi_trip_points || []).length, 0);
  assert.equal(f.memory.data().soi_trips[0].distance_m, 0);
});
