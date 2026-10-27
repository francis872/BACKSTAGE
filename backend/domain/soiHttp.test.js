const test = require('node:test');
const assert = require('node:assert/strict');
process.env.JWT_SECRET = 'soi-local-http-fixture-secret';
const express = require('express');
const { createToken } = require('../auth');
const { createSoiRouter } = require('../routes/soi.routes');
const { createSoiService } = require('../services/soi.service');
const { resolveMembership } = require('../services/organization.service');

test('SOI HTTP uses current memberships, scopes MongoDB and rejects JWT role escalation or revocation', async (t) => {
  let memberships = [{ organization_id: 7, organization_name: 'Seven', role: 'viewer' }];
  const {fixture}=require('./helpers/soiMongoMemoryFixture');
  const mock=fixture({soi_configuration:[{organization_id:7,capabilities:['assets','operations']}],soi_assets:[{location_id:4,organization_id:7,name:'Scoped'}]});
  const infrastructure={getMongoDatabase:async()=>mock.options.database,withMongoTransaction:mock.options.transaction,nextId:mock.options.nextId,cleanDocument:v=>v};
  const app = express(); app.use(express.json());
  app.use('/soi', createSoiRouter(createSoiService(infrastructure), { organizationService: {
    getUserMemberships: async () => memberships, resolveMembership,
  } }));
  app.use((error, req, res, next) => res.status(error.statusCode || 500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  t.after(() => server.close());
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}/soi`;
  // JWT claims admin while the current persisted membership is viewer.
  const token = createToken({ user_id: 12, role: 'admin', organization_id: 7, memberships: [{ organization_id: 7, role: 'admin' }, { organization_id: 99, role: 'admin' }] });
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  assert.equal((await fetch(`${base}/assets`)).status, 401);
  const listed = await fetch(`${base}/assets?limit=20`, { headers });
  assert.equal(listed.status, 200); assert.equal((await listed.json()).data[0].organization_id, 7);

  assert.equal((await fetch(`${base}/assets`, { method: 'POST', headers, body: JSON.stringify({ name: 'Denied' }) })).status, 403);
  assert.equal((await fetch(`${base}/assets`, { headers: { ...headers, 'x-organization-id': '99' } })).status, 403);
  assert.equal((await fetch(`${base}/configuration`, { method: 'PUT', headers, body: '{}' })).status, 403);

  memberships = [];
  assert.equal((await fetch(`${base}/assets`, { headers })).status, 403);

  memberships = [{ organization_id: 7, role: 'analyst' }];
  assert.equal((await fetch(`${base}/assets?limit=999`, { headers })).status, 400);
  assert.equal((await fetch(`${base}/assets?limit=1%3BDROP`, { headers })).status, 400);
});
