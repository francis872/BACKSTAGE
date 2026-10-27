import test from 'node:test';
import assert from 'node:assert/strict';
import { setSession, getSessionUser, getSessionToken, clearSession } from '../src/lib/auth.js';
import { getStoredOperationalContext, setStoredOperationalContext, clearStoredOperationalContext } from '../src/lib/operationalContext.js';
import { mergeOperationalContext } from '../src/lib/territory.js';
import { toCandidate } from '../src/lib/comparisonCandidates.mjs';
import { restoreValidatedProjectContext } from '../src/lib/projectContext.mjs';

test('restricted browser storage cannot crash login, territory, project or comparison navigation', () => {
  globalThis.window = { get localStorage() { throw new DOMException('Blocked', 'SecurityError'); } };
  assert.doesNotThrow(() => setSession('temporary-token', { user_id: 11, organization_id: 7 }));
  assert.equal(getSessionToken(), 'temporary-token');
  assert.equal(getSessionUser().user_id, 11);
  const context = { organization_id: 7, analysis_run_id: 8, comparison_id: 3, territory: { id: 'point', coordinates: [0, 0] } };
  assert.doesNotThrow(() => setStoredOperationalContext(context));
  assert.equal(getStoredOperationalContext().comparison_id, 3);
  setSession('other-user', { user_id: 12, organization_id: 7 });
  assert.equal(getStoredOperationalContext(), null);
  setSession('temporary-token', { user_id: 11, organization_id: 7 });
  assert.equal(getStoredOperationalContext().analysis_run_id, 8);
  assert.doesNotThrow(clearStoredOperationalContext);
  assert.equal(getStoredOperationalContext(), null);
  assert.doesNotThrow(clearSession);
  assert.equal(getSessionToken(), null);
});

test('regional exploration retains a project, its canonical site and comparison without assigning them to another organization', () => {
  const site = { id: 'original', coordinates: [0, 0] };
  const old = { organization_id: 7, analysis_run_id: 8, territory: site, comparison_id: 3, candidates: [{ id: 'candidate' }], layers: { assets: true } };
  const incoming = { territory: { id: 'nearby', coordinates: [1, 1] }, preserveProject: true };
  const next = mergeOperationalContext(old, incoming, 7);
  assert.equal(next.analysis_run_id, 8); assert.equal(next.comparison_id, 3);
  assert.deepEqual(next.projectTerritory, site); assert.equal(next.territory.id, 'nearby');
  assert.deepEqual(next.candidates, old.candidates); assert.deepEqual(next.layers, old.layers);
  const other = mergeOperationalContext(old, incoming, 9);
  assert(!other.analysis_run_id); assert(!other.comparison_id); assert(!other.projectTerritory);
});

test('quota exhaustion preserves a workspace in memory and clearing it does not revive stale values', () => {
  const data = new Map(); let full = false;
  globalThis.window = { localStorage: { getItem: k => data.get(k) ?? null, removeItem: k => { if (full) throw Error('Blocked'); data.delete(k); }, setItem: (k, v) => { if (full) throw new DOMException('Full', 'QuotaExceededError'); data.set(k, String(v)); } } };
  setSession('token', { user_id: 11, organization_id: 7 });
  setStoredOperationalContext({ organization_id: 7, comparison_id: 2 });
  full = true;
  assert.doesNotThrow(() => setStoredOperationalContext({ organization_id: 7, comparison_id: 3 }));
  assert.equal(getStoredOperationalContext().comparison_id, 3);
  clearStoredOperationalContext();
  full = false;
  assert.equal(getStoredOperationalContext(), null);
});

test('map coordinates and provider URLs become stable candidate identities accepted by the existing engine', () => {
  for(const id of ['custom:-74.123456:4.234567','https://provider.example/place/1','__proto__']){
    const item={id,name:'Map selection',coordinates:[0,0]};const candidate=toCandidate(item);
    assert(!/^[\$]|[.\x00-\x1f]/.test(candidate.id));assert.equal(candidate.id,toCandidate(item).id);assert.equal(candidate.source_identifier,id);
  }
  assert.equal(toCandidate({asset_id:'soi:1',name:'Registered',coordinates:[0,0]}).id,'soi:1');
});

test('late project recovery cannot erase evidence opened through navigation or force the legacy comparator',()=>{
  const project={organization_id:7,analysis_run_id:8,project_name:'Existing',metadata:{territory:{coordinates:[0,0]},comparison_snapshot_id:3,comparison_candidates:[{id:'saved'}]}};
  const current={organization_id:7,analysis_run_id:8,comparison_id:3,comparison_mode:'configurable',mapView:'globe',candidates:[{id:'current'}]};
  const next=restoreValidatedProjectContext(current,project,7);
  assert.equal(next.comparison_id,3);assert.equal(next.comparison_mode,'configurable');assert.equal(next.candidates[0].id,'current');assert.equal(next.mapView,'globe');
  const reloaded=restoreValidatedProjectContext({...current,comparison_id:null,comparison_mode:'existing',candidates:[]},project,7);
  assert.equal(reloaded.comparison_id,3);assert.equal(reloaded.comparison_mode,'configurable');
  const other={organization_id:9,analysis_run_id:8};assert.equal(restoreValidatedProjectContext(other,project,7),other);
});
