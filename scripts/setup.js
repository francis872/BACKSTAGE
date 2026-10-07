'use strict';

const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backendEnv = path.join(root, 'backend', '.env');
const envTemplate = path.join(root, '.env.example');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';

if (!fs.existsSync(backendEnv)) {
  fs.copyFileSync(envTemplate, backendEnv, fs.constants.COPYFILE_EXCL);
  console.error('Se creó backend/.env desde .env.example. Configura DATABASE_URL, MONGODB_URI y JWT_SECRET; vuelve a ejecutar npm run setup.');
  process.exit(1);
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}

try {
  run(npmCommand, ['ci', '--prefix', 'backend']);
  run(npmCommand, ['ci', '--prefix', 'frontend']);
  run(process.env.PYTHON || 'python', ['-m', 'pip', 'install', '-r', path.join(root, 'probability', 'requirements.txt')]);
  const dotenv = require(path.join(root, 'backend', 'node_modules', 'dotenv'));
  const values = dotenv.parse(fs.readFileSync(backendEnv));
  const missing = ['DATABASE_URL', 'MONGODB_URI', 'JWT_SECRET'].filter((key) => !(process.env[key] || values[key] || '').trim());
  if (missing.length) {
    console.error(`Setup requiere configurar estas variables en backend/.env: ${missing.join(', ')}`);
    process.exit(1);
  }
  if ((process.env.SPATIAL_STORE || values.SPATIAL_STORE || '').toLowerCase() !== 'atlas') {
    console.error('Setup requiere SPATIAL_STORE=atlas; no se permite memory como almacenamiento operativo.');
    process.exit(1);
  }
  run(npmCommand, ['run', 'migrate:up', '--prefix', 'backend']);
} catch (error) {
  console.error(`Setup detenido: ${error.message}`);
  process.exitCode = 1;
}
