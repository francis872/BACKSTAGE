// Independent two-node fixture: the only possible service tour is depot -> point -> depot.
function goldenResult() {
  return { version: 'soi-scientific-1.0.0', operation: 'optimize_routes', duration_ms: 1, result: { status: 'FEASIBLE', feasible: true, optimality_proven: false, solver_version: 'isolated-fixture', routes: [{ vehicle_id: '3', used: true, visits: [{ node_index: 0, node_id: '1', arrival_s: 0, load_kg: 0 }, { node_index: 1, node_id: '2', arrival_s: 100, load_kg: 5 }, { node_index: 0, node_id: '1', arrival_s: 200, load_kg: 5 }], distance_m: 2000, duration_s: 200, load_kg: 5, capacity_kg: 10, cost: null, estimated_kgco2e: null }], served_node_ids: ['2'], dropped_node_ids: [], totals: { distance_m: 2000, duration_s: 200, cost: null, currency: null, estimated_kgco2e: null }, objective: { normalized_weighted_sum: 2 }, duration_ms: 1 } };
}
module.exports = { goldenResult };
