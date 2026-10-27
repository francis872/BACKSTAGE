const ApiError = require('../utils/ApiError');
const analyticsJobsRepository = require('../repositories/analyticsJobs.repository');
const { getAlgorithm, listAlgorithms } = require('../infrastructure/analytics/algorithmRegistry');
const evidence = require('./analyticsEvidence.service');
const analysisRepository = require('../repositories/analysis.repository');
const spatialEvidence = require('./spatialEvidence.service');

const MAX_PARAMS_BYTES = 200_000; // guard against oversized/abusive payloads

function assertPayloadSize(params) {
  const size = Buffer.byteLength(JSON.stringify(params || {}), 'utf8');
  if (size > MAX_PARAMS_BYTES) {
    throw new ApiError(413, `Los parámetros del análisis exceden el límite permitido (${MAX_PARAMS_BYTES} bytes).`);
  }
}

/**
 * Executes a registered algorithm and records the execution as an
 * analytics_jobs row (queued -> running -> succeeded/failed) with
 * requester, organization, parameters, algorithm version, duration and
 * result — so every number the UI shows can be traced back to a
 * reproducible run instead of being a hardcoded constant.
 *
 * Runs synchronously within the request (the current deployment target
 * is serverless and has no long-lived worker process); the job record
 * still gives full traceability and is the seam where a real background
 * worker could be plugged in later without changing callers.
 */
async function executeAlgorithm(algorithmName, params, { sessionUser, organization, context } = {}) {
  assertPayloadSize(params);
  let algorithm;
  try { algorithm = spatialEvidence.supported(algorithmName) ? { version: spatialEvidence.VERSION } : getAlgorithm(algorithmName); } catch (error) { throw new ApiError(400, error.message); }
  const organizationId = organization?.organization_id || sessionUser?.organization_id || null;
  if (!organizationId) throw new ApiError(403, 'No hay organización activa.');
  const contract = spatialEvidence.supported(algorithmName) ? spatialEvidence : evidence;
  const traced = contract.supported(algorithmName);
  let input = params || {}, version = algorithm.version;
  if (traced) {
    try { input = await contract.canonicalInput(algorithmName, input); } catch (error) { throw new ApiError(error.statusCode || 400, error.message); }
    version = contract.versionFor(algorithmName);
  }
  let projectId = null;
  if (traced && params?.analysis_run_id != null) {
    projectId = Number(params.analysis_run_id);
    if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new ApiError(400, 'Proyecto inválido.');
    if (!await analysisRepository.getAnalysisRunByIdForOrganization(projectId, organizationId)) throw new ApiError(404, 'Proyecto no encontrado.');
  }

  const job = await analyticsJobsRepository.createJob({
    organizationId,
    requestedByUserId: sessionUser?.user_id || null,
    algorithmName,
    algorithmVersion: version,
    params: input,
    context: { ...context, ...(projectId ? { analysis_run_id: projectId } : {}) },
  });

  const startedAt = Date.now();
  try {
    const result = traced ? await contract.run(algorithmName, input) : await algorithm.run(input);
    const analysis = traced ? await contract.build(algorithmName, input, result) : null;
    const durationMs = Date.now() - startedAt;
    await analyticsJobsRepository.completeJob(job.analytics_job_id, { result, durationMs, analysis, organizationId, userId: sessionUser?.user_id || null, projectId });
    return {
      analytics_job_id: job.analytics_job_id,
      algorithm: algorithmName,
      version,
      status: 'succeeded',
      duration_ms: durationMs,
      result,
      ...(analysis ? { analysis } : {}),
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    await analyticsJobsRepository.failJob(job.analytics_job_id, { error: error.message, durationMs });
    throw new ApiError(error.statusCode || 400, `Error ejecutando "${algorithmName}": ${error.message}`);
  }
}

async function getJob(jobId, organizationId) {
  const job = await analyticsJobsRepository.getJobById(jobId, organizationId);
  if (!job) throw new ApiError(404, 'Ejecución analítica no encontrada.');
  return job;
}

async function listJobs(organizationId, { algorithmName, limit, projectId } = {}) {
  if (!organizationId) throw new ApiError(403, 'No hay organización activa.');
  if (projectId != null && (!Number.isSafeInteger(Number(projectId)) || Number(projectId) <= 0)) throw new ApiError(400, 'Proyecto inválido.');
  if (projectId != null && !await analysisRepository.getAnalysisRunByIdForOrganization(Number(projectId), organizationId)) throw new ApiError(404, 'Proyecto no encontrado.');
  return analyticsJobsRepository.listJobs({ organizationId, algorithmName, limit, projectId });
}

const verification = job => spatialEvidence.supported(job.algorithm_name) ? spatialEvidence.verify(job) : evidence.verify(job);
async function verifyJob(id, organizationId) { return verification(await getJob(id, organizationId)); }
async function exportJob(id, organizationId) { const snapshot = await getJob(id, organizationId); return { format: 'backstage-analytics-export-1', snapshot, verification: await verification(snapshot) }; }

module.exports = {
  executeAlgorithm,
  getJob,
  listJobs,
  listAlgorithms: () => [...listAlgorithms().map(a => evidence.supported(a.name) ? { ...a, version: evidence.versionFor(a.name) } : a), ...['gis.distance_matrix', 'gis.point_in_polygon'].map(name => ({ name, category: 'gis', version: spatialEvidence.VERSION }))],
  verifyJob,
  exportJob,
};
