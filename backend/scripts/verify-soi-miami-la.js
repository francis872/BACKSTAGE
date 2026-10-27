// Explicit live test, separate from the isolated node:test suite. Makes one public OSRM request.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { route, haversine } = require('../services/soiGeo.service');
async function verify() {
  const coordinates = [[-80.1918, 25.7617], [-118.2437, 34.0522]];
  const result = await route(1, { coordinates, profile: 'driving', alternatives: true });
  const selected = result.routes[0];
  assert.ok(selected.distanceM > haversine(...coordinates));
  assert.ok(selected.distanceM > 4000000 && selected.distanceM < 5500000);
  assert.ok(selected.durationS > 100000 && selected.durationS < 300000);
  assert.ok(selected.geometry.type === 'LineString' && selected.geometry.coordinates.length > 100);
  assert.ok(selected.steps.length > 1);
  const evidence = { test: 'live_miami_los_angeles', status: 'passed', verifiedAt: new Date().toISOString(), requestedCoordinates: coordinates,
    alternatives: result.routes.length - 1, distanceM: selected.distanceM, durationS: selected.durationS,
    geometryType: selected.geometry.type, geometryPoints: selected.geometry.coordinates.length,
    geometrySha256: crypto.createHash('sha256').update(JSON.stringify(selected.geometry)).digest('hex'),
    maneuvers: selected.steps.length, source: result.source, limitations: ['No live traffic', 'Planning only; no physical GPS journey verified'] };
  const directory = path.resolve(__dirname, '../../docs/evidence');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'soi-miami-la-live.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}
verify().catch((error) => { console.error(JSON.stringify({ status: 'not_verified', reason: error.message })); process.exitCode = 1; });
