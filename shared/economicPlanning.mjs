import { minor, fraction, add, multiply, compare, rate, integer, text, sum, min, positive, abs, scaled, roundedUnits, decimalText, apportion, nextMonth, fail } from './economicMoney.mjs';

export function optimizeBudget(model, approvedBudgets) {
  if (!model) return { status: 'not_requested' };
  const selected = model.budget_ids.map(id => approvedBudgets.find(b => b.id === String(id)));
  if (!selected.length || selected.some(b => !b || b.status !== 'approved')) return { status: 'requires_review', reason: 'approved_budget_required' };
  const available = sum(selected.map(b => minor(b.amount_minor))), reserve = minor(model.reserve_minor);
  const items = model.items.map(r => ({ ...r, lower: minor(r.min_minor), upper: minor(r.max_minor), weight: rate(r.priority, '1000000') }));
  const required = sum(items.map(r => r.lower)) + reserve;
  if (items.some(r => r.lower > r.upper) || required > available) return { status: 'infeasible', certificate: { reason: items.some(r => r.lower > r.upper) ? 'lower_bound_exceeds_upper' : 'minimums_and_reserve_exceed_budget', available_minor: String(available), required_minor: String(required), deficit_minor: String(positive(required - available)) }, allocations: [] };
  let remaining = available - required;
  const allocations = new Map(items.map(r => [r.id, r.lower]));
  for (const item of [...items].sort((a, b) => -compare(a.weight, b.weight) || a.id.localeCompare(b.id, 'en'))) {
    if (item.weight.n === 0n) continue;
    const increment = min(remaining, item.upper - item.lower); allocations.set(item.id, item.lower + increment); remaining -= increment;
  }
  const rows = items.map(r => ({ id: r.id, allocated_minor: String(allocations.get(r.id)), min_minor: r.min_minor, max_minor: r.max_minor, priority: r.priority, source_ref: r.source_ref, normative_reference: r.normative_reference || null }));
  const objective = items.reduce((s, r) => add(s, multiply(fraction(allocations.get(r.id)), r.weight)), fraction(0n));
  return { status: 'optimal', method: 'bounded_linear_resource_allocation_greedy_exact', currency: selected[0].currency, available_minor: String(available), reserve_minor: String(reserve), allocated_minor: String(sum([...allocations.values()])), unallocated_minor: String(remaining), objective: { numerator: String(objective.n), denominator: String(objective.d), decimal: decimalText(objective) }, allocations: rows, constraints_verified: true, normative_compliance: 'requires_human_review', proof: 'Lower bounds fixed first; each remaining monetary unit is assigned to the highest marginal priority with remaining capacity. An exchange cannot increase the objective.', limitations: 'Single divisible resource, linear nonnegative marginal priorities and independent bounds; no binary project choices or coupled resource constraints.' };
}

export function calculateFees(config, budgets, entities, coefficientScopeComplete = false) {
  if (!config) return { status: 'not_requested', components: [] };
  const issues = [], output = [], totals = new Map();
  for (const component of config.components) {
    const budget = budgets.find(b => b.id === String(component.budget_id));
    if (!budget || budget.status !== 'approved') { issues.push('approved_budget_required'); continue; }
    const eligible = entities.filter(e => !e.archived && e.kind === 'private_unit' && (e.id === budget.entity_id || e.ancestry_ids.includes(budget.entity_id)));
    if (!eligible.length) { issues.push('no_eligible_private_units'); continue; }
    let weights;
    if (component.basis === 'coefficient') {
      const completeRoot = coefficientScopeComplete && eligible.length === entities.filter(e => !e.archived && e.kind === 'private_unit').length;
      if (!completeRoot || eligible.some(e => e.coefficient_units == null) || sum(eligible.map(e => BigInt(e.coefficient_units || 0))) !== 1000000n) { issues.push('complete_coefficients_total_100_percent_required'); continue; }
      weights = eligible.map(e => ({ id: e.id, weight: String(e.coefficient_units) }));
    } else if (component.basis === 'equal') weights = eligible.map(e => ({ id: e.id, weight: '1' }));
    else {
      if (Object.keys(component.weights).length !== eligible.length || eligible.some(e => !Object.hasOwn(component.weights, e.id))) { issues.push('custom_weights_must_cover_exact_eligible_units'); continue; }
      weights = eligible.map(e => ({ id: e.id, weight: component.weights[e.id] }));
    }
    const amount = minor(component.amount_minor), allocations = apportion(amount, weights);
    for (const row of allocations) {
      const installments = apportion(minor(row.amount_minor), Array.from({ length: config.installments }, (_, i) => ({ id: String(i + 1).padStart(3, '0'), weight: '1' })));
      row.installments_minor = installments.map(r => r.amount_minor);
    }
    totals.set(budget.id, (totals.get(budget.id) || 0n) + amount);
    output.push({ ...component, budget_revision: budget.revision, budget_source: budget.source_ref, eligible_entity_ids: eligible.map(e => e.id), allocations, formula: 'component_amount * applicable_weight / sum(applicable_weights)', rounding: 'Hamilton largest remainder; ties by entity identifier; installments use the same conservation rule' });
  }
  for (const [id, total] of totals) if (total !== minor(budgets.find(b => b.id === id).amount_minor)) issues.push('components_must_conserve_selected_budget_exactly');
  return { status: issues.length ? 'requires_review' : 'calculated_proposal', issues: [...new Set(issues)], components: issues.length ? [] : output, installments: config.installments, total_minor: issues.length ? null : String(sum([...totals.values()])), legal_validity: 'not_certified', rule_review: 'human_review_required', creates_charges: false };
}

