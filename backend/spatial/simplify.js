function squaredDistance(a, b) {
  const dx = a[0] - b[0]; const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function squaredSegmentDistance(point, start, end) {
  let x = start[0]; let y = start[1];
  let dx = end[0] - x; let dy = end[1] - y;
  if (dx !== 0 || dy !== 0) {
    const ratio = ((point[0] - x) * dx + (point[1] - y) * dy) / (dx * dx + dy * dy);
    if (ratio > 1) { x = end[0]; y = end[1]; }
    else if (ratio > 0) { x += dx * ratio; y += dy * ratio; }
  }
  dx = point[0] - x; dy = point[1] - y;
  return dx * dx + dy * dy;
}

function simplifyLine(points, tolerance) {
  if (!Array.isArray(points) || points.length <= 2 || tolerance <= 0) return points;
  const squaredTolerance = tolerance * tolerance;
  const radial = [points[0]];
  let previous = points[0];
  for (let index = 1; index < points.length; index += 1) {
    if (squaredDistance(points[index], previous) > squaredTolerance) {
      radial.push(points[index]); previous = points[index];
    }
  }
  if (previous !== points.at(-1)) radial.push(points.at(-1));
  const keep = new Uint8Array(radial.length); keep[0] = 1; keep[radial.length - 1] = 1;
  const stack = [[0, radial.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maximum = squaredTolerance; let selected = -1;
    for (let index = first + 1; index < last; index += 1) {
      const distance = squaredSegmentDistance(radial[index], radial[first], radial[last]);
      if (distance > maximum) { maximum = distance; selected = index; }
    }
    if (selected >= 0) { keep[selected] = 1; stack.push([first, selected], [selected, last]); }
  }
  return radial.filter((_, index) => keep[index]);
}

function simplifyRing(ring, tolerance) {
  if (!Array.isArray(ring) || ring.length < 4) return ring;
  const open = ring.slice(0, -1);
  const simplified = simplifyLine(open, tolerance);
  if (simplified.length < 3) return ring;
  return [...simplified, simplified[0]];
}

function simplifyGeometry(geometry, tolerance) {
  if (!geometry || tolerance <= 0) return geometry;
  const handlers = {
    LineString: (coordinates) => simplifyLine(coordinates, tolerance),
    MultiLineString: (coordinates) => coordinates.map((line) => simplifyLine(line, tolerance)),
    Polygon: (coordinates) => coordinates.map((ring) => simplifyRing(ring, tolerance)),
    MultiPolygon: (coordinates) => coordinates.map((polygon) => polygon.map((ring) => simplifyRing(ring, tolerance))),
  };
  return handlers[geometry.type] ? { ...geometry, coordinates: handlers[geometry.type](geometry.coordinates) } : geometry;
}

function toleranceForZoom(zoom, extent = 4096) {
  return 360 / ((2 ** zoom) * extent) * 1.5;
}

module.exports = { simplifyLine, simplifyGeometry, toleranceForZoom };
