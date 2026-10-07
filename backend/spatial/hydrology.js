const { haversineDistance } = require('./core');
const { analyzeTerrain, validateGrid } = require('./terrain');

const NEIGHBORS = [
  [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1],
];

function cellId(row, col) { return `${row}:${col}`; }

function flowDirection(input, { cellSizeM = 30 } = {}) {
  const grid = validateGrid(input);
  const directions = Array.from({ length: grid.length }, () => Array(grid[0].length).fill(null));
  for (let row = 0; row < grid.length; row += 1) {
    for (let col = 0; col < grid[0].length; col += 1) {
      let best = null; let steepest = 0;
      for (const [dr, dc] of NEIGHBORS) {
        const nr = row + dr; const nc = col + dc;
        if (nr < 0 || nr >= grid.length || nc < 0 || nc >= grid[0].length) continue;
        const distance = cellSizeM * (dr !== 0 && dc !== 0 ? Math.SQRT2 : 1);
        const descent = (grid[row][col] - grid[nr][nc]) / distance;
        if (descent > steepest) { steepest = descent; best = { row: nr, col: nc, descent }; }
      }
      directions[row][col] = best;
    }
  }
  return directions;
}

function flowAccumulation(input, options = {}) {
  const grid = validateGrid(input);
  const directions = flowDirection(grid, options);
  const accumulation = Array.from({ length: grid.length }, () => Array(grid[0].length).fill(1));
  const ordered = [];
  for (let row = 0; row < grid.length; row += 1) for (let col = 0; col < grid[0].length; col += 1) ordered.push({ row, col, elevation: grid[row][col] });
  ordered.sort((a, b) => b.elevation - a.elevation);
  ordered.forEach(({ row, col }) => {
    const target = directions[row][col];
    if (target) accumulation[target.row][target.col] += accumulation[row][col];
  });
  return { directions, accumulation };
}

function watershed(input, outlet, options = {}) {
  const grid = validateGrid(input);
  const row = Number(outlet?.row); const col = Number(outlet?.col);
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) {
    throw new TypeError('outlet requiere row y col dentro de la malla.');
  }
  const directions = flowDirection(grid, options);
  const reverse = new Map();
  for (let r = 0; r < grid.length; r += 1) for (let c = 0; c < grid[0].length; c += 1) {
    const target = directions[r][c];
    if (target) {
      const key = cellId(target.row, target.col);
      if (!reverse.has(key)) reverse.set(key, []);
      reverse.get(key).push({ row: r, col: c });
    }
  }
  const cells = []; const queue = [{ row, col }]; const visited = new Set();
  while (queue.length) {
    const current = queue.shift(); const key = cellId(current.row, current.col);
    if (visited.has(key)) continue;
    visited.add(key); cells.push(current);
    queue.push(...(reverse.get(key) || []));
  }
  return cells;
}

function cellCoordinate(row, col, bbox, rows, columns) {
  return [bbox[0] + col * (bbox[2] - bbox[0]) / (columns - 1), bbox[1] + row * (bbox[3] - bbox[1]) / (rows - 1)];
}

