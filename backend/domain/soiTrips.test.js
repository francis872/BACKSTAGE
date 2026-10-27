const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SOI_GPS_RETENTION_DAYS = '30';
process.env.JWT_SECRET = 'local-soi-trip-http-test-secret';
const { createTripsService, gpsPoint, transition } = require('../services/soiTrips.service');
const timestamp = Date.parse('2026-10-20T12:00:00Z');
const trip = { trip_id: 3, organization_id: 7, user_id: 12, state: 'ACTIVE', consented_at: new Date(timestamp - 60000).toISOString() };
const point = (delta = -20000, longitude = 0) => ({ latitude: 0, longitude, accuracy_m: 10, recorded_at: new Date(timestamp + delta).toISOString() });

test('GPS point and transition validation are independent of storage', () => {
 assert.equal(gpsPoint(point(),timestamp).accuracy_m,10);
 assert.throws(()=>gpsPoint({...point(),accuracy_m:101},timestamp),{statusCode:400});
 assert.throws(()=>transition('COMPLETED','ACTIVE'),{statusCode:409});
 assert.doesNotThrow(()=>transition('ACTIVE','COMPLETED'));
});
