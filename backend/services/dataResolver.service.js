const ApiError = require('../utils/ApiError');
const analysisRepository = require('../repositories/analysis.repository');
const spatialIngestion = require('./spatialIngestion.service');

const METRIC_FIELDS = Object.freeze([
  'population_total_zone',
  'poi_count_1200m',
  'competitor_distance_m',
  'own_store_distance_m',
  'flood_risk',
  'landslide_risk',
  'crime_risk',
  'climate_exposure',
]);

function centerOf(territory) {
  if (territory?.geometry?.type === 'Point' && territory.geometry.coordinates?.length === 2) {
    return territory.geometry.coordinates.map(Number);
  }
  if (Array.isArray(territory?.bounds) && territory.bounds.length === 4) {
    const [west, south, east, north] = territory.bounds.map(Number);
    if ([west, south, east, north].every(Number.isFinite)) return [(west + east) / 2, (south + north) / 2];
  }
  return null;
}

function createDataResolver({
  resolveMetrics = analysisRepository.computeCandidateMetrics,
  resolveNearby = spatialIngestion.nearby,
} = {}) {
  return {
    async resolve({ organizationId, territory }) {
      if (!organizationId) throw new ApiError(401, 'Se requiere una organización activa para resolver datos.');
      const coordinates = centerOf(territory);
      const city = territory?.properties?.city || null;
      const missingInputs = [];
      const sources = new Map();

      if (territory?.provenance?.source) {
        sources.set(territory.provenance.source, territory.provenance);
      } else if (territory?.sourceId) {
        sources.set(String(territory.sourceId), {
          source: String(territory.sourceId),
          dataset: null,
          license: null,
          dataMode: null,
          updatedAt: null,
        });
      }

      if (!coordinates || !coordinates.every(Number.isFinite)) {
        return {
          status: 'insufficient_data',
          coordinates: null,
          metrics: {},
          spatial_context: [],
          sources: [...sources.values()],
          data_quality: { data_mode: 'insufficient_data', confidence: null, source_count: sources.size, missing_inputs: [...METRIC_FIELDS, 'coordinates'] },
          risk: { status: 'insufficient_data', missing_inputs: ['wildfire_components', 'flood_components', 'landslide_components'] },
        };
      }

      const [metricResult, spatialResult] = await Promise.allSettled([
        resolveMetrics({
          organizationId,
          city,
          latitude: coordinates[1],
          longitude: coordinates[0],
        }),
        resolveNearby(organizationId, {
          lng: coordinates[0], lat: coordinates[1], radiusM: 5000, worldId: 'earth', limit: 100,
        }),
      ]);

      const metrics = metricResult.status === 'fulfilled' && metricResult.value
        ? metricResult.value
        : {};
      for (const source of metrics.provenance?.sources || []) {
        const key = `${source.dataset}:${source.source}`;
        sources.set(key, {
          source: source.source,
          dataset: source.dataset,
          license: null,
          dataMode: metrics.provenance?.population_data_mode || null,
          updatedAt: source.updated_at,
        });
      }
      const spatialContext = spatialResult.status === 'fulfilled' && Array.isArray(spatialResult.value)
        ? spatialResult.value
        : [];
      for (const feature of spatialContext) {
        if (feature.sourceId) sources.set(String(feature.sourceId), {
          source: String(feature.sourceId),
          dataset: null,
          license: null,
          dataMode: null,
          updatedAt: null,
        });
      }

      for (const field of METRIC_FIELDS) {
        if (metrics[field] == null || !Number.isFinite(Number(metrics[field]))) missingInputs.push(field);
      }
      if (metricResult.status !== 'fulfilled') missingInputs.push('postgres_metrics');
      if (spatialResult.status !== 'fulfilled') missingInputs.push('atlas_spatial_context');

      const metricCount = METRIC_FIELDS.filter((field) => metrics[field] != null && Number.isFinite(Number(metrics[field]))).length;
      const hasEvidence = metricCount > 0 || spatialContext.length > 0;
      return {
        status: hasEvidence ? 'partial_data' : 'insufficient_data',
        coordinates,
        metrics,
        spatial_context: spatialContext,
        sources: [...sources.values()],
        data_quality: {
          data_mode: metricCount ? 'derived' : territory?.provenance?.dataMode || 'insufficient_data',
          confidence: null,
          source_count: sources.size,
          missing_inputs: missingInputs,
        },
        risk: {
          status: 'insufficient_data',
          missing_inputs: ['wildfire_components', 'flood_components', 'landslide_components'],
        },
      };
    },
  };
}

module.exports = { METRIC_FIELDS, centerOf, createDataResolver };