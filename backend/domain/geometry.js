const ApiError = require('../utils/ApiError');
const fail = message => { throw new ApiError(400, message); };
function geometry(value) {
  if (!value || typeof value !== 'object') fail('Se requiere geometría WGS84.');
  const depths = { Point: 0, MultiPoint: 1, LineString: 1, MultiLineString: 2, Polygon: 2, MultiPolygon: 3 };
  const depth = depths[value.type];
  if (depth === undefined) fail('Tipo de geometría no soportado.');
  let points = 0;
  const check = (coords, level) => {
    if (!Array.isArray(coords) || !coords.length) fail('Coordenadas vacías.');
    if (level === 0) {
      if (coords.length < 2 || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1]) || Math.abs(coords[0]) > 180 || Math.abs(coords[1]) > 90) fail('Coordenadas WGS84 inválidas.');
      if (++points > 20000) fail('Geometría demasiado compleja.');
    } else coords.forEach((entry) => check(entry, level - 1));
  };
  check(value.coordinates, depth);
  const line = (coordinates, minimum) => { if (coordinates.length < minimum) fail('Geometría incompleta.'); };
  const polygon = (rings) => rings.forEach((ring) => {
    line(ring, 4);
    if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) fail('Los anillos deben estar cerrados.');
  });
  if (value.type === 'LineString') line(value.coordinates, 2);
  if (value.type === 'MultiLineString') value.coordinates.forEach((entry) => line(entry, 2));
  if (value.type === 'Polygon') polygon(value.coordinates);
  if (value.type === 'MultiPolygon') value.coordinates.forEach(polygon);
  return { type: value.type, coordinates: value.coordinates };
}

module.exports = { geometry };
