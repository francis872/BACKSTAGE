const test = require('node:test');
const assert = require('node:assert/strict');
const analyticsService = require('../services/analytics.service');
const analyticsJobsRepository = require('../repositories/analyticsJobs.repository');

test('analytics service executes TOPSIS, financial and risk engines and records versioned job traces', async () => {
  const originalMethods = {
    createJob: analyticsJobsRepository.createJob,
    completeJob: analyticsJobsRepository.completeJob,
    failJob: analyticsJobsRepository.failJob,
  };
  const jobs = new Map();
  let nextId = 1;

  analyticsJobsRepository.createJob = async (input) => {
    const job = { analytics_job_id: nextId++, status: 'running', ...input };
    jobs.set(job.analytics_job_id, job);
    return job;
  };
  analyticsJobsRepository.completeJob = async (id, result) => {
    const job = jobs.get(id);
    Object.assign(job, result, { status: 'succeeded' });
    return job;
  };
  analyticsJobsRepository.failJob = async (id, failure) => {
    const job = jobs.get(id);
    Object.assign(job, failure, { status: 'failed' });
    return job;
  };

  try {
    const context = {
      sessionUser: { user_id: 7 },
      organization: { organization_id: 11 },
      context: { module: 'mathematical-integration-test' },
    };
    const comparison = await analyticsService.executeAlgorithm('multicriteria.topsis', {
      alternatives: [
        { name: 'Medellín', criteria: { accessibility: 90, market: 75 } },
        { name: 'Bogotá', criteria: { accessibility: 80, market: 85 } },
        { name: 'Cali', criteria: { accessibility: 65, market: 60 } },
      ],
      weights: { accessibility: 0.6, market: 0.4 },
      directions: { accessibility: 'benefit', market: 'benefit' },
    }, context);

    assert.equal(comparison.status, 'succeeded');
    assert.equal(comparison.result.method, 'topsis');
    assert.equal(comparison.result.ranking.length, 3);
    assert.equal(comparison.version, jobs.get(comparison.analytics_job_id).algorithmVersion);
    assert.equal(jobs.get(comparison.analytics_job_id).status, 'succeeded');

    const financial = await analyticsService.executeAlgorithm('financial.npv_irr', {
      cashFlows: [-100, 110],
      discountRate: 0.1,
    }, context);
    assert.ok(Math.abs(financial.result.npv) < 1e-9);
    assert.ok(Math.abs(financial.result.irr.irr - 0.1) < 1e-6);

    const risk = await analyticsService.executeAlgorithm('risk.monte_carlo', {
      factors: { loss: { mean: 100, stdDev: 15 } },
      iterations: 2000,
      seed: 7,
    }, context);
    assert.ok(risk.result.p5 <= risk.result.p50);
    assert.ok(risk.result.p50 <= risk.result.p95);

    for (const execution of [comparison, financial, risk]) {
      const job = jobs.get(execution.analytics_job_id);
      assert.equal(job.status, 'succeeded');
      assert.equal(job.organizationId, 11);
      assert.ok(job.algorithmVersion);
      assert.ok(Number.isFinite(job.durationMs));
    }
  } finally {
    Object.assign(analyticsJobsRepository, originalMethods);
  }
});