export function distanceM(a, b) {
  const rad = (n) => n * Math.PI / 180;
  const h = Math.sin(rad(b[1] - a[1]) / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(rad(b[0] - a[0]) / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

/** Project GPS onto the actual provider polyline; never substitute direct endpoint distance. */
export function routeProgress(point, geometry) {
  const line = geometry?.coordinates;
  if (geometry?.type !== 'LineString' || !Array.isArray(line) || line.length < 2) return null;
  const scaleX = 111320 * Math.cos(point[1] * Math.PI / 180), scaleY = 111320;
  let length = 0, closest = Infinity, alongM = 0;
  for (let i = 1; i < line.length; i += 1) {
    const a = [(line[i - 1][0] - point[0]) * scaleX, (line[i - 1][1] - point[1]) * scaleY];
    const b = [(line[i][0] - point[0]) * scaleX, (line[i][1] - point[1]) * scaleY];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, -(a[0] * dx + a[1] * dy) / (dx * dx + dy * dy || 1)));
    const separation = Math.hypot(a[0] + t * dx, a[1] + t * dy);
    const segment = distanceM(line[i - 1], line[i]);
    if (separation < closest) { closest = separation; alongM = length + t * segment; }
    length += segment;
  }
  return { offRouteM: closest, alongM, remainingM: Math.max(0, length - alongM), totalM: length };
}

export function validGps(position, now = Date.now()) {
  const c = position?.coords;
  return Boolean(c && Number.isFinite(c.longitude) && Math.abs(c.longitude) <= 180 && Number.isFinite(c.latitude) && Math.abs(c.latitude) <= 90
    && Number.isFinite(c.accuracy) && c.accuracy >= 0 && Number.isFinite(position.timestamp) && Math.abs(now - position.timestamp) < 60000);
}
