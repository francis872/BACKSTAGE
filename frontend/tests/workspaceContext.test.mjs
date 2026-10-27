import test from 'node:test';
import assert from 'node:assert/strict';
import { contextFromProject } from '../src/lib/projectContext.mjs';
import { mergeOperationalContext } from '../src/lib/territory.js';
import { setSession, clearSession } from '../src/lib/auth.js';
import { getStoredOperationalContext, setStoredOperationalContext, clearStoredOperationalContext } from '../src/lib/operationalContext.js';

function storage() {
  const values = {};
  return new Proxy({ getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = String(value); }, removeItem: key => { delete values[key]; } }, { ownKeys: () => Object.keys(values), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
}
test('context persists composite identities and zero coordinates within the active user and tenant', () => {
  globalThis.window = { localStorage: storage() };
  setSession('fixture', { user_id: 1, organization_id: 7 });
  const context = { organization_id: 7, comparison_id: 12, comparison_mode: 'configurable', asset_id: 'soi:1', selected_assets: [{ asset_id: 'soi:1' }], territory: { asset_id: 'soi:1', origin: 'soi', source_record_id: 1, location_id: null, name: 'Fixture', coordinates: [0, 0] }, candidates: [{ id: 'soi:1', name: 'Fixture', lat: 0, lng: 0 }] };
  setStoredOperationalContext(context);
  const restored = getStoredOperationalContext();
  assert.equal(restored.territory.asset_id, 'soi:1'); assert.equal(restored.territory.location_id, null);
  assert.deepEqual(restored.territory.coordinates, [0, 0]); assert.equal(restored.candidates[0].id, 'soi:1');
  assert.equal(restored.comparison_id, 12);
  setSession('fixture', { user_id: 2, organization_id: 7 }); assert.equal(getStoredOperationalContext(), null);
  setSession('fixture', { user_id: 1, organization_id: 8 }); assert.equal(getStoredOperationalContext(), null);
  setStoredOperationalContext(context); assert.equal(getStoredOperationalContext(), null);
  setSession('fixture', { user_id: 1, organization_id: 7 }); assert.equal(getStoredOperationalContext().comparison_id, 12);
  clearStoredOperationalContext(); assert.equal(getStoredOperationalContext(), null);
});
test('unowned legacy context is ignored, and logout removes browser workspace references', () => {
  globalThis.window = { localStorage: storage() };
  setSession('fixture', { user_id: 1, organization_id: 7 });
  window.localStorage.setItem('backstage_operational_context', JSON.stringify({ organization_id: 7, territory: { name: 'Unowned legacy' } }));
  assert.equal(getStoredOperationalContext(), null);
  setStoredOperationalContext({ organization_id: 7, comparison_id: 12 });
  assert.equal(getStoredOperationalContext().comparison_id, 12);
  clearSession(); clearStoredOperationalContext();
  assert.equal(Object.keys(window.localStorage).some(key => key.startsWith('backstage_operational_context')), false);
});
test('recovering a project uses its canonical territory, assets and comparison without inheriting another project', () => {
  const project = { organization_id: 7, analysis_run_id: 9, project_name: 'Recovered', metadata: { territory: { name: 'Zero', coordinates: [0, 0] }, comparison_snapshot_id: 12, selected_assets: [{ asset_id: 'soi:1', origin: 'soi', source_record_id: 1 }], comparison_candidates: [{ id: 'soi:1', name: 'Fixture', lat: 0, lng: 0 }] } };
  const context = contextFromProject(project, 7);
  assert.equal(context.location_id, null); assert.equal(context.asset_id, 'soi:1');
  assert.equal(context.comparison_mode, 'configurable'); assert.equal(context.comparison_id, 12);
  assert.throws(() => contextFromProject(project, 8), /organización/);
  const next = mergeOperationalContext({ organization_id: 7, analysis_run_id: 8, territory: { id: 'old', coordinates: [1, 1] }, candidates: [{ id: 'old' }] }, context, 7);
  assert.equal(next.analysis_run_id, 9); assert.equal(next.comparison_id, 12); assert.equal(next.candidates[0].id, 'soi:1');
});
test('selecting a new territory invalidates stale project and analysis references', () => {
  const next = mergeOperationalContext({ organization_id: 7, territory: { id: 'a', coordinates: [0, 0] }, analysis_run_id: 9, comparison_id: 12, selected_assets: [{ asset_id: 'soi:1' }], candidates: [{ id: 'old' }] }, { territory: { id: 'b', coordinates: [1, 1] } }, 7);
  assert.equal(next.analysis_run_id, null); assert.equal(next.comparison_id, null);
  assert.deepEqual(next.selected_assets, []); assert.deepEqual(next.candidates, []);
});

test('starting an analysis without an existing territory retains its declared draft name', () => {
  const next = mergeOperationalContext(null, { territory: { asset_id: 'platform:1', coordinates: [0, 0] }, project_name: 'Asset analysis', startComparison: true }, 7);
  assert.equal(next.project_name, 'Asset analysis'); assert.equal(next.analysis_run_id, null);
});
test('reopening the same canonical project restores its reference after a territory change', () => {
  const project = { organization_id: 7, analysis_run_id: 9, metadata: { territory: { id: 'canonical', coordinates: [0, 0] }, comparison_snapshot_id: 12 } };
  const next = mergeOperationalContext({ organization_id: 7, analysis_run_id: 9, comparison_id: 12, territory: { id: 'draft', coordinates: [1, 1] } }, contextFromProject(project, 7), 7);
  assert.equal(next.analysis_run_id, 9); assert.equal(next.comparison_id, 12);
});
