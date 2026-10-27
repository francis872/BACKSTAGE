const { hash, canonicalJson, CONTRACT_VERSION } = require('./intelligenceContract.service');
const spatial = require('./spatialEvidence.service');
const ApiError = require('../utils/ApiError');
const VERSION = 'backstage-route-evidence-1';
const DEFAULT_WEIGHTS = { distance: 1, time: 0, cost: 0, emissions: 0, penalty: 1, balance: 0 };
const DEFAULT_SCALES = { distance: 1000, time: 3600, cost: 1, emissions: 1, penalty: 1, balance: 1000 };
const fail = m => { throw new ApiError(400, m); };
const number = (v, min, max, label) => { if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) fail(`${label}: número fuera de rango.`); return v; };
const configuration = c => ({ sector: c.sector || null, revision: Number.isInteger(c.revision) ? c.revision : null, capabilities: [...(c.capabilities || [])].sort() });
function normalize(payload, config) {
  canonicalJson(payload);
  const p = structuredClone(payload), n = p.nodes.length;
  const horizon = Math.floor(number(p.horizon_s ?? 86400, 1, 172800, 'Horizonte'));
  const window = (v, label) => { if (!Array.isArray(v) || v.length !== 2) fail(`${label}: requiere inicio y fin.`); const a = v.map(x => Math.floor(number(x, 0, horizon, label))); if (a[0] > a[1]) fail(`${label}: intervalo desordenado.`); return a; };
  if (new Set(p.nodes.map(x => x.id)).size !== n || new Set(p.vehicles.map(x => x.id)).size !== p.vehicles.length) fail('No se permiten activos o vehículos repetidos.');
  p.nodes = p.nodes.map(node => ({ ...node, coordinates: spatial.coordinate(node.coordinates), demand_kg: number(node.demand_kg ?? 0, 0, 1e7, 'Demanda kg'), service_s: Math.ceil(number(node.service_s ?? 0, 0, 86400, 'Servicio')), time_window_s: window(node.time_window_s ?? [0, horizon], 'Ventana'), optional: node.optional ?? false, priority: number(node.priority ?? 1000, 0, 1e9, 'Prioridad') }));
  if (p.nodes.some(node => typeof node.optional !== 'boolean')) fail('Visita opcional requiere booleano.');
  p.vehicles = p.vehicles.map(v => {
    const start = v.start_index ?? 0, end = v.end_index ?? start;
    for (const index of [start, end]) if (!Number.isInteger(index) || index < 0 || index >= n) fail('Índice de depósito inválido.');
    const result = { ...v, capacity_kg: number(v.capacity_kg, .001, 1e7, 'Capacidad kg'), start_index: start, end_index: end, shift_s: window(v.shift_s ?? [0, horizon], 'Turno') };
    for (const k of ['cost_per_km', 'cost_per_hour', 'fixed_cost', 'emission_kgco2e_per_km']) if (v[k] != null) result[k] = number(v[k], 0, 1e12, k);
    return result;
  });
  for (const v of p.vehicles) for (const i of [v.start_index, v.end_index]) if (p.nodes[i].demand_kg !== 0 || p.nodes[i].service_s !== 0) fail('Los depósitos deben tener demanda y servicio cero.');
  for (const key of ['distance_m', 'duration_s']) {
    const matrix = p.matrix[key];
    if (!Array.isArray(matrix) || matrix.length !== n || matrix.some(row => !Array.isArray(row) || row.length !== n)) fail('Matriz cuadrada requerida.');
    matrix.forEach((row, i) => row.forEach((v, j) => { number(v, 0, 1e9, key); if (i === j && v !== 0) fail('La diagonal de la matriz debe ser cero.'); }));
  }
  p.horizon_s = horizon; p.time_limit_s = Math.floor(number(p.time_limit_s ?? 3, .1, 15, 'Tiempo de búsqueda')*1000)/1000;
  for (const value of [p.objective, p.objective?.weights, p.objective?.scales]) if (value != null && (typeof value !== 'object' || Array.isArray(value))) fail('Objetivo, pesos y escalas requieren objetos.');
  const weights = { ...DEFAULT_WEIGHTS, ...p.objective?.weights }, scales = { ...DEFAULT_SCALES, ...p.objective?.scales };
  for (const [values, minimum, label] of [[weights, 0, 'Peso'], [scales, 1e-6, 'Escala']]) {
    if (Object.keys(values).some(k => !Object.hasOwn(DEFAULT_WEIGHTS, k))) fail('Término del objetivo no admitido.');
    for (const value of Object.values(values)) number(value, minimum, label === 'Peso' ? 1e6 : 1e12, label);
  }
  if (!Object.values(weights).some(v => v > 0)) fail('Al menos un peso debe ser positivo.');
  if (weights.cost > 0 && (!/^[A-Z]{3}$/.test(p.currency || '') || p.vehicles.some(v => v.cost_per_km == null || v.cost_per_hour == null))) fail('Costo requiere moneda y tarifas por km/hora de cada vehículo.');
  if (weights.emissions > 0 && p.vehicles.some(v => v.emission_kgco2e_per_km == null || typeof v.emission_factor_source !== 'string' || !v.emission_factor_source.trim())) fail('Emisiones requiere factores con fuente.');
  p.objective = { weights, scales }; p.currency = p.currency || null;
  p.spatial_reference = spatial.REFERENCE;
  p.rule_context = { version: spatial.rules.version, catalog_sha256: hash(spatial.rules), configuration: configuration(config), configuration_sha256: hash(configuration(config)) };
  p.planning_context = { mode: 'planning_with_supplied_data', gps_provider: null, live_traffic: false };
  return p;
}
function semanticResult(result) {
  if (Array.isArray(result)) return result.map(semanticResult);
  if (!result || typeof result !== 'object') return result;
  return Object.fromEntries(Object.entries(result).filter(([k]) => k !== 'duration_ms').map(([k, v]) => [k, semanticResult(v)]));
}
function build(input, result) {
  return spatial.manifest({ contract_version: CONTRACT_VERSION, engine: { id: 'soi.route_optimization', version: result.version, evidence_version: VERSION, source_sha256: spatial.fingerprint('optimization'), solver: 'OR-Tools routing', solver_version: result.result.solver_version || null }, input_sha256: hash(input), result_sha256: hash(semanticResult(result)), business_rules: input.rule_context, spatial_reference: spatial.REFERENCE, numeric_policy: { arithmetic: 'binary64_and_integer_solver', demand_resolution_kg: 0.001, demand_rounding: 'nearest_ties_to_even', travel_and_service_rounding: 'ceil_seconds', windows_and_shifts_rounding: 'floor_seconds', search_budget_resolution: 'floor_milliseconds', objective_integer_scale: 1000000 }, quantities: { distance: 'm', duration: 's', demand: 'kg', capacity: 'kg', currency: input.currency }, provenance: { matrix: input.matrix.source, nodes: input.nodes.map(x => ({ asset_id: x.asset_id, coordinates: x.coordinates, resource_snapshot: x.resource_snapshot })), vehicles: input.vehicles.map(x => ({ vehicle_id: x.vehicle_id, resource_snapshot: x.resource_snapshot })), planning: input.planning_context }, reproducibility: { mode: 'bounded_heuristic_search', exact_route_identity_guaranteed: false, first_solution_strategy: 'PATH_CHEAPEST_ARC', local_search: 'GUIDED_LOCAL_SEARCH', time_limit_s: input.time_limit_s, random_seed: 'not_exposed_by_existing_engine', objective: input.objective, time_origin: 'relative_seconds_not_calendar_schedule', excluded_volatile_fields: ['duration_ms'] }, uncertainty: { confidence_interval: null, optimality_proven: result.result.optimality_proven === true } });
}
const grams = x => { const scaled = x * 1000, lo = Math.floor(scaled); return scaled - lo === .5 ? lo % 2 ? lo + 1 : lo : Math.round(scaled); };
const close = (a, b) => typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));
function validateSolution(input, wrapper) {
  const r = wrapper.result;
  if (r.feasible !== true) {
    const depots = new Set(input.vehicles.flatMap(v => [v.start_index, v.end_index]));
    const demands = input.nodes.filter((node, i) => !depots.has(i) && !node.optional).map(x => grams(x.demand_kg));
    const capacities = input.vehicles.map(x => grams(x.capacity_kg));
    if (r.status === 'INFEASIBLE_CAPACITY') return { valid: demands.some(v => v > Math.max(...capacities)) || demands.reduce((a, b) => a + b, 0) > capacities.reduce((a, b) => a + b, 0), status: 'capacity_proof_checked' };
    return { valid: ['INFEASIBLE', 'INFEASIBLE_SHIFT', 'NO_SOLUTION_FOUND_WITHIN_LIMIT'].includes(r.status), status: r.status, mathematical_proof_recomputed: false };
  }
  if (!Array.isArray(r.routes) || r.routes.length !== input.vehicles.length) return { valid: false, status: 'invalid_routes' };
  const errors = [], visited = [], depots = new Set(input.vehicles.flatMap(v => [v.start_index, v.end_index]));
  const totals = { distance: 0, time: 0, cost: 0, emissions: 0, balance: 0 };
  const seenVehicles = new Set();
  for (const route of r.routes) {
    const v = input.vehicles.find(v => v.id === route.vehicle_id);
    if (!v || seenVehicles.has(route.vehicle_id) || !Array.isArray(route.visits) || route.visits.length < 2) { errors.push('vehicle_or_visits'); continue; }
    seenVehicles.add(v.id); const visits = route.visits, used = visits.length > 2;
    if (visits[0].node_index !== v.start_index || visits.at(-1).node_index !== v.end_index || route.used !== used) errors.push('depots_or_use');
    let distance = 0, load = 0;
    for (let j = 0; j < visits.length; j++) {
      const visit = visits[j], node = input.nodes[visit.node_index];
      if (!node || !Number.isInteger(visit.node_index) || node.id !== visit.node_id || !Number.isInteger(visit.arrival_s)) { errors.push('visit_identity'); continue; }
      if (!depots.has(visit.node_index)) { if (j === 0 || j === visits.length - 1) errors.push('endpoint'); visited.push(visit.node_index); load += grams(node.demand_kg); }
      else if (j > 0 && j < visits.length - 1) errors.push('intermediate_depot');
      if (!close(visit.load_kg, load / 1000) || load > grams(v.capacity_kg)) errors.push('capacity');
      if (visit.arrival_s < node.time_window_s[0] || visit.arrival_s > node.time_window_s[1] || visit.arrival_s < v.shift_s[0] || visit.arrival_s > v.shift_s[1]) errors.push('window_or_shift');
      if (j && used) { const previous = visits[j - 1], from = input.nodes[previous.node_index]; if (from) { distance += input.matrix.distance_m[previous.node_index][visit.node_index]; if (visit.arrival_s < previous.arrival_s + Math.ceil(input.matrix.duration_s[previous.node_index][visit.node_index]) + from.service_s) errors.push('travel_or_service'); } }
    }
    const duration = used ? visits.at(-1).arrival_s - visits[0].arrival_s : 0;
    const cost = distance / 1000 * (v.cost_per_km || 0) + duration / 3600 * (v.cost_per_hour || 0) + (used ? v.fixed_cost || 0 : 0), emissions = distance / 1000 * (v.emission_kgco2e_per_km || 0);
    if (!close(route.distance_m, distance) || !close(route.duration_s, duration) || !close(route.load_kg, load / 1000)) errors.push('route_totals');
    if (route.cost != null && !close(route.cost, cost) || route.estimated_kgco2e != null && !close(route.estimated_kgco2e, emissions)) errors.push('route_estimates');
    totals.distance += distance; totals.time += duration; totals.cost += cost; totals.emissions += emissions; totals.balance = Math.max(totals.balance, load / 1000);
  }
  const missing = input.nodes.map((_, i) => i).filter(i => !depots.has(i) && !visited.includes(i));
  if (new Set(visited).size !== visited.length || missing.some(i => !input.nodes[i].optional) || hash((r.dropped_node_ids || []).slice().sort()) !== hash(missing.map(i => input.nodes[i].id).sort()) || hash((r.served_node_ids || []).slice().sort()) !== hash(visited.map(i => input.nodes[i].id).sort())) errors.push('coverage');
  totals.penalty = missing.reduce((a, i) => a + input.nodes[i].priority, 0);
  const objective = Object.keys(DEFAULT_WEIGHTS).reduce((a, k) => a + totals[k] * input.objective.weights[k] / input.objective.scales[k], 0);
  if (!close(r.totals?.distance_m, totals.distance) || !close(r.totals?.duration_s, totals.time) || !close(r.objective?.normalized_weighted_sum, objective)) errors.push('objective_or_totals');
  if (r.totals?.cost != null && !close(r.totals.cost, totals.cost) || r.totals?.estimated_kgco2e != null && !close(r.totals.estimated_kgco2e, totals.emissions)) errors.push('estimated_totals');
  return { valid: errors.length === 0, status: errors.length ? 'invalid_solution' : 'solution_constraints_checked', errors: [...new Set(errors)], recomputed_objective: objective };
}
function verify(record) {
  const base = { checked_at: new Date().toISOString(), verified: false, historical_integrity: false, snapshot_modified: false, replay_mode: 'integrity_and_independent_constraints' };
  if (!record.analysis) return { ...base, status: 'missing_contract' };
  if (record.analysis.engine?.evidence_version !== VERSION || record.result?.version !== 'soi-scientific-1.0.0') return { ...base, status: 'unsupported_version' };
  try {
    const expected = build(record.input, record.result), validation = validateSolution(record.input, record.result);
    const matches = hash(expected) === hash(record.analysis), verified = matches && validation.valid;
    return { ...base, status: verified ? 'verified' : matches ? 'invalid_solution' : 'mismatch', verified, historical_integrity: verified, solution_validation: validation, exact_route_identity_guaranteed: false };
  } catch { return { ...base, status: 'invalid_snapshot' }; }
}
module.exports = { VERSION, normalize, build, verify, validateSolution, semanticResult, configuration };
