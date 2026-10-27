const asyncHandler = require('../utils/asyncHandler');
const service = require('../services/territoryLive.service');
const resolver = require('../services/territoryResolver.service');
const { parseIntent } = require('../services/territoryIntent.service');

exports.weather = asyncHandler(async (req, res) => res.json(await service.weather(req.query.lat, req.query.lng)));
exports.liveContext = asyncHandler(async (req, res) => res.json(await service.liveContext(req.query.lat, req.query.lng, req.query.radiusM)));
exports.intent = asyncHandler(async (req, res) => {
  const parsed = parseIntent(req.query.q);
  const territoryCandidates = [];
  const unavailable = [];
  // Explicit searches only, worldwide. Device position never restricts a remote objective.
  for (const query of parsed.territoryQueries.slice(0, 6)) {
    try {
      const rows = await resolver.geocodeTerritories(query, { limit: parsed.intentType === 'comparison' ? 1 : 5 });
      territoryCandidates.push(...rows.map((row) => ({ ...row, matchedQuery: query })));
    } catch { unavailable.push(query); }
  }
  res.json({ ...parsed, territoryCandidates, unavailable, message: unavailable.length
    ? 'Algunas fuentes no respondieron. Revisa los territorios resueltos o vuelve a buscar.'
    : territoryCandidates.length ? 'Selecciona el territorio para consultar su cartografía y meteorología actuales.' : 'No se encontró el territorio solicitado.' });
});
