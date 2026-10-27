const test = require('node:test');
const assert = require('node:assert/strict');
const engine = import('../../shared/soiComparison.mjs');
const input = () => ({ candidates: [{ id: 'a', name: 'A', lat: 0, lng: 0 }, { id: 'b', name: 'B', lat: 10, lng: 20 }], criteria: [{ id: 'cost', name: 'Cost', definition: 'Authorized budget', unit: 'COP', source: 'Budget register', weight: 1, direction: 'cost', normalization: 'minmax', missing: 'block', min: '', max: '' }], observations: { a: { cost: { value: 10 } }, b: { cost: { value: 20 } } } });

test('deterministic costs, provenance and reversed benefit orientation', async () => {
  const { evaluateComparison: run } = await engine;
  const data = input();
  const result = run(data);
  assert.equal(result.status, 'ready'); assert.equal(result.ranking[0].id, 'a'); assert.equal(result.ranking[0].score, 100);
  assert.equal(result.ranking[0].breakdown[0].data_type, 'UNKNOWN');
  assert.deepEqual(run(structuredClone(data)), result);
  data.criteria[0].direction = 'benefit'; assert.equal(run(data).ranking[0].id, 'b');
});
test('candidate counts, WGS84 bounds and malformed JSON are rejected', async () => {
  const { evaluateComparison: run } = await engine;
  for (const count of [0, 1, 7]) { const d = input(); d.candidates = Array.from({ length: count }, (_, i) => ({ id: String(i), name: String(i), lat: 0, lng: 0 })); assert.equal(run(d).status, 'invalid'); }
  for (const count of [2, 3, 6]) { const d = input(); d.candidates = Array.from({ length: count }, (_, i) => ({ id: String(i), name: String(i), lat: 0, lng: 0 })); d.criteria[0].missing = 'worst'; assert.equal(run(d).status, 'ready'); }
  for (const invalid of [null, true, {}, { candidates: [null, null] }, { ...input(), criteria: [null] }, { ...input(), observations: null }]) assert.doesNotThrow(() => { assert.equal(run(invalid).status, 'invalid'); });
  for (const lat of [null, '', 91, -91, true, []]) { const d = input(); d.candidates[0].lat = lat; assert.equal(run(d).status, 'invalid'); }
  const d = input(); d.candidates[0].name = 42; assert.equal(run(d).status, 'invalid');
});
test('weights change ranking and zero, negative and infinity are invalid', async () => {
  const { evaluateComparison: run } = await engine;
  const d = input(); d.criteria.push({ ...d.criteria[0], id: 'quality', direction: 'benefit', weight: 3 });
  d.observations.a.quality = { value: 0 }; d.observations.b.quality = { value: 100 };
  assert.equal(run(d).ranking[0].id, 'b'); d.criteria[0].weight = 10; assert.equal(run(d).ranking[0].id, 'a');
  for (const weight of [0, -1, Infinity, true, '']) { const x = input(); x.criteria[0].weight = weight; assert.equal(run(x).status, 'invalid'); }
});
test('missing values block, exclude or penalize explicitly; restrictions never accept unknown', async () => {
  const { evaluateComparison: run } = await engine;
  const d = input(); delete d.observations.a.cost;
  assert.equal(run(d).status, 'missing_data'); d.criteria[0].missing = 'exclude'; assert.equal(run(d).status, 'insufficient');
  d.criteria[0].missing = 'worst'; let r = run(d); assert.equal(r.status, 'ready'); assert.equal(r.ranking.find((x) => x.id === 'a').breakdown[0].value, null);
  d.criteria[0].min = 0; r = run(d); assert.equal(r.status, 'insufficient'); assert.equal(r.excluded[0].id, 'a');
  const x = input(); x.criteria[0].max = 15; assert.equal(run(x).status, 'insufficient');
});
test('ties are explicit, zero weight missing criteria are ignored and invalid constraints fail', async () => {
  const { evaluateComparison: run } = await engine;
  const d = input(); d.observations.b.cost.value = 10; let r = run(d);
  assert.deepEqual(r.winner_ids, ['a', 'b']); assert.equal(r.ranking[0].score, 50); assert.equal(r.ranking[1].rank, 1);
  d.criteria.push({ ...d.criteria[0], id: 'unused', weight: 0 }); assert.equal(run(d).status, 'ready');
  d.criteria[0].min = 10; d.criteria[0].max = 5; assert.equal(run(d).status, 'invalid');
});
