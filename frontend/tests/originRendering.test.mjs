import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../package.json', import.meta.url));
const { build } = require('esbuild');
const React = require('react'), { renderToString } = require('react-dom/server');
const Module = require('node:module');
const filename = fileURLToPath(new URL('../origin-rendering-check.cjs', import.meta.url));
const built = await build({ entryPoints: [fileURLToPath(new URL('../src/pages/AdvancedComparator.jsx', import.meta.url))], bundle: true, platform: 'node', format: 'cjs', write: false, jsx: 'automatic', loader: { '.css': 'empty' }, external: ['react', 'react-dom'], logLevel: 'silent' });
const compiled = new Module(filename); compiled.filename = filename; compiled.paths = require.resolve.paths('react'); compiled._compile(built.outputFiles[0].text, filename);
const Comparator = compiled.exports.default;

test('the real comparator renders geographic provider source objects from a saved project', () => {
  const user = { user_id: 11, organization_id: 7, role: 'analyst' };
  globalThis.window = { localStorage: { getItem: key => key === 'backstage_token' ? 'fixture' : key === 'backstage_user' ? JSON.stringify(user) : null }, sessionStorage: { getItem: () => null } };
  const place = { id: 'provider:1', name: 'Provider result fixture', lat: 0, lng: 0, source: { name: 'OpenStreetMap Nominatim', license: 'ODbL-1.0', dataMode: 'derived' } };
  let rendered;
  assert.doesNotThrow(() => { rendered = renderToString(React.createElement(Comparator, { operationalContext: { comparison_mode: 'configurable', startComparison: true, candidates: [place], analysis_run_id: 8 } })); });
  assert(rendered.includes('Provider result fixture')); assert(rendered.includes('OpenStreetMap Nominatim'));
});

test('an existing project can open Reports with its operational completion action', async () => {
  const filename=fileURLToPath(new URL('../reports-rendering-check.cjs',import.meta.url));
  const built=await build({entryPoints:[fileURLToPath(new URL('../src/pages/Reports.jsx',import.meta.url))],bundle:true,platform:'node',format:'cjs',write:false,jsx:'automatic',external:['react','react-dom'],logLevel:'silent'});
  const module=new Module(filename);module.filename=filename;module.paths=require.resolve.paths('react');module._compile(built.outputFiles[0].text,filename);
  let rendered;assert.doesNotThrow(()=>{rendered=renderToString(React.createElement(module.exports.default,{operationalContext:{analysis_run_id:8,project_name:'Existing project'}}));});
  assert(rendered.includes('Completar flujo operativo'));assert(rendered.includes('Informes ejecutivos'));
});
