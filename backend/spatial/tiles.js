function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lonLatToTile(lng, lat, zoom) {
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 22) throw new TypeError('zoom debe ser un entero entre 0 y 22.');
  const size = 2 ** zoom;
  const longitude = clamp(Number(lng), -180, 180);
  const latitude = clamp(Number(lat), -85.05112878, 85.05112878);
  const x = Math.floor((longitude + 180) / 360 * size);
  const latRad = latitude * Math.PI / 180;
  const y = Math.floor((1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * size);
  return { z: zoom, x: clamp(x, 0, size - 1), y: clamp(y, 0, size - 1) };
}

function tileBounds(z, x, y) {
  if (!Number.isInteger(z) || z < 0 || z > 22) throw new TypeError('z debe ser un entero entre 0 y 22.');
  const size = 2 ** z;
  if (![x, y].every(Number.isInteger) || x < 0 || y < 0 || x >= size || y >= size) {
    throw new TypeError('x/y están fuera del rango de la tesela.');
  }
  const longitude = (tileX) => tileX / size * 360 - 180;
  const latitude = (tileY) => Math.atan(Math.sinh(Math.PI * (1 - 2 * tileY / size))) * 180 / Math.PI;
  return [longitude(x), latitude(y + 1), longitude(x + 1), latitude(y)];
}

function geometryBounds(geometry) {
  const points = [];
  const visit = (value) => {
    if (Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
      points.push([Number(value[0]), Number(value[1])]);
    } else if (Array.isArray(value)) value.forEach(visit);
  };
  visit(geometry?.coordinates);
  if (!points.length) throw new TypeError('La geometría no contiene coordenadas válidas.');
  return [
    Math.min(...points.map(([lng]) => lng)), Math.min(...points.map(([, lat]) => lat)),
    Math.max(...points.map(([lng]) => lng)), Math.max(...points.map(([, lat]) => lat)),
  ];
}

function tilesForGeometry(geometry, zoom, maxTiles = 1024) {
  const [minLng, minLat, maxLng, maxLat] = geometryBounds(geometry);
  const northWest = lonLatToTile(minLng, maxLat, zoom);
  const southEast = lonLatToTile(maxLng, minLat, zoom);
  const count = (southEast.x - northWest.x + 1) * (southEast.y - northWest.y + 1);
  if (count > maxTiles) throw new RangeError(`La geometría cubriría ${count} teselas; máximo permitido ${maxTiles}.`);
  const tiles = [];
  for (let x = northWest.x; x <= southEast.x; x += 1) {
    for (let y = northWest.y; y <= southEast.y; y += 1) tiles.push(`${zoom}/${x}/${y}`);
  }
  return tiles;
}

function boundsIntersect(a, b) {
  return a[2] >= b[0] && a[0] <= b[2] && a[3] >= b[1] && a[1] <= b[3];
}

module.exports = { lonLatToTile, tileBounds, geometryBounds, tilesForGeometry, boundsIntersect };
