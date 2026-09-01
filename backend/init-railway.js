#!/usr/bin/env node

/**
 * Script de inicialización para Railway
 * - Espera a que PostgreSQL esté listo
 * - Ejecuta migraciones
 * - Siembra datos de ejemplo
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function waitForDb(maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await pool.query('SELECT NOW()');
      console.log('✓ Conexión a PostgreSQL establecida');
      return true;
    } catch (error) {
      console.log(`⏳ Esperando PostgreSQL (intento ${i + 1}/${maxAttempts})...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw new Error('No se pudo conectar a PostgreSQL después de 60 segundos');
}

async function runSql(filePath) {
  const sql = fs.readFileSync(filePath, 'utf8');
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const statement of statements) {
    try {
      await pool.query(statement);
    } catch (error) {
      console.warn(`⚠️  Error ejecutando SQL: ${error.message}`);
    }
  }
}

async function initialize() {
  try {
    console.log('🚀 Inicializando BACKSTAGE Intelligence Backend...');
    
    // Esperar a PostgreSQL
    await waitForDb();

    // Crear extensiones
    await pool.query('CREATE EXTENSION IF NOT EXISTS postgis;');
    console.log('✓ Extensión PostGIS habilitada');

    // Ejecutar schema.sql
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      await runSql(schemaPath);
      console.log('✓ Schema creado');
    }

    // Ejecutar migraciones
    const migrationsPath = path.join(__dirname, 'migrations');
    if (fs.existsSync(migrationsPath)) {
      const migrationFiles = fs
        .readdirSync(migrationsPath)
        .filter(f => f.endsWith('.sql'))
        .sort();

      for (const file of migrationFiles) {
        await runSql(path.join(migrationsPath, file));
        console.log(`✓ Migración: ${file}`);
      }
    }

    // Sembrar datos de ejemplo
    const sampleDataPath = path.join(__dirname, 'sample-data.sql');
    if (fs.existsSync(sampleDataPath)) {
      await runSql(sampleDataPath);
      console.log('✓ Datos de ejemplo sembrados');
    }

    console.log('✅ Inicialización completada');
    await pool.end();
  } catch (error) {
    console.error('❌ Error durante inicialización:', error.message);
    process.exit(1);
  }
}

initialize();
