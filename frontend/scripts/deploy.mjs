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

// The CLI prints its final result as a JSON object; on some platforms
// stdout only contains that JSON (no leading newline before it) while
// human-readable build logs are streamed to stderr instead. Handle both
// "pure JSON stdout" and "logs + trailing JSON" shapes.
const trimmedOutput = output.trim();
let jsonText;
if (trimmedOutput.startsWith('{')) {
  jsonText = trimmedOutput;
} else {
  const jsonStart = output.lastIndexOf('\n{');
  if (jsonStart === -1) {
    console.error('No se encontró el bloque JSON de resultado. Aborta el aliasing.');
    process.exit(1);
  }
  jsonText = output.slice(jsonStart).trim();
}
const parsed = JSON.parse(jsonText);
const deploymentUrl = parsed?.deployment?.url;

if (!deploymentUrl) {
  console.error('No se pudo determinar la URL del deployment. Aborta el aliasing.');
  process.exit(1);
}

console.log(`> Apuntando ${CANONICAL_ALIAS} -> ${deploymentUrl}`);
console.log(run(`vercel alias set ${deploymentUrl} ${CANONICAL_ALIAS}`));
console.log(`Listo: https://${CANONICAL_ALIAS}`);
