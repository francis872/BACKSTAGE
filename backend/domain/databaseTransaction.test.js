const test = require('node:test');
const assert = require('node:assert/strict');
const { pool, withTransaction } = require('../db');

test('withTransaction commits and releases its dedicated client', async () => {
  const originalConnect = pool.connect;
  const statements = [];
  const client = {
    query: async (statement) => { statements.push(statement); },
    release: () => statements.push('RELEASE'),
  };
  pool.connect = async () => client;

  try {
    const result = await withTransaction(async (transactionClient) => {
      assert.equal(transactionClient, client);
      await transactionClient.query('INSERT INTO users DEFAULT VALUES');
      return 'created';
    });

    assert.equal(result, 'created');
    assert.deepEqual(statements, ['BEGIN', 'INSERT INTO users DEFAULT VALUES', 'COMMIT', 'RELEASE']);
  } finally {
    pool.connect = originalConnect;
  }
});

test('withTransaction rolls back and releases its client after an operation fails', async () => {
  const originalConnect = pool.connect;
  const statements = [];
  const client = {
    query: async (statement) => { statements.push(statement); },
    release: () => statements.push('RELEASE'),
  };
  pool.connect = async () => client;

  try {
    await assert.rejects(
      withTransaction(async () => { throw new Error('insert failed'); }),
      /insert failed/
    );
    assert.deepEqual(statements, ['BEGIN', 'ROLLBACK', 'RELEASE']);
  } finally {
    pool.connect = originalConnect;
  }
});