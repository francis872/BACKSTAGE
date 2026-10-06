function interpolate(level, a, b) {
  const delta = b.value - a.value;
  const ratio = delta === 0 ? 0.5 : (level - a.value) / delta;
  return [a.x + (b.x - a.x) * ratio, a.y + (b.y - a.y) * ratio];
}

function contourSegments(grid, level, { originX = 0, originY = 0, cellSizeX = 1, cellSizeY = 1 } = {}) {
  if (!Array.isArray(grid) || grid.length < 2 || !grid.every((row) => Array.isArray(row) && row.length === grid[0].length)) {
    throw new TypeError('grid debe ser una matriz rectangular de al menos 2x2.');
  }
  const segments = [];
  for (let row = 0; row < grid.length - 1; row += 1) {
    for (let col = 0; col < grid[0].length - 1; col += 1) {
      const x = originX + col * cellSizeX;
      const y = originY + row * cellSizeY;
      const corners = [
        { x, y, value: Number(grid[row][col]) },
        { x: x + cellSizeX, y, value: Number(grid[row][col + 1]) },
        { x: x + cellSizeX, y: y + cellSizeY, value: Number(grid[row + 1][col + 1]) },
        { x, y: y + cellSizeY, value: Number(grid[row + 1][col]) },
      ];
      if (corners.some((corner) => !Number.isFinite(corner.value))) continue;
      const edges = [[0, 1], [1, 2], [2, 3], [3, 0]];
      const hits = edges.filter(([a, b]) => (corners[a].value < level) !== (corners[b].value < level))
        .map(([a, b]) => interpolate(level, corners[a], corners[b]));
      if (hits.length === 2) segments.push(hits);
      if (hits.length === 4) {
        const center = corners.reduce((sum, corner) => sum + corner.value, 0) / 4;
        if (center >= level) segments.push([hits[0], hits[1]], [hits[2], hits[3]]);
        else segments.push([hits[0], hits[3]], [hits[1], hits[2]]);
      }
    }
  }
  return segments;
}

function generateContours(grid, { min, max, interval, ...coordinates }) {
  if (!Number.isFinite(interval) || interval <= 0) throw new TypeError('interval debe ser mayor que cero.');
  const values = grid.flat().map(Number).filter(Number.isFinite);
  const lower = Number.isFinite(min) ? min : Math.ceil(Math.min(...values) / interval) * interval;
  const upper = Number.isFinite(max) ? max : Math.floor(Math.max(...values) / interval) * interval;
  const contours = [];
  for (let elevation = lower; elevation <= upper; elevation += interval) {
    contours.push({ elevation, major: Math.round(elevation / interval) % 5 === 0, segments: contourSegments(grid, elevation, coordinates) });
  }
  return contours;
}

module.exports = { contourSegments, generateContours };
