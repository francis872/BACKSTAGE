const ApiError = require('../utils/ApiError');
const spatialIngestion = require('./spatialIngestion.service');
const territoryResolver = require('./territoryResolver.service');
const { createDataResolver } = require('./dataResolver.service');

function cleanQuery(value) {
  return value.trim().replace(/^[\s,;:?!]+|[\s,;:?!]+$/g, '').replace(/\s+/g, ' ');
}

function extractTerritoryQueries(prompt, intent) {
  let subject = prompt
    .replace(/^(?:por favor\s+)?(?:analiza|analizar|eval[uú]a|evaluar|compara|comparar|busca|buscar|encuentra|encontrar|explora|explorar)\s+/i, '')
    .split(/\s+para\s+/i)[0];

  if (intent === 'comparison') {
    return subject.split(/\s*(?:,|;|\by\b)\s*/i).map(cleanQuery).filter(Boolean).slice(0, 8);
  }

  const framedTerritory = subject.match(/(?:riesgo territorial|riesgo|oportunidades?(?: inmobiliarias?)?|territorio)\s+(?:de|en)\s+(.+)$/i);
  if (framedTerritory) subject = framedTerritory[1];
  return [cleanQuery(subject)].filter(Boolean);
}

function parseIntent(input) {
  if (typeof input !== 'string' || input.trim().length < 3 || input.length > 500) {
    throw new ApiError(400, 'Describe qué quieres analizar (3 a 500 caracteres).');
  }

  const prompt = input.trim().replace(/\s+/g, ' ');
  const intent = /\bcompar(?:a|ar|aci[oó]n)\b/i.test(prompt) ? 'comparison'
    : /\briesgo\b/i.test(prompt) ? 'risk'
      : /\boportunidad(?:es)?\b/i.test(prompt) ? 'opportunity'
        : 'territory';
  const analysisTypes = intent === 'comparison' ? ['comparison', 'risk', 'opportunity', 'recommendation']
    : intent === 'risk' ? ['risk', 'territory']
      : intent === 'opportunity' ? ['opportunity', 'territory']
        : ['territory', 'risk', 'opportunity', 'recommendation'];

  return {
    intent,
    territoryQueries: extractTerritoryQueries(prompt, intent),
    analysisTypes,
    requestedOutputs: ['map', 'indicators', 'evidence', 'recommendation'],
  };
}

function createAnalysisOrchestrator({
  searchTerritories = spatialIngestion.search,
  resolveTerritory = territoryResolver.resolveTerritory,
  dataResolver = createDataResolver(),
} = {}) {
  return {
    async createPlan(organizationId, input) {
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
            const territory = await resolveTerritory(query);
            if (territory) candidates = [territory];
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