const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDatabaseUrl } = require('../ensure-database');

test('parsea una DATABASE_URL PostgreSQL y conserva sus opciones TLS', () => {
  const result = parseDatabaseUrl('postgresql://app:secret@localhost:5432/backstage?sslmode=require');
  assert.equal(result.databaseName, 'backstage');
  assert.equal(result.url.searchParams.get('sslmode'), 'require');
});

test('rechaza protocolos y nombres de base no admitidos', () => {
  assert.throws(() => parseDatabaseUrl('mysql://app:secret@localhost:3306/backstage'), /PostgreSQL/);
  assert.throws(() => parseDatabaseUrl('postgresql://app:secret@localhost:5432/%22%3Bdrop%20database%20postgres%3B%22'), /identificador/);
  assert.throws(() => parseDatabaseUrl('postgresql://app:secret@localhost:5432/'), /identificador/);
});