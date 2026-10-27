const ApiError = require('../utils/ApiError');

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

  const territoryQueries = extractTerritoryQueries(prompt, intent);
  return {
    rawInput: prompt,
    intentType: intent,
    intent,
    territories: territoryQueries,
    territoryQueries,
    requestedEngines: intent === 'comparison'
      ? ['territory_resolution', 'data_resolution', 'multicriteria']
      : ['territory_resolution', 'data_resolution'],
    analysisTypes,
    requestedOutputs: ['map', 'indicators', 'evidence', 'recommendation'],
  };
}


module.exports = { parseIntent };