function analyzeHydrology(input, { bbox, cellSizeM = 30, streamThreshold = 10, curvatureThreshold = 0.0001, outlet } = {}) {
  const grid = validateGrid(input);
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new TypeError('bbox debe contener cuatro números.');
  const terrain = analyzeTerrain(grid, { cellSizeM });
  const { directions, accumulation } = flowAccumulation(grid, { cellSizeM });
  const features = [];
  const drainage = [];
  for (let row = 0; row < grid.length; row += 1) for (let col = 0; col < grid[0].length; col += 1) {
    const curvature = terrain.curvature[row][col];
    let landform = 'slope';
    if (curvature >= curvatureThreshold) landform = 'valley';
    if (curvature <= -curvatureThreshold) landform = 'ridge';
    if (accumulation[row][col] >= streamThreshold || landform !== 'slope') {
      features.push({
        type: 'Feature', geometry: { type: 'Point', coordinates: cellCoordinate(row, col, bbox, grid.length, grid[0].length) },
        properties: { row, col, elevation: grid[row][col], accumulation: accumulation[row][col], landform, stream: accumulation[row][col] >= streamThreshold },
      });
    }
    const target = directions[row][col];
    if (target && accumulation[row][col] >= streamThreshold) {
      drainage.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [
          cellCoordinate(row, col, bbox, grid.length, grid[0].length),
          cellCoordinate(target.row, target.col, bbox, grid.length, grid[0].length),
        ] },
        properties: { accumulation: accumulation[row][col] },
      });
    }
  }
  let selectedOutlet = outlet;
  if (!selectedOutlet) {
    selectedOutlet = { row: 0, col: 0 };
    for (let row = 0; row < grid.length; row += 1) for (let col = 0; col < grid[0].length; col += 1) {
      if (accumulation[row][col] > accumulation[selectedOutlet.row][selectedOutlet.col]) selectedOutlet = { row, col };
    }
  }
  const basinCells = watershed(grid, selectedOutlet, { cellSizeM });
  return {
    modelVersion: 'backstage-hydrology-d8-v1', directions, accumulation,
    features: { type: 'FeatureCollection', features },
    drainage: { type: 'FeatureCollection', features: drainage },
    outlet: { ...selectedOutlet, coordinate: cellCoordinate(selectedOutlet.row, selectedOutlet.col, bbox, grid.length, grid[0].length) },
    watershed: basinCells.map(({ row, col }) => ({ row, col, coordinate: cellCoordinate(row, col, bbox, grid.length, grid[0].length) })),
    statistics: {
      streamCellCount: features.filter((feature) => feature.properties.stream).length,
      valleyCellCount: features.filter((feature) => feature.properties.landform === 'valley').length,
      ridgeCellCount: features.filter((feature) => feature.properties.landform === 'ridge').length,
      watershedCellCount: basinCells.length,
    },
  };
}

function bilinear(grid, row, col) {
  const r0 = Math.floor(row); const r1 = Math.min(grid.length - 1, r0 + 1);
  const c0 = Math.floor(col); const c1 = Math.min(grid[0].length - 1, c0 + 1);
  const tr = row - r0; const tc = col - c0;
  return (grid[r0][c0] * (1 - tc) + grid[r0][c1] * tc) * (1 - tr)
    + (grid[r1][c0] * (1 - tc) + grid[r1][c1] * tc) * tr;
}

function topographicProfile(input, { bbox, start, end, samples = 100 }) {
  const grid = validateGrid(input);
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) throw new TypeError('bbox debe contener cuatro números.');
  if (![start, end].every((point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite))) throw new TypeError('start y end deben ser [lng,lat].');
  if (!Number.isInteger(samples) || samples < 2 || samples > 1000) throw new TypeError('samples debe estar entre 2 y 1000.');
  const totalDistanceM = haversineDistance({ lng: start[0], lat: start[1] }, { lng: end[0], lat: end[1] });
  const points = Array.from({ length: samples }, (_, index) => {
    const ratio = index / (samples - 1);
    const lng = start[0] + (end[0] - start[0]) * ratio; const lat = start[1] + (end[1] - start[1]) * ratio;
    const col = Math.max(0, Math.min(grid[0].length - 1, (lng - bbox[0]) / (bbox[2] - bbox[0]) * (grid[0].length - 1)));
    const row = Math.max(0, Math.min(grid.length - 1, (lat - bbox[1]) / (bbox[3] - bbox[1]) * (grid.length - 1)));
    return { coordinate: [lng, lat], distanceM: totalDistanceM * ratio, elevationM: bilinear(grid, row, col) };
  });
  return { totalDistanceM, minElevationM: Math.min(...points.map((point) => point.elevationM)), maxElevationM: Math.max(...points.map((point) => point.elevationM)), points };
}

module.exports = { flowDirection, flowAccumulation, watershed, analyzeHydrology, topographicProfile };
