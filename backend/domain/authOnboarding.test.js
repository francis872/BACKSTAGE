const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'auth-onboarding-test-secret-32-characters-long';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/backstage_test';

const database = require('../db');
const app = require('../index');

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test('fresh browser contract creates workspace, admin membership, session, login, and /me atomically', async (context) => {
  const originalQuery = database.pool.query;
  const originalConnect = database.pool.connect;
  const state = {
    organizations: [],
    users: [],
    memberships: [],
    nextOrganizationId: 1,
    nextUserId: 1,
    roleAvailable: true,
    failMembershipInsert: false,
    transactionSnapshot: null,
  };

  const query = async (text, params = []) => {
    const sql = text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (sql.includes('select user_id from users where email')) {
      const user = state.users.find((entry) => entry.email === params[0]);
      return { rows: user ? [{ user_id: user.user_id }] : [], rowCount: user ? 1 : 0 };
    }
    if (sql.includes('select role_id from roles where name')) {
      return state.roleAvailable && params[0] === 'admin'
        ? { rows: [{ role_id: 1 }], rowCount: 1 }
        : { rows: [], rowCount: 0 };
    }
    if (sql.includes('from user_roles ur')) {
      const userId = Number(params[0]);
      const rows = state.memberships.filter((membership) => membership.user_id === userId).map((membership) => {
        const organization = state.organizations.find((entry) => entry.organization_id === membership.organization_id);
        return {
          organization_id: membership.organization_id,
          organization_slug: organization.slug,
          organization_name: organization.name,
          role: 'admin',
        };
      });
      return { rows, rowCount: rows.length };
    }
    if (sql.startsWith('select * from users where email')) {
      const user = state.users.find((entry) => entry.email === params[0]);
      return { rows: user ? [user] : [], rowCount: user ? 1 : 0 };
    }
    if (sql.startsWith('select user_id, email, name, role, created_at, updated_at from users where user_id')) {
      const user = state.users.find((entry) => entry.user_id === Number(params[0]));
      if (!user) return { rows: [], rowCount: 0 };
      const { user_id, email, name, role, created_at, updated_at } = user;
      return { rows: [{ user_id, email, name, role, created_at, updated_at }], rowCount: 1 };
    }
    if (sql.includes('insert into organizations')) {
      const organization = {
        organization_id: state.nextOrganizationId++,
        name: params[0],
        slug: params[1],
        status: 'active',
      };
      state.organizations.push(organization);
      return { rows: [organization], rowCount: 1 };
    }
    if (sql.includes('insert into users')) {
      const user = {
        user_id: state.nextUserId++,
        email: params[0],
        name: params[1],
        password_hash: params[2],
        role: 'admin',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      state.users.push(user);
      return { rows: [{ user_id: user.user_id }], rowCount: 1 };
    }
    if (sql.includes('insert into user_roles')) {
      if (state.failMembershipInsert) {
        const error = new Error('membership insert failed');
        error.code = 'XX000';
        throw error;
      }
      state.memberships.push({ user_id: Number(params[0]), role_id: Number(params[1]), organization_id: Number(params[2]) });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };

  database.pool.query = query;
  database.pool.connect = async () => {
    let released = false;
    return {
      query: async (text, params) => {
        const sql = text.trim().toUpperCase();
        if (sql === 'BEGIN') state.transactionSnapshot = clone(state);
        if (sql === 'COMMIT') state.transactionSnapshot = null;
        if (sql === 'ROLLBACK' && state.transactionSnapshot) {
          const snapshot = state.transactionSnapshot;
          for (const key of Object.keys(snapshot)) state[key] = snapshot[key];
          state.transactionSnapshot = null;
        }
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [], rowCount: 0 };
        return query(text, params);
      },
      release: () => { released = true; },
      get released() { return released; },
    };
  };

  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    database.pool.query = originalQuery;
    database.pool.connect = originalConnect;
    server.close();
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const email = `fresh-${Date.now()}@example.test`;
  const password = 'ValidPassword123!';
  const payload = { name: 'Fresh Release User', email, password, organization_name: 'Fresh Release Workspace' };

  const register = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  assert.equal(register.status, 201);
  assert.match(register.headers.get('content-type'), /application\/json/);
  const created = await register.json();
  assert.ok(created.token);
  assert.equal(created.user.name, payload.name);
  assert.equal(created.user.email, email);
  assert.equal(created.user.role, 'admin');
  assert.equal(created.user.organization_name, payload.organization_name);
  assert.equal(created.organization.organization_id, created.user.organization_id);
  assert.equal(state.users.length, 1);
  assert.equal(state.organizations.length, 1);
  assert.equal(state.memberships.length, 1);

  const duplicate = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, organization_name: 'Must Not Exist' }),
  });
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).error, 'El email ya está registrado.');
  assert.equal(state.users.length, 1);
  assert.equal(state.organizations.length, 1);
  assert.equal(state.memberships.length, 1);

  const login = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(login.status, 200);
  const loggedIn = await login.json();
  assert.equal(loggedIn.user.organization_id, created.user.organization_id);
  assert.equal(loggedIn.user.memberships.length, 1);

  const me = await fetch(`${baseUrl}/auth/me`, { headers: { Authorization: `Bearer ${loggedIn.token}` } });
  assert.equal(me.status, 200);
  const profile = await me.json();
  assert.equal(profile.name, payload.name);
  assert.equal(profile.organization_name, payload.organization_name);
  assert.equal(profile.role, 'admin');
  assert.equal(profile.password_hash, undefined);

  state.failMembershipInsert = true;
  const failedEmail = `rollback-${Date.now()}@example.test`;
  const failed = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, email: failedEmail }),
  });
  assert.equal(failed.status, 500);
  assert.equal(state.organizations.length, 1);
  assert.equal(state.users.length, 1);
  assert.equal(state.memberships.length, 1);
});

