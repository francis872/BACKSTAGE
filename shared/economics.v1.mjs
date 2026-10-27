import { object, integer, minor, rate, text, month, months, nextMonth, sum, positive, min, ratio, fraction, add, multiply, compare, decimalText, fail } from './economicMoney.mjs';
import { optimizeBudget, calculateFees, forecastEconomic } from './economicPlanning.mjs';
export const VERSION = 'backstage-economics-1';
export const POLICY = Object.freeze({ money: 'canonical_integer_minor_unit_strings_BigInt', rounding: 'half_away_from_zero_for_forecast;Hamilton_largest_remainder_for_fees', calendar: 'UTC_months', journal_time: 'verified_recording_time_not_bank_statement', max_periods: 36, max_events: 5000, max_entities: 500 });

export function normalizeEconomicAssumptions(raw) {
  object(raw, ['title', 'currency', 'scale', 'from', 'to', 'opening_cash_minor', 'opening_source_ref', 'forecast', 'optimization', 'fees', 'overdue_alert_ratio', 'threshold_source_ref']);
  if (!/^[A-Z]{3}$/.test(raw.currency || '')) fail('Selecciona una moneda de tres letras.');
  const q = { title: text(raw.title, 200), currency: raw.currency, scale: integer(raw.scale, 0, 4, 'Decimales'), from: month(raw.from), to: month(raw.to), opening_cash_minor: String(minor(raw.opening_cash_minor, true)), opening_source_ref: text(raw.opening_source_ref) };
  months(q.from, q.to);
  const f = raw.forecast || {}; object(f, ['window', 'horizon', 'history_attested', 'history_source_ref', 'supplied_history', 'error_quantile', 'variants']);
  q.forecast = { window: integer(f.window ?? 3, 1, 12, 'Ventana'), horizon: integer(f.horizon ?? 3, 1, 12, 'Horizonte'), history_attested: f.history_attested === true, history_source_ref: f.history_attested ? text(f.history_source_ref) : null, error_quantile: String(f.error_quantile ?? '0.9') };
  const quantile = rate(q.forecast.error_quantile, '1'); if (quantile.n === 0n) fail('El cuantil de errores debe ser positivo.');
  let variants = f.variants || [{ id: 'optimistic', billing_factor: '1', collection_factor: '1', expense_factor: '1' }, { id: 'pessimistic', billing_factor: '1', collection_factor: '1', expense_factor: '1' }];
  if (Array.isArray(variants) && variants.some(v => v.id === 'base')) { const base = variants.filter(v => v.id === 'base'); if (base.length !== 1 || ['billing_factor','collection_factor','expense_factor'].some(k => base[0][k] !== '1')) fail('El escenario base no admite factores modificados.'); variants = variants.filter(v => v.id !== 'base'); }
  if (!Array.isArray(variants) || variants.length > 5 || new Set(variants.map(v => v.id)).size !== variants.length) fail('Máximo cinco variantes únicas además del escenario base.');
  q.forecast.variants = [{ id: 'base', billing_factor: '1', collection_factor: '1', expense_factor: '1' }, ...variants.map(v => { object(v, ['id', 'billing_factor', 'collection_factor', 'expense_factor', 'source_ref']); if (!/^[a-z][a-z0-9_-]{0,39}$/.test(v.id || '') || v.id === 'base') fail('Identificador de escenario inválido.'); const row = { id: v.id }; for (const k of ['billing_factor', 'collection_factor', 'expense_factor']) { rate(v[k]); row[k] = String(v[k]); } row.source_ref = v.source_ref ? text(v.source_ref) : 'Explicit planning factor; no automatic business approval'; return row; })];
  if (f.supplied_history) {
    const h = f.supplied_history; object(h, ['source_ref', 'nature', 'rows']);
    if (!['ORGANIZATION_PROVIDED', 'SIMULATED'].includes(h.nature) || !Array.isArray(h.rows) || h.rows.length < 2 || h.rows.length > 36) fail('La historia aportada requiere origen, naturaleza y entre dos y treinta y seis meses.');
    const rows = h.rows.map(r => { object(r, ['month', 'receipts_minor', 'expenses_minor', 'billed_minor']); return { month: month(r.month), receipts_minor: String(minor(r.receipts_minor)), expenses_minor: String(minor(r.expenses_minor)), billed_minor: String(minor(r.billed_minor)) }; });
    if (rows.some((r, i) => i && r.month !== nextMonth(rows[i - 1].month))) fail('La historia aportada debe ser mensual, consecutiva y sin duplicados.');
    q.forecast.supplied_history = { source_ref: text(h.source_ref), nature: h.nature, rows };
  }
  if (raw.optimization) {
    const o = raw.optimization; object(o, ['budget_ids', 'reserve_minor', 'items']);
    if (!Array.isArray(o.budget_ids) || !o.budget_ids.length || o.budget_ids.length > 20 || new Set(o.budget_ids.map(String)).size !== o.budget_ids.length || !Array.isArray(o.items) || !o.items.length || o.items.length > 100) fail('Selecciona presupuestos únicos y entre uno y cien destinos.');
    const items = o.items.map(r => { object(r, ['id', 'min_minor', 'max_minor', 'priority', 'source_ref', 'normative_reference']); const priority = String(r.priority); rate(priority, '1000000'); return { id: text(r.id, 80), min_minor: String(minor(r.min_minor)), max_minor: String(minor(r.max_minor)), priority, source_ref: text(r.source_ref), ...(r.normative_reference ? { normative_reference: text(r.normative_reference) } : {}) }; });
    if (new Set(items.map(r => r.id)).size !== items.length) fail('Los destinos presupuestarios deben tener identificadores únicos.');
    q.optimization = { budget_ids: o.budget_ids.map(String), reserve_minor: String(minor(o.reserve_minor)), items };
  }
  if (raw.fees) {
    const f = raw.fees; object(f, ['installments', 'components']);
    if (!Array.isArray(f.components) || !f.components.length || f.components.length > 20) fail('Declara entre uno y veinte componentes de cuota.');
    q.fees = { installments: integer(f.installments, 1, 120, 'Número de pagos'), components: f.components.map(c => {
      object(c, ['id', 'budget_id', 'amount_minor', 'kind', 'basis', 'weights', 'rule_reference', 'normative_reference']);
      if (!['common', 'reserve', 'extraordinary'].includes(c.kind) || !['coefficient', 'equal', 'custom'].includes(c.basis)) fail('Tipo o criterio de reparto no admitido.');
      const row = { id: text(c.id, 80), budget_id: String(c.budget_id), amount_minor: String(minor(c.amount_minor)), kind: c.kind, basis: c.basis, rule_reference: text(c.rule_reference), normative_reference: text(c.normative_reference) };
      if (c.basis === 'custom') { if (!c.weights || typeof c.weights !== 'object' || Array.isArray(c.weights) || Object.keys(c.weights).length > 500) fail('Pesos personalizados inválidos.'); row.weights = {}; for (const [id, weight] of Object.entries(c.weights)) { if (!/^\d+$/.test(id)) fail('Identificador de unidad inválido.'); rate(weight, '1000000000'); row.weights[id] = String(weight); } }
      return row;
    }) };
    if (new Set(q.fees.components.map(c => c.id)).size !== q.fees.components.length) fail('Componentes de cuota duplicados.');
  }
  if (raw.overdue_alert_ratio != null) { rate(raw.overdue_alert_ratio, '1'); q.overdue_alert_ratio = String(raw.overdue_alert_ratio); q.threshold_source_ref = text(raw.threshold_source_ref); }
  return q;
}

