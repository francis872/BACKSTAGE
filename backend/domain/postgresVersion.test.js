const test = require('node:test');
const assert = require('node:assert/strict');
const { postgresMajor, assertPostgres17 } = require('../utils/postgresVersion');

test('accepts PostgreSQL 17 version strings and server_version_num', () => {
  assert.equal(postgresMajor('17.4'), 17);
  assert.equal(postgresMajor('170004'), 17);
  assert.equal(assertPostgres17('170004'), 17);
});

test('rejects PostgreSQL 16, newer unapproved majors, and unknown versions', () => {
  assert.throws(() => assertPostgres17('160009'), /PostgreSQL 17 is required/);
  assert.throws(() => assertPostgres17('18.0'), /PostgreSQL 17 is required/);
  assert.throws(() => assertPostgres17('unknown'), /PostgreSQL 17 is required/);
});