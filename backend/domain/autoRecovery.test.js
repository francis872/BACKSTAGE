const test = require('node:test');
const assert = require('node:assert/strict');
const { backoffMs, recoveryCandidate, canAttempt } = require('../services/autoRecovery.service');

const policy = { maxAttempts: 3, baseCooldownMs: 60000, maxCooldownMs: 3600000 };

test('uses exponential backoff with cap', () => {
  assert.equal(backoffMs(1, policy), 60000);
  assert.equal(backoffMs(2, policy), 120000);
  assert.equal(backoffMs(3, policy), 240000);
  assert.equal(backoffMs(10, policy), 3600000);
});

test('only safe technical workflow states are eligible', () => {
  assert.equal(recoveryCandidate({ workflow: { state: 'stale' }, sla: { breached: false } }), 'recalculate_comparison');
  assert.equal(recoveryCandidate({ workflow: { state: 'probability_pending' }, sla: { breached: true } }), 'retry_probability');
  assert.equal(recoveryCandidate({ workflow: { state: 'risk_review_pending' }, sla: { breached: true } }), 'reopen_risk_review');
  assert.equal(recoveryCandidate({ workflow: { state: 'recommendation_review_pending' }, sla: { breached: true } }), null);
  assert.equal(recoveryCandidate({ workflow: { state: 'recommended' }, sla: { breached: true } }), null);
});

test('cooldown and max attempts prevent retry storms', () => {
  const now = Date.now();
  const cooling = canAttempt({ attempts: 1, next_attempt_at: new Date(now + 60000).toISOString() }, now, policy);
  assert.equal(cooling.allowed, false);
  assert.equal(cooling.cooldown, true);

  const exhausted = canAttempt({ attempts: 3, next_attempt_at: null }, now, policy);
  assert.equal(exhausted.allowed, false);
  assert.equal(exhausted.locked, true);
});
