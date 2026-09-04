#!/usr/bin/env node
/**
 * Deploys the frontend to Vercel production and re-points the
 * canonical public alias (backstage-intelligence.vercel.app) to the
 * new deployment. Vercel only auto-aliases its own auto-generated
 * *.vercel.app domain; custom aliases set via `vercel alias set` must
 * be re-applied after every deploy, which this script automates.
 */
import { execSync } from 'node:child_process';

const CANONICAL_ALIAS = 'backstage-intelligence.vercel.app';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' });
}

console.log('> Deploying to Vercel production...');
const output = run('vercel --prod --yes');
console.log(output);

// The CLI prints human-readable build logs followed by a trailing JSON
// object. Extract just that JSON block (starts at the last standalone "{").
const jsonStart = output.lastIndexOf('\n{');
if (jsonStart === -1) {
  console.error('No se encontró el bloque JSON de resultado. Aborta el aliasing.');
  process.exit(1);
}
const parsed = JSON.parse(output.slice(jsonStart).trim());
const deploymentUrl = parsed?.deployment?.url;

if (!deploymentUrl) {
  console.error('No se pudo determinar la URL del deployment. Aborta el aliasing.');
  process.exit(1);
}

console.log(`> Apuntando ${CANONICAL_ALIAS} -> ${deploymentUrl}`);
console.log(run(`vercel alias set ${deploymentUrl} ${CANONICAL_ALIAS}`));
console.log(`Listo: https://${CANONICAL_ALIAS}`);