function replay(events, until) {
  const charges = new Map(), receipts = new Map(), expenses = new Map(), seen = new Set(), paidByCharge = new Map();
  let cash = 0n, billed = 0n, received = 0n, paid = 0n;
  for (const event of events) {
    if (event.at > until) break;
    if (seen.has(event.id)) fail('Evento financiero duplicado.'); seen.add(event.id);
    const amount = minor(event.amount_minor), id = String(event.record_id);
    if (!event.kind.startsWith('void_') && (charges.has(id) || receipts.has(id) || expenses.has(id))) fail('Identificador financiero reutilizado.');
    if (event.kind === 'charge') { if (charges.has(id)) fail('Cargo duplicado.'); charges.set(id, { ...event, amount, active: true }); billed += amount; }
    else if (event.kind === 'receipt') { const chargeId=String(event.charge_id),charge = charges.get(chargeId); if (!charge?.active || String(charge.entity_id)!==String(event.entity_id)) fail('Pago sin cargo vigente de la misma entidad.'); const collected=paidByCharge.get(chargeId)||0n;if(collected+amount>charge.amount)fail('El pago excede el saldo en su fecha registrada.');paidByCharge.set(chargeId,collected+amount);receipts.set(id, { ...event, amount, active: true }); received += amount; cash += amount; }
    else if (event.kind === 'expense') { expenses.set(id, { ...event, amount, active: true }); paid += amount; cash -= amount; }
    else if (event.kind === 'void_charge') { const row = charges.get(id); if (!row?.active || row.amount !== amount || [...receipts.values()].some(r => r.active && String(r.charge_id) === id)) fail('Anulación de cargo inconsistente.'); row.active = false; billed -= amount; }
    else if (event.kind === 'void_receipt') { const row = receipts.get(id); if (!row?.active || row.amount !== amount) fail('Anulación de pago inconsistente.'); row.active = false;const chargeId=String(row.charge_id);paidByCharge.set(chargeId,(paidByCharge.get(chargeId)||0n)-amount); received -= amount; cash -= amount; }
    else if (event.kind === 'void_expense') { const row = expenses.get(id); if (!row?.active || row.amount !== amount) fail('Anulación de egreso inconsistente.'); row.active = false; paid -= amount; cash += amount; }
    else fail('Tipo de hecho financiero no admitido.');
  }
  const balances = [];
  for (const row of charges.values()) if (row.active) {
    const collected = paidByCharge.get(String(row.record_id))||0n;
    const balance = row.amount - collected; if (balance < 0n) fail('Pago superior al cargo.');
    const overdueDays = Math.max(0, Math.floor((Date.parse(until) - Date.parse(row.due_at)) / 86400000));
    balances.push({ entity_id: String(row.entity_id), charge_id: String(row.record_id), balance, overdue: Date.parse(row.due_at) < Date.parse(until), overdueDays });
  }
  return { charges, balances, cash, billed, received, paid };
}
function portfolio(state, entities) {
  const total = sum(state.balances.map(r => r.balance)), overdue = sum(state.balances.filter(r => r.overdue).map(r => r.balance));
  const bucket = { current: 0n, days_1_30: 0n, days_31_60: 0n, days_61_90: 0n, over_90: 0n };
  for (const row of state.balances) bucket[!row.overdue ? 'current' : row.overdueDays <= 30 ? 'days_1_30' : row.overdueDays <= 60 ? 'days_31_60' : row.overdueDays <= 90 ? 'days_61_90' : 'over_90'] += row.balance;
  const balancesByEntity=new Map(),overdueByEntity=new Map();for(const r of state.balances){balancesByEntity.set(r.entity_id,(balancesByEntity.get(r.entity_id)||0n)+r.balance);if(r.overdue)overdueByEntity.set(r.entity_id,(overdueByEntity.get(r.entity_id)||0n)+r.balance);}
  const rows = entities.map(e => ({ entity_id: e.id, outstanding_minor: String(balancesByEntity.get(e.id)||0n), overdue_minor: String(overdueByEntity.get(e.id)||0n) }));
  const shares = total === 0n ? null : sum(rows.map(r => minor(r.outstanding_minor) ** 2n));
  return { outstanding_minor: String(total), current_minor: String(total - overdue), overdue_minor: String(overdue), overdue_share: ratio(overdue, total), aging: Object.fromEntries(Object.entries(bucket).map(([k, v]) => [k, String(v)])), concentration_hhi: shares == null ? null : ratio(shares, total * total), entities: rows, charged_entities: new Set(state.balances.map(r => r.entity_id)).size, overdue_entities: new Set(state.balances.filter(r => r.overdue && r.balance > 0n).map(r => r.entity_id)).size };
}
export function runEconomics(snapshot, raw) {
  const q = normalizeEconomicAssumptions(raw), calendar = months(q.from, q.to), capture = snapshot.captured_at;
  if (!Number.isFinite(Date.parse(capture)) || q.to > capture.slice(0, 7)) fail('Los periodos históricos no pueden estar en el futuro.');
  if (snapshot.currency !== q.currency || snapshot.scale !== q.scale) fail('La instantánea y la moneda seleccionada no coinciden.');
  if (!Array.isArray(snapshot.entities) || snapshot.entities.length > 500 || !Array.isArray(snapshot.events) || snapshot.events.length > 5000) fail('La selección supera los límites del motor.');
  const entityIds = new Set(snapshot.entities.map(e => e.id));
  if (entityIds.size !== snapshot.entities.length || snapshot.events.some(e => !entityIds.has(e.entity_id) || typeof e.at !== 'string' || !Number.isFinite(Date.parse(e.at)) || new Date(e.at).toISOString() !== e.at || !Number.isSafeInteger(e.sequence) || e.sequence < 1 || e.kind === 'charge' && (!Number.isFinite(Date.parse(e.due_at)) || new Date(e.due_at).toISOString() !== e.due_at))) fail('Hechos económicos o referencias territoriales inválidos.');
  const events = [...snapshot.events].sort((a, b) => a.at.localeCompare(b.at) || a.sequence - b.sequence);
  const current = replay(events, capture), receivables = portfolio(current, snapshot.entities);
  const opening = minor(q.opening_cash_minor, true), start = q.from + '-01T00:00:00.000Z';
  const before = replay(events, new Date(Date.parse(start) - 1).toISOString());
  let prior = before, cash = opening;
  const history = calendar.map(p => {
    const end = new Date(Date.parse(nextMonth(p) + '-01T00:00:00.000Z') - 1).toISOString(), until = end < capture ? end : capture, state = replay(events, until);
    const receipts = state.received - prior.received, expenses = state.paid - prior.paid, billed = state.billed - prior.billed; cash += receipts - expenses;
    const debt = portfolio(state, snapshot.entities); prior = state;
    const budgets = snapshot.budgets.filter(b => b.status === 'approved' && b.starts_at.slice(0, 7) === p && (b.ends_at.slice(0, 7) === p || b.ends_at === nextMonth(p) + '-01T00:00:00.000Z'));
    const budget = budgets.length ? sum(budgets.map(b => minor(b.amount_minor))) : null;
    return { month: p, complete: end < capture, receipts_minor: String(receipts), expenses_minor: String(expenses), billed_minor: String(billed), net_minor: String(receipts - expenses), cash_minor: String(cash), deficit: cash < 0n, outstanding_minor: debt.outstanding_minor, overdue_minor: debt.overdue_minor, overdue_share: debt.overdue_share, expense_budget_minor: budget == null ? null : String(budget), budget_variance_minor: budget == null ? null : String(budget - expenses), budget_scope: budget == null ? 'no_exact_month_approved_budget' : 'approved_budget_within_same_calendar_month' };
  });
  const currentCash = opening + current.cash - before.cash;
  const forecast = forecastEconomic(history, q.forecast, minor(receivables.outstanding_minor), currentCash, capture.slice(0, 7));
  const alerts = [];
  if (currentCash < 0n) alerts.push({ type: 'recorded_cash_deficit', amount_minor: String(-currentCash), basis: 'declared_opening_cash_plus_recorded_net_movements' });
  for (let i = 1; i < history.length; i++) if (minor(history[i].overdue_minor) > minor(history[i - 1].overdue_minor)) alerts.push({ type: 'observed_overdue_balance_increase', month: history[i].month, change_minor: String(minor(history[i].overdue_minor) - minor(history[i - 1].overdue_minor)), coverage: 'recorded_ledger_only' });
  if (q.overdue_alert_ratio != null && receivables.overdue_share && compare(fraction(BigInt(receivables.overdue_share.numerator), BigInt(receivables.overdue_share.denominator)), rate(q.overdue_alert_ratio, '1')) > 0) alerts.push({ type: 'operator_defined_overdue_threshold_exceeded', threshold: q.overdue_alert_ratio, source_ref: q.threshold_source_ref });
  for (const s of forecast.scenarios) if (s.periods.some(p => p.deficit)) alerts.push({ type: 'conditional_projected_cash_deficit', scenario: s.id, certainty: 'conditional_on_supplied_assumptions' });
  const optimization = optimizeBudget(q.optimization, snapshot.budgets), fees = calculateFees(q.fees, snapshot.budgets, snapshot.entities, snapshot.coefficient_scope_complete === true);
  const recommendations = alerts.map(a => ({ trigger: a.type, recommendation: a.type.includes('cash_deficit') ? 'Revisar calendario de recaudo/egresos y supuestos; no comprometer recursos sin aprobación.' : 'Revisar saldos, antigüedad y calidad de registros antes de tomar medidas de cobro.', evidence: a }));
  return { version: VERSION, policy: POLICY, currency: q.currency, scale: q.scale, captured_at: capture, history, current: { cash_estimate_minor: String(currentCash), opening_source_ref: q.opening_source_ref, opening_as_of: start, receivables }, forecast, optimization, fees, alerts, recommendations, limitations: ['Registro administrativo manual, no conciliación bancaria.', 'Los escenarios son condicionales y las bandas no garantizan cobertura.', 'Ningún cálculo crea cobros ni certifica cumplimiento normativo.'] };
}
