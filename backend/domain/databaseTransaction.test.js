const test = require('node:test');
const assert = require('node:assert/strict');
const { withTransaction, assertDatabaseAvailable } = require('../db');

test('production rejects the in-memory database fallback', () => {
  assert.throws(
    () => assertDatabaseAvailable(true, 'production'),
    (error) => error.statusCode === 503 && /PostgreSQL/.test(error.message)
  );
  assert.doesNotThrow(() => assertDatabaseAvailable(true, 'test'));
});

test('withTransaction commits and releases its dedicated client', async () => {
  const statements = [];
  const client = {
    query: async (statement) => { statements.push(statement); },
    release: () => statements.push('RELEASE'),
  };
  const databasePool = { connect: async () => client };

  const result = await withTransaction(async (transactionClient) => {
    assert.equal(transactionClient, client);
    await transactionClient.query('INSERT INTO users DEFAULT VALUES');
    return 'created';
  }, databasePool);

  assert.equal(result, 'created');
  assert.deepEqual(statements, ['BEGIN', 'INSERT INTO users DEFAULT VALUES', 'COMMIT', 'RELEASE']);
});

test('withTransaction rolls back and releases its client after an operation fails', async () => {
  const statements = [];
  const client = {
    query: async (statement) => { statements.push(statement); },
    release: () => statements.push('RELEASE'),
  };
  const databasePool = { connect: async () => client };

  await assert.rejects(
    withTransaction(async () => { throw new Error('insert failed'); }, databasePool),
    /insert failed/
  );
  assert.deepEqual(statements, ['BEGIN', 'ROLLBACK', 'RELEASE']);
});