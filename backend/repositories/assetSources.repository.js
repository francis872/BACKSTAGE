// Storage integration boundary: providers remain separate and keep their native IDs.
const ApiError = require('../utils/ApiError');
const SOURCES = Object.freeze([
  { origin: 'platform', collection: 'locations' },
  { origin: 'soi', collection: 'soi_assets' },
]);
  async function assetSources(db, organizationId, origin) {
    if (origin != null && !SOURCES.some(s => s.origin === origin)) throw new ApiError(400, 'origin inválido.');
    const selected = SOURCES.filter(s => !origin || s.origin === origin);
    if (selected.some(s => s.origin === 'soi')) {
      const configuration = await db.collection('soi_configuration').findOne({ organization_id: organizationId });
      if (configuration && !configuration.capabilities?.includes('assets')) return selected.filter(s => s.origin !== 'soi');
    }
    return selected;
  }

module.exports = { assetSources };
