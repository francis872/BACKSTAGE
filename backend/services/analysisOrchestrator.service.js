const ApiError = require('../utils/ApiError');
const spatialIngestion = require('./spatialIngestion.service');
const territoryResolver = require('./territoryResolver.service');
const { createDataResolver } = require('./dataResolver.service');

const { parseIntent } = require('./territoryIntent.service');

function createAnalysisOrchestrator({
  searchTerritories = spatialIngestion.search,
  geocodeTerritories = territoryResolver.geocodeTerritories,
  dataResolver = createDataResolver(),
} = {}) {
  return {
    async createPlan(organizationId, input, context = {}) {
      if (!organizationId) throw new ApiError(401, 'Se requiere una organización activa.');
      const parsed = parseIntent(input);
      const resolved = await Promise.all(parsed.territoryQueries.map(async (query) => {
        let candidates = [];
        let atlasAvailable = true;
        try {
          candidates = await searchTerritories(organizationId, { q: query, worldId: 'earth', limit: 8 });
        } catch {
          atlasAvailable = false;
        }
        if (!candidates.length) {
          try {
            const territories = await geocodeTerritories(query, context);
            candidates = Array.isArray(territories) ? territories : territories ? [territories] : [];
          } catch {
            return { query, candidates: [], atlasAvailable, publicResolverAvailable: false };
          }
        }
        return { query, candidates, atlasAvailable, publicResolverAvailable: true };
      }));
      const candidates = resolved.flatMap(({ query, candidates: rows }) => rows.map((candidate) => ({
        ...candidate,
        matchedQuery: query,
      })));
      const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.id, candidate])).values()];
      const candidatesWithData = await Promise.all(uniqueCandidates.map(async (candidate) => ({
        ...candidate,
        data: await dataResolver.resolve({ organizationId, territory: candidate }),
      })));
      const dataAvailable = candidatesWithData.some((candidate) => candidate.data.status !== 'insufficient_data');

      return {
        ...parsed,
        status: candidatesWithData.length ? 'plan_ready' : 'insufficient_data',
        data_status: dataAvailable ? 'partial_data' : 'insufficient_data',
        territoryCandidates: candidatesWithData,
        missing_inputs: candidatesWithData.flatMap((candidate) => candidate.data.data_quality.missing_inputs),
        message: candidatesWithData.length
          ? dataAvailable
            ? 'Territorio resuelto; algunos indicadores carecen de fuentes o cobertura suficientes.'
            : 'Territorio resuelto, pero BACKSTAGE no encontró datos analíticos suficientes para evaluar métricas.'
          : resolved.some((item) => !item.publicResolverAvailable)
            ? 'Las fuentes territoriales conectadas no respondieron y el proveedor público no está disponible.'
            : 'No se encontró el territorio solicitado en las fuentes consultadas.',
      };
    },
  };
}

module.exports = { createAnalysisOrchestrator, parseIntent };