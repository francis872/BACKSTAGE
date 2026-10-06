const EARTH_RADIUS_M = 6371008.8;

function assertPoint(point) {
  if (!point || !Number.isFinite(Number(point.lat)) || !Number.isFinite(Number(point.lng))) {
    throw new TypeError('El punto requiere lat y lng numéricos.');
  }
}

function haversineDistance(a, b) {
  assertPoint(a);
  assertPoint(b);
  const toRad = (value) => Number(value) * Math.PI / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRad(b.lng) - toRad(a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function pointInPolygon(point, ring) {
  assertPoint(point);
  if (!Array.isArray(ring) || ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = Number(ring[i][0]);
    const yi = Number(ring[i][1]);
    const xj = Number(ring[j][0]);
    const yj = Number(ring[j][1]);
    const crosses = ((yi > point.lat) !== (yj > point.lat))
      && (point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || Number.EPSILON) + xi);
    if (crosses) inside = !inside;
  }
  return inside;
}

function inBbox(point, bbox) {
  assertPoint(point);
  if (!Array.isArray(bbox) || bbox.length !== 4) throw new TypeError('bbox requiere [minLng,minLat,maxLng,maxLat].');
  const [minLng, minLat, maxLng, maxLat] = bbox.map(Number);
  return point.lng >= minLng && point.lng <= maxLng && point.lat >= minLat && point.lat <= maxLat;
}

class Quadtree {
  constructor(bounds, capacity = 32, depth = 0, maxDepth = 12) {
    this.bounds = bounds.map(Number);
    this.capacity = capacity;
    this.depth = depth;
    this.maxDepth = maxDepth;
    this.items = [];
    this.children = null;
  }

  insert(item) {
    const point = { lat: Number(item.lat), lng: Number(item.lng) };
    if (!inBbox(point, this.bounds)) return false;
    if (!this.children && (this.items.length < this.capacity || this.depth >= this.maxDepth)) {
      this.items.push(item);
      return true;
    }
    if (!this.children) this.subdivide();
    return this.children.some((child) => child.insert(item));
  }

  subdivide() {
    const [minLng, minLat, maxLng, maxLat] = this.bounds;
    const midLng = (minLng + maxLng) / 2;
    const midLat = (minLat + maxLat) / 2;
    const boxes = [
      [minLng, minLat, midLng, midLat], [midLng, minLat, maxLng, midLat],
      [minLng, midLat, midLng, maxLat], [midLng, midLat, maxLng, maxLat],
    ];
    this.children = boxes.map((box) => new Quadtree(box, this.capacity, this.depth + 1, this.maxDepth));
    const previous = this.items;
    this.items = [];
    previous.forEach((item) => this.children.some((child) => child.insert(item)));
  }

  query(bbox, output = []) {
    const [a, b, c, d] = this.bounds;
    const [minLng, minLat, maxLng, maxLat] = bbox;
    if (c < minLng || a > maxLng || d < minLat || b > maxLat) return output;
    this.items.forEach((item) => {
      if (inBbox({ lat: Number(item.lat), lng: Number(item.lng) }, bbox)) output.push(item);
    });
    if (this.children) this.children.forEach((child) => child.query(bbox, output));
    return output;
  }
}

module.exports = { EARTH_RADIUS_M, haversineDistance, pointInPolygon, inBbox, Quadtree };
