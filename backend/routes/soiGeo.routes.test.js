const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'soi-geo-http-test-fixture-only';
const express = require('express');
const { createToken } = require('../auth');
const { createGeoRouter } = require('./soiGeo.routes');
const { resolveMembership } = require('../services/organization.service');
const ApiError = require('../utils/ApiError');

test('[HTTP/isolated] geographic router enforces fresh tenant permissions and opaque infrastructure errors', async (t) => {
  let memberships = [{ organization_id: 7, role: 'viewer' }, { organization_id: 8, role: 'analyst' }];
  let providerFailure;
  let databaseFailure;
  const calls = [];
  const source = { name: 'OSRM fixture', dataMode: 'computed', traffic: 'not_live' };
  const service = {
    capabilities: (organizationId) => ({ organizationId, autocomplete: false, profiles: ['driving'] }),
    route: async (organizationId) => { calls.push(['route', organizationId]); if (providerFailure) throw providerFailure; return { source, routes: [] }; },
    listRoutePlans: async (organizationId) => { calls.push(['list', organizationId]); if (databaseFailure) throw databaseFailure; return { data: [] }; },
    saveRoutePlan: async (organizationId, body, userId) => { calls.push(['save', organizationId, userId]); return { data: { route_plan_id: 17, organization_id: organizationId } }; },
  };
  const app = express();
  app.use(express.json());
  app.use('/geo', createGeoRouter(service, { organizationService: { getUserMemberships: async (userId) => { assert.equal(userId, 12); return memberships; }, resolveMembership } }));
  // Deliberately unsafe development fallback: geographic infrastructure errors
  // must be handled before this middleware can expose the raw message.
  app.use((error, req, res, next) => res.status(599).json({ raw: error.message }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/geo`;
  const token = createToken({ user_id: 12, role: 'admin', organization_id: 7, memberships: [{ organization_id: 7, role: 'admin' }, { organization_id: 99, role: 'admin' }] });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/capabilities`)).status, 401);
  assert.equal((await fetch(`${base}/capabilities`, { headers })).status, 200);

  const deniedSave = await fetch(`${base}/route-plans`, { method: 'POST', headers, body: '{}' });
  assert.equal(deniedSave.status, 403, 'fresh viewer role overrides signed admin claim');
  assert.equal(calls.length, 0);
  const selected = await fetch(`${base}/route-plans`, { method: 'POST', headers: { ...headers, 'x-organization-id': '8' }, body: '{}' });
  assert.equal(selected.status, 201);
  assert.equal((await selected.json()).data.organization_id, 8);
  assert.deepEqual(calls.at(-1), ['save', 8, 12]);
  const beforeDenied = calls.length;
  assert.equal((await fetch(`${base}/route-plans`, { headers: { ...headers, 'x-organization-id': '99' } })).status, 403);
  memberships = [];
  assert.equal((await fetch(`${base}/route-plans`, { headers })).status, 403);
  assert.equal(calls.length, beforeDenied, 'unauthorized and revoked requests never reach service');
  memberships = [{ organization_id: 7, role: 'viewer' }];

  const road = await fetch(`${base}/routes`, { method: 'POST', headers, body: '{}' });
  assert.equal(road.status, 200);
  assert.deepEqual((await road.json()).source, source);
  providerFailure = new ApiError(503, 'OSRM no está disponible; no se generaron resultados de reemplazo.');
  const unavailable = await fetch(`${base}/routes`, { method: 'POST', headers, body: '{}' });
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error, providerFailure.message);

  for (const [code, expected] of [['ECONNREFUSED', 503], ['ENOTFOUND', 503], ['ETIMEDOUT', 503], ['unexpected_driver_error', 500], [undefined, 500]]) {
    databaseFailure = Object.assign(new Error('Private soi_route_plans at mongodb://user:private@fixture/db ENV=private'), { code });
    const failed = await fetch(`${base}/route-plans`, { headers });
    assert.equal(failed.status, expected);
    const body = JSON.stringify(await failed.json());
    assert.doesNotMatch(body, /Private|private|mongodb|soi_route_plans|ENV|raw/);
  }
  for (const [error, expected] of [[Object.assign(new Error('mongodb://user:private@fixture soi_route_plans ENV=private'), { name: 'MongoNetworkError' }), 503], [Object.assign(new Error('E11000 private index metadata'), { code: 11000 }), 409]]) {
    databaseFailure = error;
    const failed = await fetch(`${base}/route-plans`, { headers });
    assert.equal(failed.status, expected);
    assert.doesNotMatch(JSON.stringify(await failed.json()), /mongodb|private|ENV|raw|metadata/);
  }
});
