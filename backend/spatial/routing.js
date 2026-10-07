const { haversineDistance } = require('./core');

function coordinateKey([lng, lat], precision = 6) {
  return `${Number(lng).toFixed(precision)},${Number(lat).toFixed(precision)}`;
}

function buildRoadGraph(featureCollection) {
  if (featureCollection?.type !== 'FeatureCollection') throw new TypeError('Se requiere un FeatureCollection vial.');
  const nodes = new Map();
  const adjacency = new Map();
  const addNode = (coordinate) => {
    const id = coordinateKey(coordinate);
    if (!nodes.has(id)) nodes.set(id, { id, coordinate: coordinate.map(Number) });
    if (!adjacency.has(id)) adjacency.set(id, []);
    return id;
  };
  const addLine = (coordinates, properties = {}) => {
    const rawSpeedKph = Number(properties.speedKph ?? properties.maxspeed);
    const speedKph = Number.isFinite(rawSpeedKph) && rawSpeedKph > 0 && rawSpeedKph <= 130 ? rawSpeedKph : null;
    for (let index = 1; index < coordinates.length; index += 1) {
      const from = addNode(coordinates[index - 1]); const to = addNode(coordinates[index]);
      const distanceM = haversineDistance({ lng: coordinates[index - 1][0], lat: coordinates[index - 1][1] }, { lng: coordinates[index][0], lat: coordinates[index][1] });
      const durationSeconds = speedKph ? distanceM / (speedKph * 1000 / 3600) : null;
      adjacency.get(from).push({ to, distanceM, cost: distanceM, durationSeconds });
      if (!properties.oneway && properties.oneway !== 'yes') adjacency.get(to).push({ to: from, distanceM, cost: distanceM, durationSeconds });
    }
  };
  featureCollection.features.forEach((feature) => {
    if (feature.geometry?.type === 'LineString') addLine(feature.geometry.coordinates, feature.properties);
    if (feature.geometry?.type === 'MultiLineString') feature.geometry.coordinates.forEach((line) => addLine(line, feature.properties));
  });
  return { nodes, adjacency };
}

function nearestNode(graph, coordinate) {
  let nearest = null; let distance = Infinity;
  for (const node of graph.nodes.values()) {
    const candidate = haversineDistance({ lng: coordinate[0], lat: coordinate[1] }, { lng: node.coordinate[0], lat: node.coordinate[1] });
    if (candidate < distance) { nearest = node; distance = candidate; }
  }
  return nearest ? { ...nearest, snapDistanceM: distance } : null;
}

function shortestPath(graph, startCoordinate, endCoordinate, algorithm = 'astar') {
  if (!['astar', 'dijkstra'].includes(algorithm)) throw new TypeError('algorithm debe ser astar o dijkstra.');
  const start = nearestNode(graph, startCoordinate); const end = nearestNode(graph, endCoordinate);
  if (!start || !end) throw new Error('El grafo vial no contiene nodos.');
  const distances = new Map([[start.id, 0]]); const previous = new Map();
  const open = new Set([start.id]);
  const heuristic = (id) => algorithm === 'dijkstra' ? 0 : haversineDistance(
    { lng: graph.nodes.get(id).coordinate[0], lat: graph.nodes.get(id).coordinate[1] },
    { lng: end.coordinate[0], lat: end.coordinate[1] },
  );
  while (open.size) {
    let current = null; let score = Infinity;
    for (const id of open) {
      const candidate = (distances.get(id) ?? Infinity) + heuristic(id);
      if (candidate < score) { score = candidate; current = id; }
    }
    if (current === end.id) break;
    open.delete(current);
    for (const edge of graph.adjacency.get(current) || []) {
      const next = (distances.get(current) ?? Infinity) + edge.cost;
      if (next < (distances.get(edge.to) ?? Infinity)) {
        distances.set(edge.to, next); previous.set(edge.to, { from: current, edge }); open.add(edge.to);
      }
    }
  }
  if (!distances.has(end.id)) throw new Error('No existe una ruta conectada entre los puntos seleccionados.');
  const ids = [end.id]; let cursor = end.id; let distanceM = 0; let durationSeconds = 0; let durationAvailable = true;
  while (cursor !== start.id) {
    const step = previous.get(cursor);
    distanceM += step.edge.distanceM;
    if (step.edge.durationSeconds == null) durationAvailable = false;
    else durationSeconds += step.edge.durationSeconds;
    cursor = step.from;
    ids.unshift(cursor);
  }
  return {
    algorithm,
    distanceM,
    durationSeconds: durationAvailable ? durationSeconds : null,
    durationSource: durationAvailable ? 'declared_speed_assumption' : null,
    snappedStart: start,
    snappedEnd: end,
    geometry: { type: 'LineString', coordinates: ids.map((id) => graph.nodes.get(id).coordinate) },
  };
}

module.exports = { coordinateKey, buildRoadGraph, nearestNode, shortestPath };