test('public registration rejects role and organization injection and reports missing role catalog as 503', async (context) => {
  const originalQuery = database.pool.query;
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    database.pool.query = originalQuery;
    server.close();
  });
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const attack = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Injected User', email: 'inject@example.test', password: 'ValidPassword123!', organization_name: 'Safe Workspace', role: 'admin', organization_id: 1 }),
  });
  assert.equal(attack.status, 400);

  database.pool.query = async (text) => {
    if (text.includes('SELECT user_id FROM users WHERE email')) return { rows: [], rowCount: 0 };
    if (text.includes('SELECT role_id FROM roles')) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  };
  const missingRoles = await fetch(`${baseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'New User', email: 'noroles@example.test', password: 'ValidPassword123!', organization_name: 'New Workspace' }),
  });
  assert.equal(missingRoles.status, 503);
  assert.match(missingRoles.headers.get('content-type'), /application\/json/);
});

test('registration reports PostgreSQL authentication/connectivity failures as safe JSON 503', async (context) => {
  const originalQuery = database.pool.query;
  const server = app.listen(0, '127.0.0.1');
  context.after(() => {
    database.pool.query = originalQuery;
    server.close();
  });
  await new Promise((resolve) => server.once('listening', resolve));
  for (const [index, code] of ['28P01', '42P01'].entries()) {
    database.pool.query = async () => {
      const error = new Error(`Sensitive database detail ${code}`);
      error.code = code;
      throw error;
    };

    const response = await fetch(`http://127.0.0.1:${server.address().port}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'DB User', email: `db-${index}@example.test`, password: 'ValidPassword123!', organization_name: 'DB Workspace' }),
    });
    assert.equal(response.status, 503);
    assert.match(response.headers.get('content-type'), /application\/json/);
    const body = await response.json();
    assert.match(body.error, /PostgreSQL no está disponible/);
    assert.doesNotMatch(body.error, /Sensitive/);
  }
});
