const test = require('node:test');
const assert = require('node:assert/strict');
const { conditionsForProject } = require('../services/operationalSupervisor.service');

function project(overrides = {}) {
  return {
    analysis_run_id: 7,
    priority: 'normal',
    health: 50,
    metadata: {},
    workflow: { state: 'probability_pending', label: 'Probabilidad pendiente', target: 'probability-engine' },
    sla: { breached: false, age_hours: 4, limit_hours: 48 },
    ...overrides,
  };
}

test('creates SLA condition only when breached', () => {
  assert.equal(conditionsForProject(project()).some((c) => c.type === 'supervisor.sla_breached'), false);
  const result = conditionsForProject(project({ sla: { breached: true, age_hours: 50, limit_hours: 48 } }));
  assert.equal(result.some((c) => c.type === 'supervisor.sla_breached'), true);
});

test('stale project produces critical recalculation condition', () => {
  const result = conditionsForProject(project({
    priority: 'critical',
    workflow: { state: 'stale', label: 'Recalculo requerido', target: 'portfolio-comparator' },
    blocked_reason: 'Datos modificados.',
  }));
  const stale = result.find((c) => c.type === 'supervisor.stale');
  assert.equal(stale.severity, 'critical');
  assert.equal(stale.target, 'portfolio-comparator');
});

test('critical risks remain supervised until workflow closes', () => {
  const result = conditionsForProject(project({
    metadata: { risk_review: { counts: { critical: 2 } } },
    workflow: { state: 'recommendation_pending', label: 'Recomendación pendiente', target: 'intelligence-recommendations' },
  }));
  assert.equal(result.some((c) => c.type === 'supervisor.critical_risk'), true);
});
