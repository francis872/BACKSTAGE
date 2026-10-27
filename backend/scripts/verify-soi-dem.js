// Optional live DEM check. Separate from offline/isolated tests; no synthetic elevations.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { surface } = require('../services/soiGeo.service');
async function verify() {
  const data = await surface(1, { bbox: '-105.4,39.6,-105.2,39.8', resolution: 4 });
  assert.equal(data.dataMode, 'dem');
  assert.equal(data.elevation.length, 4);
  assert.ok(data.elevation.flat().every(Number.isFinite));
  assert.ok(data.statistics.relief > 0);
  assert.ok(data.contours.length > 0);
  const evidence = { test: 'live_dem_surface', status: 'passed', verifiedAt: new Date().toISOString(), bbox: data.bbox, resolution: data.resolution,
    source: data.source, statistics: data.statistics, precision: data.precision, contourCount: data.contours.length, limitations: ['Model elevation, not surveyed', 'Coarse sample spacing', '3D browser rendering not validated by this test'] };
  const directory = path.resolve(__dirname, '../../docs/evidence'); await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'soi-dem-live.json'), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
}
verify().catch((error) => { console.error(JSON.stringify({ status: 'not_verified', reason: error.message })); process.exitCode = 1; });
