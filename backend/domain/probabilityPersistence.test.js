const test = require('node:test');
const assert = require('node:assert/strict');
const analysisService = require('../services/analysis.service');
const analysisRepository = require('../repositories/analysis.repository');
const operationalEvents = require('../services/operationalEvents.service');

test('probability result persists version, synthetic mode, provenance, and honest null confidence', async () => {
  const original = {
    getAnalysisRunByIdForOrganization: analysisRepository.getAnalysisRunByIdForOrganization,
    saveProbabilityResult: analysisRepository.saveProbabilityResult,
    syncDependencyVersion: analysisRepository.syncDependencyVersion,
    emit: operationalEvents.emit,
  };
  let saved;
  analysisRepository.getAnalysisRunByIdForOrganization = async () => ({ analysis_run_id: 42 });
  analysisRepository.saveProbabilityResult = async (input) => {
    saved = input;
    return { updated_at: '2026-10-07T00:00:00.000Z' };
  };
  analysisRepository.syncDependencyVersion = async () => {};
  operationalEvents.emit = async () => {};

  try {
    const provenance = {
      dataset: 'Backstage_Dataset_Probabilistico.csv',
      variable: 'pedestrian_flow_day',
      data_sources: ['Sintético'],
      source_count: 1,
    };
    const dataQuality = { sample_size: 800, missing_values: 0 };
    const result = await analysisService.saveProbabilityResult(
      42,
      {
        dataset_key: 'pedestrian_flow_day',
        selected_distribution: 'Pearson3',
        algorithm: 'backstage.probability.distribution_fit',
        algorithm_version: 'backstage-probability-fit-v1',
        data_mode: 'procedural',
        sample_size: 800,
        confidence_score: null,
        confidence_method: null,
        source_count: 1,
        missing_inputs: [],
        data_quality: dataQuality,
        provenance,
        observation_evaluation: { cdf: 0.4961302754, survival_probability: 0.5038697246, percentile: 49.613 },
      },
      { user_id: 9, organization_id: 3 },
      { organization_id: 3 }
    );

    assert.equal(result.probability_completed, true);
    assert.equal(saved.analysisRunId, 42);
    assert.equal(saved.organizationId, 3);
    assert.equal(saved.userId, 9);
    assert.equal(saved.probabilityResult.algorithm, 'backstage.probability.distribution_fit');
    assert.equal(saved.probabilityResult.algorithm_version, 'backstage-probability-fit-v1');
    assert.equal(saved.probabilityResult.data_mode, 'procedural');
    assert.equal(saved.probabilityResult.confidence_score, null);
    assert.deepEqual(saved.probabilityResult.data_quality, dataQuality);
    assert.deepEqual(saved.probabilityResult.provenance, provenance);
  } finally {
    Object.assign(analysisRepository, {
      getAnalysisRunByIdForOrganization: original.getAnalysisRunByIdForOrganization,
      saveProbabilityResult: original.saveProbabilityResult,
      syncDependencyVersion: original.syncDependencyVersion,
    });
    operationalEvents.emit = original.emit;
  }
});

test('probability persistence rejects unsupported data modes', async () => {
  const originalGet = analysisRepository.getAnalysisRunByIdForOrganization;
  analysisRepository.getAnalysisRunByIdForOrganization = async () => ({ analysis_run_id: 42 });
  try {
    await assert.rejects(
      analysisService.saveProbabilityResult(
        42,
        { dataset_key: 'x', selected_distribution: 'Normal', data_mode: 'demo' },
        { organization_id: 3 },
        { organization_id: 3 }
      ),
      (error) => error.statusCode === 400
    );
  } finally {
    analysisRepository.getAnalysisRunByIdForOrganization = originalGet;
  }
});