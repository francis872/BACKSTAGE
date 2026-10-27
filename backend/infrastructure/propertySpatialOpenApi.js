const pathId = name => ({ name, in: 'path', required: true, schema: { type: 'integer', minimum: 1 } });
const responses = Object.fromEntries([200, 400, 401, 403, 404, 409, 413, 422, 429, 503].map(code => [code, { description: code === 200 ? 'Resultado autorizado; cuerpos y saldos solo para admin/analyst vigentes' : `Error ${code}; no se publica un resultado incompleto` }]));
const base = '/assets/layers/horizontal-property/{id}/analysis';
const config = { type: 'object', additionalProperties: false, properties: {
  method: { enum: ['weights', 'moran', 'local_moran', 'gi_star', 'kde', 'temporal'] },
  metric: { enum: ['pqrs_count', 'open_pqrs_count', 'outstanding_minor', 'overdue_minor'] },
  unit_kind: { enum: Object.keys(require('../domain/horizontalProperty').KINDS) },
  weights: { type: 'object', additionalProperties: false, properties: { method: { enum: ['queen', 'rook', 'knn', 'distance_band', 'inverse_distance'] }, k: { type: 'integer', minimum: 1, maximum: 63 }, distance_m: { type: 'number', minimum: 1, maximum: 100000 }, power: { type: 'number', minimum: .01, maximum: 8 }, transform: { enum: ['row', 'none'] }, symmetry: { enum: ['union', 'directed'] }, zero_distance: { const: 'error' } } },
  permutations: { type: 'integer', minimum: 19, maximum: 9999 }, seed: { type: 'integer', minimum: 0, maximum: 2147483647 }, alpha: { enum: [.1, .05, .01] },
  currency: { type: 'string', pattern: '^[A-Z]{3}$' }, scale: { type: 'integer', minimum: 0, maximum: 4 },
  density: { type: 'object', additionalProperties: false, required: ['bandwidth_m'], properties: { bandwidth_m: { type: 'number', minimum: 1, maximum: 100000 }, resolution: { type: 'integer', minimum: 4, maximum: 12 }, kernel: { enum: ['gaussian', 'quartic', 'epanechnikov', 'uniform', 'triangular'] } } },
  periods: { type: 'array', minItems: 2, maxItems: 6, items: { type: 'object', additionalProperties: false, required: ['start', 'end'], properties: { start: { type: 'string', format: 'date-time' }, end: { type: 'string', format: 'date-time' } } } }, temporal_method: { enum: ['moran', 'local_moran', 'gi_star'] },
} };
const requestBody = { required: true, content: { 'application/json': { schema: config } } };
const paths = {
  [base]: { parameters: [pathId('id')], get: { summary: 'Últimos treinta análisis de este objeto; sin descifrar cuerpos', responses }, post: { summary: 'Ejecutar BSIE con instantánea PH propia y guardar evidencia cifrada', description: 'Hasta 64 entidades con geometría propia, 2000 registros y 100 KB de contenido cifrado; no se aceptan datos GeoJSON o valores aportados en esta ruta. Los ceros representan registros retenidos, no cobertura completa.', parameters: [{ name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,128}$' } }], requestBody, responses: { ...responses, 201: { description: 'Análisis guardado y auditado' } } } },
  [base + '/preview']: { parameters: [pathId('id')], post: { summary: 'Revisar cobertura y exclusiones del conjunto contextual', requestBody, responses } },
  [base + '/{analysis}']: { parameters: [pathId('id'), pathId('analysis')], get: { summary: 'Descifrar instantánea, parámetros, manifiesto y resultado con consulta auditada', responses } },
  [base + '/{analysis}/reproduce']: { parameters: [pathId('id'), pathId('analysis')], post: { summary: 'Recalcular la entrada congelada y semilla; comparar resultado sin modificar el histórico', responses } },
};
module.exports = { paths };
