#!/usr/bin/env node
/**
 * Inicializa la base de datos Neon con el schema completo (PostGIS + EarthArt)
 * y siembra datos de ejemplo. Reemplaza a init-railway.js para Neon/Vercel.
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function run() {
  try {
    console.log('🚀 Inicializando BACKSTAGE Intelligence en Neon...');

    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema-full.sql'), 'utf8');
    await pool.query(schemaSql);
    console.log('✓ Schema completo creado (PostGIS + EarthArt)');

    const sampleSql = fs.readFileSync(path.join(__dirname, 'sample-data.sql'), 'utf8');
    await pool.query(sampleSql);
    console.log('✓ Datos de ejemplo sembrados');

    const authSql = fs.readFileSync(path.join(__dirname, 'backend-seed-auth.sql'), 'utf8');
    await pool.query(authSql);
    console.log('✓ Usuario admin y fuentes de integración sembrados');

    console.log('✅ Inicialización completada correctamente');
  } catch (error) {
    console.error('❌ Error durante inicialización:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
