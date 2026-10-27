const test = require('node:test');
const assert = require('node:assert/strict');
const { createTerritoryResolver } = require('./territoryResolver.service');

test('[unit/Mongo isolated] public Nominatim holds shared Mongo lease and cooldown across resolver instances', async () => {
  let lease;
  let clock = 10000;
  let requests = 0;
  const collection = {
    findOneAndUpdate: async (filter, update) => {
      assert.equal(filter._id, 'nominatim-public');
      if (!lease || lease.expires_at > filter.expires_at.$lte) return null;
      lease = { ...lease, ...update.$set };
      return lease;
    },
    insertOne: async (document) => { if (lease) throw Object.assign(new Error('duplicate fixture'), { code: 11000 }); lease = { ...document }; },
    updateOne: async (filter, update) => {
      assert.equal(filter.token, lease.token);
      assert.equal(update.$set.expires_at.getTime(), clock + 1000);
      lease.expires_at = update.$set.expires_at;
      delete lease.token;
    },
  };
  const mongoInfrastructure = { getMongoDatabase: async () => ({ collection: (name) => { assert.equal(name, 'soi_provider_locks'); return collection; } }) };
  const settings = { mongoInfrastructure, now: () => clock, fetchImpl: async () => { requests += 1; assert.ok(lease.token); assert.equal(lease.expires_at.getTime(), clock + 30000); return { ok: true, json: async () => [] }; } };
  const first = createTerritoryResolver(settings);
  const second = createTerritoryResolver(settings);
  await first.geocode('Miami');
  await assert.rejects(() => second.geocode('Los Angeles'), { statusCode: 503 });
  assert.equal(requests, 1, 'global lease rejects second instance before upstream call');
  clock += 1001;
  await second.geocode('Los Angeles');
  assert.equal(requests, 2);
});

test('[unit/Mongo isolated] public Nominatim fails closed when MongoDB is unavailable', async () => {
  let network = false;
  const resolver = createTerritoryResolver({ mongoInfrastructure: { getMongoDatabase: async () => { throw new Error('Mongo offline fixture'); } }, fetchImpl: async () => { network = true; } });
  await assert.rejects(() => resolver.geocode('Miami'), { statusCode: 503 });
  assert.equal(network, false);
});
