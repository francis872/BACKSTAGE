const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function run() {
  try {
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(schemaSql);

    console.log('Esquema de base de datos creado o actualizado correctamente.');

    const sampleSql = fs.readFileSync(path.join(__dirname, 'sample-data.sql'), 'utf8');
    await pool.query(sampleSql);

    console.log('Datos de ejemplo insertados correctamente.');
  } catch (error) {
    console.error('Error al inicializar la base de datos:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
