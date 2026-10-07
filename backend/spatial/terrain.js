const { generateContours } = require('./contours');

function validateGrid(grid) {
  if (!Array.isArray(grid) || grid.length < 2 || !Array.isArray(grid[0]) || grid[0].length < 2) {
    throw new TypeError('grid debe ser una matriz numérica de al menos 2x2.');
  }
  const width = grid[0].length;
  if (!grid.every((row) => Array.isArray(row) && row.length === width
    && row.every((value) => Number.isFinite(Number(value))))) {
    throw new TypeError('grid debe ser rectangular y contener solo valores numéricos finitos.');
  }
  return grid.map((row) => row.map(Number));
}

function sample(grid, row, col) {
  return grid[Math.max(0, Math.min(grid.length - 1, row))]
    [Math.max(0, Math.min(grid[0].length - 1, col))];
}

function analyzeTerrain(input, { cellSizeM = 30 } = {}) {
  const grid = validateGrid(input);
  if (!Number.isFinite(cellSizeM) || cellSizeM <= 0) throw new TypeError('cellSizeM debe ser mayor que cero.');
  const slope = [];
  const aspect = [];
  const curvature = [];
  let minElevation = Infinity;
  let maxElevation = -Infinity;
  let sum = 0;

  for (let row = 0; row < grid.length; row += 1) {
    slope[row] = [];
    aspect[row] = [];
    curvature[row] = [];
    for (let col = 0; col < grid[0].length; col += 1) {
      const z = grid[row][col];
      minElevation = Math.min(minElevation, z);
      maxElevation = Math.max(maxElevation, z);
      sum += z;
      const dzdx = (sample(grid, row, col + 1) - sample(grid, row, col - 1)) / (2 * cellSizeM);
      const dzdy = (sample(grid, row + 1, col) - sample(grid, row - 1, col)) / (2 * cellSizeM);
      slope[row][col] = Math.atan(Math.hypot(dzdx, dzdy)) * 180 / Math.PI;
      aspect[row][col] = (Math.atan2(dzdx, -dzdy) * 180 / Math.PI + 360) % 360;
      curvature[row][col] = (
        sample(grid, row, col - 1) + sample(grid, row, col + 1)
        + sample(grid, row - 1, col) + sample(grid, row + 1, col) - (4 * z)
      ) / (cellSizeM ** 2);
    }
  }

  return {
    elevation: grid,
    slope,
    aspect,
    curvature,
    statistics: {
      minElevation,
      maxElevation,
      meanElevation: sum / (grid.length * grid[0].length),
      relief: maxElevation - minElevation,
      rows: grid.length,
      columns: grid[0].length,
      cellSizeM,
    },
  };
}

function resampleGrid(input, targetRows, targetColumns) {
  const grid = validateGrid(input);
  if (!Number.isInteger(targetRows) || !Number.isInteger(targetColumns) || targetRows < 2 || targetColumns < 2) {
    throw new TypeError('La resolución objetivo debe ser de al menos 2x2.');
  }
  return Array.from({ length: targetRows }, (_, row) => Array.from({ length: targetColumns }, (_, col) => {
    const sourceY = row * (grid.length - 1) / (targetRows - 1);
    const sourceX = col * (grid[0].length - 1) / (targetColumns - 1);
    const y0 = Math.floor(sourceY); const y1 = Math.min(grid.length - 1, y0 + 1);
    const x0 = Math.floor(sourceX); const x1 = Math.min(grid[0].length - 1, x0 + 1);
    const ty = sourceY - y0; const tx = sourceX - x0;
    const top = grid[y0][x0] * (1 - tx) + grid[y0][x1] * tx;
    const bottom = grid[y1][x0] * (1 - tx) + grid[y1][x1] * tx;
    return top * (1 - ty) + bottom * ty;
  }));
}

function proceduralTerrain({ bbox, resolution = 33, seed = 17 }) {
  if (!Array.isArray(bbox) || bbox.length !== 4 || !bbox.every(Number.isFinite)) {
    throw new TypeError('bbox debe contener minLng,minLat,maxLng,maxLat.');
  }
  if (!Number.isInteger(resolution) || resolution < 9 || resolution > 129) {
    throw new TypeError('resolution debe ser un entero entre 9 y 129.');
  }
  const [minLng, minLat, maxLng, maxLat] = bbox;
  if (minLng >= maxLng || minLat >= maxLat) throw new TypeError('bbox no tiene extensión positiva.');
  return Array.from({ length: resolution }, (_, row) => Array.from({ length: resolution }, (_, col) => {
    const lng = minLng + col * (maxLng - minLng) / (resolution - 1);
    const lat = minLat + row * (maxLat - minLat) / (resolution - 1);
    const x = (lng + seed * 0.013) * Math.PI / 180;
    const y = (lat - seed * 0.009) * Math.PI / 180;
    const continental = 900 + 480 * Math.sin(x * 7) * Math.cos(y * 9);
    const ridges = 340 * Math.abs(Math.sin(x * 31 + y * 19));
    const local = 110 * Math.sin(x * 83 - y * 61) * Math.cos(y * 47);
    return Math.round((continental + ridges + local) * 10) / 10;
  }));
}

function buildTerrainSurface({ bbox, resolution = 33, contourInterval = 100, seed = 17, lod = 0 }) {
  const effectiveResolution = Math.max(9, Math.round(resolution / (2 ** Math.max(0, lod))));
  const elevation = proceduralTerrain({ bbox, resolution: effectiveResolution, seed });
  const [minLng, minLat, maxLng, maxLat] = bbox;
  const cellSizeX = (maxLng - minLng) / (effectiveResolution - 1);
  const cellSizeY = (maxLat - minLat) / (effectiveResolution - 1);
  const metersPerDegree = 111320;
  const analysis = analyzeTerrain(elevation, { cellSizeM: Math.max(1, cellSizeY * metersPerDegree) });
  const contours = generateContours(elevation, {
    interval: contourInterval,
    originX: minLng,
    originY: minLat,
    cellSizeX,
    cellSizeY,
  });
  return {
    model: 'backstage-procedural-terrain-v1',
    dataMode: 'procedural',
    bbox,
    resolution: effectiveResolution,
    elevation,
    slope: analysis.slope,
    aspect: analysis.aspect,
    curvature: analysis.curvature,
    statistics: analysis.statistics,
    contours,
  };
}

module.exports = { validateGrid, analyzeTerrain, resampleGrid, proceduralTerrain, buildTerrainSurface };
