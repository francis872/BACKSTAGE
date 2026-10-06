class TileCache {
  constructor({ maxEntries = 500, ttlMs = 300000 } = {}) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) { this.entries.delete(key); return null; }
    this.entries.delete(key); this.entries.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + this.ttlMs });
    while (this.entries.size > this.maxEntries) this.entries.delete(this.entries.keys().next().value);
    return value;
  }

  clear() { this.entries.clear(); }
  get size() { return this.entries.size; }
}

module.exports = TileCache;
