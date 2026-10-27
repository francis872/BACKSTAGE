import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const source = await readFile(new URL('../src/lib/territory.js', import.meta.url), 'utf8');
const { coordinatesOf, mergeOperationalContext, belongsToTerritory } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const medellin = { id: 'medellin', city: 'Medellín', country: 'Colombia', coordinates: [-75.6, 6.2], bbox: [-75.8, 6, -75.4, 6.4] };
const abuDhabi = { id: 'abu-dhabi', city: 'Abu Dhabi', country: 'United Arab Emirates', coordinates: [54.37, 24.45] };
test('los selectores de mapa de módulos distintos no compiten y conservan el borrador', () => {
  const old = { organization_id: 1, candidatePicker: true, assetDraft: { name: 'Equipo en edición' } };
  const next = mergeOperationalContext(old, { soiPicker: 'route', routeStopIndex: 1 }, 1);
  assert.equal(next.soiPicker, 'route');
  assert.equal(next.candidatePicker, false);
  assert.equal(next.assetDraft.name, 'Equipo en edición');
  const returned = mergeOperationalContext(next, { assetPicker: true }, 1);
  assert.equal(returned.soiPicker, null);
  assert.equal(returned.assetPicker, true);
});
test('cambiar de territorio descarta proyectos y coordenadas del objetivo anterior', () => {
  const old = { organization_id: 1, territory: medellin, analysis_run_id: 9, project_name: 'Medellín', project: { id: 9 }, location_id: 2 };
  const next = mergeOperationalContext(old, { ...old, territory: abuDhabi }, 1);
  assert.equal(next.analysis_run_id, null);
  assert.equal(next.project, null);
  assert.equal(next.location_id, null);
  assert.equal(next.city, 'Abu Dhabi');
  assert.equal(next.latitude, 24.45);
  assert.equal(next.longitude, 54.37);
});
test('mantiene el borrador y permite abrir un proyecto nuevo en un territorio nuevo', () => {
  const next = mergeOperationalContext({ territory: medellin, organization_id: 1, analysis_run_id: 9 }, { territory: abuDhabi, analysis_run_id: 10, projectDraft: { name: 'Logística' } }, 1);
  assert.equal(next.analysis_run_id, 10);
  assert.equal(next.projectDraft.name, 'Logística');
});
test('no hereda contexto de otra organización', () => {
  const next = mergeOperationalContext({ organization_id: 1, territory: medellin, project: { id: 9 } }, { territory: abuDhabi }, 2);
  assert.equal(next.organization_id, 2);
  assert.equal(next.project, null);
});
test('la asociación territorial excluye registros sin ubicación y homónimos extranjeros', () => {
  assert.equal(belongsToTerritory({}, medellin), false);
  assert.equal(belongsToTerritory({ city: 'Medellin', country: 'Spain' }, medellin), false);
  assert.equal(belongsToTerritory({ coordinates: [54.37, 24.45] }, medellin), false);
  assert.equal(belongsToTerritory({ city: 'Medellin', country: 'Colombia' }, medellin), true);
  assert.equal(belongsToTerritory({ longitude: -75.6, latitude: 6.2 }, medellin), true);
});
test('acepta cero geográfico pero rechaza null, texto vacío y pares inválidos', () => {
  assert.deepEqual(coordinatesOf({ coordinates: [0, 0] }), [0, 0]);
  for (const coordinates of [[null, 0], ['', 0], [181, 1], [0, 91]]) assert.equal(coordinatesOf({ coordinates }), null);
});
