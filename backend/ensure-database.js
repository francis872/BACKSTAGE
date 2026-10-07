const { Client } = require('pg');
const dotenv = require('dotenv');
const path = require('node:path');
const { assertPostgres17 } = require('./utils/postgresVersion');

dotenv.config({ path: path.resolve(__dirname, '.env') });

const DATABASE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$-]{0,62}$/;

function parseDatabaseUrl(value) {
  if (!value) throw new Error('DATABASE_URL es obligatorio.');

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL no es válida.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL debe usar PostgreSQL.');
  }

  let databaseName;
  try {
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new Error('El identificador de base de datos no es válido.');
  }

  if (!DATABASE_IDENTIFIER.test(databaseName)) {
    throw new Error('El identificador de base de datos no es válido.');
  }

  return { url, databaseName };
}

function connectionStringForDatabase(url, databaseName) {
  const connectionUrl = new URL(url.toString());
  connectionUrl.pathname = `/${encodeURIComponent(databaseName)}`;
  return connectionUrl.toString();
}

async function verifyTarget(connectionString) {
  const client = new Client({ connectionString });
  try {
    await client.connect();
    const version = await client.query('SHOW server_version_num');
    assertPostgres17(version.rows[0]?.server_version_num);
    await client.query('SELECT 1');
  } finally {
    await client.end().catch(() => {});
  }
}

async function ensureDatabase(databaseUrl = process.env.DATABASE_URL) {
  const { url, databaseName } = parseDatabaseUrl(databaseUrl);
  const targetConnectionString = connectionStringForDatabase(url, databaseName);
  const adminConnectionString = connectionStringForDatabase(url, 'postgres');
  const admin = new Client({ connectionString: adminConnectionString });
  let adminError = null;

  try {
    await admin.connect();
    const version = await admin.query('SHOW server_version_num');
    assertPostgres17(version.rows[0]?.server_version_num);
    const result = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (result.rowCount === 0) {
      const identifier = `"${databaseName.replace(/"/g, '""')}"`;
      await admin.query(`CREATE DATABASE ${identifier}`);
    }
  } catch (error) {
    adminError = error;
  } finally {
    await admin.end().catch(() => {});
  }

  try {
    await verifyTarget(targetConnectionString);
    return adminError ? 'existing-target' : 'ready';
  } catch (targetError) {
    const errorCode = adminError?.code || targetError?.code || 'unknown';
    throw new Error(`No fue posible crear o verificar la base PostgreSQL (código ${errorCode}).`);
  }
}

if (require.main === module) {
  ensureDatabase()
    .then((result) => console.log(result === 'existing-target'
      ? 'PostgreSQL target database is available.'
      : 'PostgreSQL target database is ready.'))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = { parseDatabaseUrl, ensureDatabase };