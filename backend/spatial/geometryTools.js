const { EARTH_RADIUS_M, haversineDistance } = require('./core');

function assertCoordinate(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2 || !coordinate.slice(0, 2).every((value) => Number.isFinite(Number(value)))) {
    throw new TypeError('Cada coordenada debe contener lng y lat numéricos.');
  }
}

function lineDistance(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) throw new TypeError('La línea requiere al menos dos coordenadas.');
  coordinates.forEach(assertCoordinate);
  let distanceM = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    distanceM += haversineDistance(
      { lng: coordinates[index - 1][0], lat: coordinates[index - 1][1] },
      { lng: coordinates[index][0], lat: coordinates[index][1] },
    );
  }
  return distanceM;
}

function polygonArea(ring) {
  if (!Array.isArray(ring) || ring.length < 4) throw new TypeError('El polígono requiere un anillo cerrado de al menos cuatro coordenadas.');
  ring.forEach(assertCoordinate);
  const closed = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring : [...ring, ring[0]];
  let sum = 0;
  for (let index = 0; index < closed.length - 1; index += 1) {
    const [lng1, lat1] = closed[index].map((value) => Number(value) * Math.PI / 180);
    const [lng2, lat2] = closed[index + 1].map((value) => Number(value) * Math.PI / 180);
    sum += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs(sum * EARTH_RADIUS_M * EARTH_RADIUS_M / 2);
}

function measureGeometry(geometry) {
  if (!geometry?.type || !Array.isArray(geometry.coordinates)) throw new TypeError('Se requiere una geometría GeoJSON.');
  if (geometry.type === 'Point') { assertCoordinate(geometry.coordinates); return { type: 'Point', coordinate: geometry.coordinates.slice(0, 2) }; }
  if (geometry.type === 'LineString') return { type: 'LineString', distanceM: lineDistance(geometry.coordinates), vertexCount: geometry.coordinates.length };
  if (geometry.type === 'Polygon') {
    const ring = geometry.coordinates[0];
    if (!Array.isArray(ring) || ring.length < 3) throw new TypeError('El polígono requiere al menos tres vértices.');
    const closed = ring[0][0] === ring.at(-1)[0] && ring[0][1] === ring.at(-1)[1] ? ring : [...ring, ring[0]];
    return { type: 'Polygon', areaM2: polygonArea(closed), perimeterM: lineDistance(closed), vertexCount: closed.length - 1 };
  }
  throw new TypeError('Solo se admiten Point, LineString y Polygon.');
}

module.exports = { lineDistance, polygonArea, measureGeometry };
