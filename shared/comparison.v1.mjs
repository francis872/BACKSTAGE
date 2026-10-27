export const COMPARISON_VERSION = 'soi-weighted-minmax-1';
const numeric = (value) => (typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '' && Number.isFinite(Number(value));
const textValue = (value) => typeof value === 'string' && value.trim().length > 0;
const objectValue = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
export const DATA_TYPES = ['REAL_VERIFIED', 'ORGANIZATION_PROVIDED', 'IMPORTED', 'EXTERNAL_API', 'HISTORICAL', 'DEMO', 'SIMULATED', 'UNKNOWN'];
const round = (value) => Number(value.toFixed(8));

/** Pure, reproducible baseline. No geographical scores are inferred from coordinates. */
export function evaluateComparison(input = {}) {
  const { candidates = [], criteria = [], observations = {} } = objectValue(input) ? input : {};
  const errors = [];
  if (!objectValue(observations)) errors.push('Observations must be an object.');
  if (!Array.isArray(candidates) || candidates.length < 2 || candidates.length > 6) errors.push('Selecciona entre 2 y 6 candidatos.');
  if (!Array.isArray(criteria) || criteria.length < 1 || criteria.length > 30) errors.push('Define entre 1 y 30 criterios.');
  if (errors.length) return { version: COMPARISON_VERSION, status: 'invalid', errors, ranking: [], excluded: [] };
  if (candidates.some((c) => !objectValue(c)) || criteria.some((c) => !objectValue(c))) return { version: COMPARISON_VERSION, status: 'invalid', errors: ['Candidates and criteria must contain objects.'], ranking: [], excluded: [] };
  if (new Set(candidates.map((c) => c.id)).size !== candidates.length) errors.push('Los identificadores de candidatos deben ser únicos.');
  candidates.forEach((c) => {
    if (!textValue(c.id) || !textValue(c.name) || !numeric(c.lat) || !numeric(c.lng) || Math.abs(Number(c.lat)) > 90 || Math.abs(Number(c.lng)) > 180) errors.push(`Ubicación WGS84 o nombre inválido: ${c.name || c.id || 'candidato'}.`);
  });
  if (new Set(criteria.map((c) => c.id)).size !== criteria.length) errors.push('Los identificadores de criterios deben ser únicos.');
  criteria.forEach((c) => {
    if (!textValue(c.id) || !textValue(c.name) || !textValue(c.definition) || !textValue(c.unit) || !textValue(c.source)) errors.push(`Completa nombre, definición, unidad y fuente de ${c.name || c.id || 'criterio'}.`);
    if (!numeric(c.weight) || Number(c.weight) < 0) errors.push(`Peso inválido: ${c.name}.`);
    if (!['benefit', 'cost'].includes(c.direction)) errors.push(`Orientación inválida: ${c.name}.`);
    if (c.normalization !== 'minmax') errors.push(`Normalización no admitida: ${c.name}.`);
    if (!['block', 'exclude', 'worst'].includes(c.missing)) errors.push(`Tratamiento de ausentes inválido: ${c.name}.`);
    for (const bound of ['min', 'max']) if (c[bound] !== '' && c[bound] != null && !numeric(c[bound])) errors.push(`Restricción ${bound} inválida: ${c.name}.`);
    if (numeric(c.min) && numeric(c.max) && Number(c.min) > Number(c.max)) errors.push(`Mínimo mayor que máximo: ${c.name}.`);
  });
  const totalWeight = criteria.reduce((sum, c) => sum + Number(c.weight), 0);
  if (!Number.isFinite(totalWeight) || totalWeight <= 0) errors.push('La suma de pesos debe ser mayor que cero.');
  const empty = { version: COMPARISON_VERSION, method: 'weighted_sum', normalization: 'minmax', errors, ranking: [], excluded: [] };
  if (errors.length) return { ...empty, status: 'invalid' };
  const active = criteria.filter((c) => Number(c.weight) > 0);
  const excluded = [];
  const missingByCandidate = Object.create(null);
  const eligible = candidates.filter((candidate) => {
    const reasons = [];
    missingByCandidate[candidate.id] = [];
    active.forEach((criterion) => {
      const raw = observations[candidate.id]?.[criterion.id]?.value;
      if (!numeric(raw)) {
        missingByCandidate[candidate.id].push(criterion.id);
        if (criterion.missing === 'block') errors.push(`Falta ${criterion.name} para ${candidate.name}.`);
        if (criterion.missing === 'exclude') reasons.push(`Falta ${criterion.name}.`);
        if (criterion.missing === 'worst' && (numeric(criterion.min) || numeric(criterion.max))) reasons.push(`No se puede verificar la restricción de ${criterion.name} sin dato.`);
      } else if ((numeric(criterion.min) && Number(raw) < Number(criterion.min)) || (numeric(criterion.max) && Number(raw) > Number(criterion.max))) reasons.push(`Incumple restricción de ${criterion.name}.`);
    });
    if (reasons.length) excluded.push({ id: candidate.id, name: candidate.name, reasons });
    return reasons.length === 0;
  });
  if (errors.length) return { ...empty, status: 'missing_data', excluded };
  if (eligible.length < 2) return { ...empty, status: 'insufficient', errors: ['Se requieren al menos dos candidatos elegibles tras aplicar las restricciones.'], excluded };
  const ranges = Object.fromEntries(active.map((c) => {
    const values = eligible.map((a) => observations[a.id]?.[c.id]?.value).filter(numeric).map(Number);
    return [c.id, values.length ? { min: Math.min(...values), max: Math.max(...values) } : null];
  }));
  const weights = Object.fromEntries(criteria.map((c) => [c.id, Number(c.weight) / totalWeight]));
  const ranking = eligible.map((candidate) => {
    const breakdown = active.map((criterion) => {
      const observation = observations[candidate.id]?.[criterion.id] || {};
      const missing = !numeric(observation.value);
      const range = ranges[criterion.id];
      let normalized = missing ? 0 : range.max === range.min ? 0.5 : (Number(observation.value) - range.min) / (range.max - range.min);
      if (!missing && criterion.direction === 'cost') normalized = 1 - normalized;
      return { criterion_id: criterion.id, name: criterion.name, value: missing ? null : Number(observation.value), unit: criterion.unit, source: observation.source || criterion.source, observed_at: observation.observed_at || null, data_type: DATA_TYPES.includes(observation.data_type) ? observation.data_type : 'UNKNOWN', missing, direction: criterion.direction, range, normalized: round(normalized), weight: weights[criterion.id], contribution: round(normalized * weights[criterion.id] * 100) };
    });
    return { id: candidate.id, name: candidate.name, score: round(breakdown.reduce((sum, d) => sum + d.contribution, 0)), breakdown, missing_criteria: missingByCandidate[candidate.id] };
  }).sort((a, b) => b.score - a.score || (String(a.id) < String(b.id) ? -1 : 1));
  ranking.forEach((row, index) => { row.rank = index && row.score === ranking[index - 1].score ? ranking[index - 1].rank : index + 1; });
  return { ...empty, status: 'ready', weights, ranges, ranking, excluded, winner_ids: ranking.filter((r) => r.rank === 1).map((r) => r.id) };
}
