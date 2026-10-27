// Read-only provider probe: does not create users, assets, projects or database records.
const { liveContext } = require('../services/territoryLive.service');

async function check() {
  const result = await liveContext(6.2442, -75.5812);
  console.log('[territory-sources]', JSON.stringify({
    weather: result.weather.status,
    weatherValidAt: result.weather.validAt || null,
    cartography: result.cartography.status,
    mappedPlaces: result.cartography.counts?.mappedPlaces ?? null,
    counts: result.cartography.counts || null,
    cartographyProvider: result.cartography.source?.name || null,
    cartographyVersion: result.cartography.source?.version || null,
    cartographySourceUpdatedAt: result.cartography.sourceUpdatedAt || null,
  }));
}
check().catch(() => { console.log('[territory-sources] provider probe unavailable; UI will report missing evidence.'); });
