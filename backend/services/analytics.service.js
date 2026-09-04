const ApiError = require('../utils/ApiError');
const analyticsJobsRepository = require('../repositories/analyticsJobs.repository');
const { getAlgorithm, listAlgorithms } = require('../infrastructure/analytics/algorithmRegistry');

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
  const algorithm = getAlgorithm(algorithmName);
  const organizationId = organization?.organization_id || sessionUser?.organization_id || null;

  const job = await analyticsJobsRepository.createJob({
    organizationId,
    requestedByUserId: sessionUser?.user_id || null,
    algorithmName,
    algorithmVersion: algorithm.version,
    params,
    context: context || {},
  });

  const startedAt = Date.now();
  try {
    const result = algorithm.run(params || {});
    const durationMs = Date.now() - startedAt;
    await analyticsJobsRepository.completeJob(job.analytics_job_id, { result, durationMs });
    return {
      analytics_job_id: job.analytics_job_id,
      algorithm: algorithmName,
      version: algorithm.version,
      status: 'succeeded',
      duration_ms: durationMs,
      result,
    };
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    await analyticsJobsRepository.failJob(job.analytics_job_id, { error: error.message, durationMs });
    throw new ApiError(400, `Error ejecutando "${algorithmName}": ${error.message}`);
  }
}

async function getJob(jobId, organizationId) {
  const job = await analyticsJobsRepository.getJobById(jobId, organizationId);
  if (!job) throw new ApiError(404, 'Ejecución analítica no encontrada.');
  return job;
}

async function listJobs(organizationId, { algorithmName, limit } = {}) {
  if (!organizationId) throw new ApiError(403, 'No hay organización activa.');
  return analyticsJobsRepository.listJobs({ organizationId, algorithmName, limit });
}

module.exports = {
  executeAlgorithm,
  getJob,
  listJobs,
  listAlgorithms,
};
