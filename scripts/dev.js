'use strict';

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const backendEnv = path.join(root, 'backend', '.env');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
if (!fs.existsSync(backendEnv)) {
  console.error('Falta backend/.env. Ejecuta npm run setup y configura las variables requeridas.');
  process.exit(1);
}

const dotenv = require(path.join(root, 'backend', 'node_modules', 'dotenv'));
const localEnv = dotenv.parse(fs.readFileSync(backendEnv));
const sharedEnv = { ...localEnv, ...process.env };
const missing = ['DATABASE_URL', 'MONGODB_URI', 'JWT_SECRET'].filter((key) => !(sharedEnv[key] || '').trim());
if (missing.length) {
  console.error(`No se puede iniciar sin configurar backend/.env: ${missing.join(', ')}`);
  process.exit(1);
}
if ((sharedEnv.SPATIAL_STORE || '').toLowerCase() !== 'atlas') {
  console.error('No se permite SPATIAL_STORE=memory en el runtime local operativo; configura atlas.');
  process.exit(1);
}

const processes = [
  spawn(npmCommand, ['start', '--prefix', 'backend'], { cwd: root, env: sharedEnv, stdio: 'inherit', shell: process.platform === 'win32' }),
  spawn(npmCommand, ['run', 'dev', '--prefix', 'frontend'], {
    cwd: root,
    env: { ...sharedEnv, VITE_API_BASE_URL: '/api', VITE_LOCAL_API_TARGET: 'http://localhost:4000' },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }),
];

function stop(signal = 'SIGTERM') {
  for (const child of processes) {
    if (!child.killed) child.kill(signal);
  }
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

for (const child of processes) {
  child.on('error', (error) => {
    console.error(`No se pudo iniciar BACKSTAGE: ${error.message}`);
    stop();
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    if (code && code !== 0) process.exitCode = code;
    if (!processes.some((process) => process.exitCode == null)) process.exit(process.exitCode || 0);
  });
}