function mean(values) { return roundedUnits(fraction(sum(values), BigInt(values.length)), 0); }
function model(values, window) { return positive(mean(values.slice(-window))); }
function validation(values, window, quantile) {
  const errors = [], naive = [];
  for (let i = window; i < values.length; i++) { errors.push(values[i] - model(values.slice(0, i), window)); naive.push(values[i] - positive(values[i - 1])); }
  if (!errors.length) return { samples: 0, mae_minor: null, naive_mae_minor: null, radius: null };
  const ordered = errors.map(abs).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const q = rate(quantile, '1'), rank = Number((BigInt(ordered.length) * q.n + q.d - 1n) / q.d) - 1;
  return { samples: errors.length, mae_minor: String(mean(errors.map(abs))), naive_mae_minor: String(mean(naive.map(abs))), errors_minor: errors.map(String), radius: errors.length < 3 ? null : ordered[Math.max(0, rank)], validation: 'rolling_origin_one_step_training_only_past_values' };
}
export function forecastEconomic(history, config, openingReceivables, startingCash, currentMonth) {
  if (!config.history_attested && !config.supplied_history) return { status: 'requires_history_review', reason: 'confirm_recorded_history_coverage_or_supply_identified_series', scenarios: [] };
  const source = config.supplied_history ? config.supplied_history.rows : history.filter(p => p.complete).map(p => ({ month: p.month, receipts_minor: p.receipts_minor, expenses_minor: p.expenses_minor, billed_minor: p.billed_minor }));
  if (source.length < config.window + 1 || source.some(p => p.month >= currentMonth)) return { status: 'insufficient_history', minimum_months: config.window + 1, scenarios: [] };
  const fields = ['receipts_minor', 'expenses_minor', 'billed_minor'];
  const arrays = Object.fromEntries(fields.map(k => [k, source.map(r => minor(r[k], true))]));
  const checks = Object.fromEntries(fields.map(k => [k, validation(arrays[k], config.window, config.error_quantile)]));
  const last = source.at(-1).month;
  if (nextMonth(last) !== currentMonth) return { status: 'history_not_current', required_training_end: 'previous_complete_month', backtest: Object.fromEntries(Object.entries(checks).map(([k,v]) => [k,{...v,radius:v.radius==null?null:String(v.radius)}])), scenarios: [] };
  const scenarios = config.variants.map(variant => {
    const series = structuredClone(arrays); for (const k of fields) series[k].push(model(series[k], config.window));
    let cash = startingCash, portfolio = openingReceivables, lowCash = startingCash, highCash = startingCash, lowPortfolio = openingReceivables, highPortfolio = openingReceivables, p = currentMonth;
    const periods = [];
    for (let h = 1; h <= config.horizon; h++) {
      p = nextMonth(p);
      const billed = scaled(model(series.billed_minor, config.window), variant.billing_factor), plannedReceipt = scaled(model(series.receipts_minor, config.window), variant.collection_factor), expense = scaled(model(series.expenses_minor, config.window), variant.expense_factor);
      const receipt = min(plannedReceipt, portfolio + billed), nextPortfolio = portfolio + billed - receipt;
      const incomeRadius = checks.receipts_minor.radius == null ? null : scaled(checks.receipts_minor.radius, variant.collection_factor);
      const expenseRadius = checks.expenses_minor.radius == null ? null : scaled(checks.expenses_minor.radius, variant.expense_factor);
      const billedRadius = checks.billed_minor.radius == null ? null : scaled(checks.billed_minor.radius, variant.billing_factor);
      let interval = null;
      if (incomeRadius != null && expenseRadius != null) {
        lowCash += positive(receipt - incomeRadius) - (expense + expenseRadius);
        highCash += receipt + incomeRadius - positive(expense - expenseRadius);
        interval = { cash_lower_minor: String(lowCash), cash_upper_minor: String(highCash), interpretation: 'empirical_backtest_error_sensitivity_band_not_guaranteed_coverage' };
        if (billedRadius != null) { lowPortfolio = positive(lowPortfolio + positive(billed - billedRadius) - (receipt + incomeRadius)); highPortfolio = positive(highPortfolio + billed + billedRadius - positive(receipt - incomeRadius)); interval.receivables_lower_minor = String(lowPortfolio); interval.receivables_upper_minor = String(highPortfolio); }
      }
      cash += receipt - expense;
      periods.push({ month: p, billed_minor: String(billed), planned_receipts_minor: String(plannedReceipt), receipts_minor: String(receipt), expenses_minor: String(expense), net_minor: String(receipt - expense), cash_minor: String(cash), receivables_open_minor: String(portfolio), receivables_close_minor: String(nextPortfolio), collection_capped_minor: String(plannedReceipt - receipt), deficit: cash < 0n, interval });
      // Recursive baseline, then scenario factor: do not compound the factor twice.
      for (const k of fields) series[k].push(model(series[k], config.window));
      portfolio = nextPortfolio;
    }
    return { id: variant.id, assumptions: variant, periods };
  });
  return { status: 'estimated_conditionally', model: 'recursive_trailing_mean_nonnegative', window: config.window, history_source: config.supplied_history ? { nature: config.supplied_history.nature, reference: config.supplied_history.source_ref } : { nature: 'recorded_journal_with_operator_coverage_attestation', reference: config.history_source_ref }, training_end: last, first_forecast_month:nextMonth(currentMonth), partial_month_gap:{assumed_net_minor:'0',nature:'unmodeled_remaining_current_month_not_observed_zero'}, backtest: Object.fromEntries(Object.entries(checks).map(([k, v]) => [k, { ...v, radius: v.radius == null ? null : String(v.radius) }])), uncertainty: { kind: 'empirical_error_sensitivity', quantile: config.error_quantile, formal_coverage_guarantee: false, assumptions: 'Past errors may not describe future errors; temporal dependence, shocks and incomplete records can invalidate the band.' }, scenarios };
}
