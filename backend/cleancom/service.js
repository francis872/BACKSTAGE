const ApiError = require('../utils/ApiError');
const { parseBbox } = require('../services/terrain.service');
const { geometryBounds, boundsIntersect } = require('../spatial/tiles');
const { validateFeatureCollection } = require('../spatial/ingestion');
const { ArtifactRepository } = require('./repository');

function integer(value, fallback, max, minimum = 0) {
  if (value === undefined) return fallback;
  if (String(value).trim() === '' || !Number.isSafeInteger(Number(value)) || Number(value) < minimum || Number(value) > max) throw new ApiError(400, 'Paginación inválida.');
  return Number(value);
}

function capabilities(audit) {
  const summary = audit.summary;
  return [
    { id: 'routes', label: 'Rutas', status: 'descriptive', evidence: 'Geometrías y códigos de rutas; no trayectorias efectivamente recorridas.' },
    { id: 'tickets', label: 'Tickets', status: summary.status === 'available' ? 'descriptive' : 'unavailable', evidence: 'Registros de la tabla base, fechas y calidad; no se suman tablas derivadas.' },
    { id: 'vehicles', label: 'Vehículos', status: 'descriptive', evidence: 'Identificadores distintos con tickets; capacidad y disponibilidad sin verificar.' },
    { id: 'territory', label: 'Distribución territorial', status: 'descriptive', evidence: 'Códigos de comuna y vínculos de ruta; los tickets no tienen ubicación propia.' },
    { id: 'geostatistics', label: 'Geoestadística', status: 'needs_validation', evidence: 'Requiere variable y unidad validadas, soporte espacial, vecindad y vigencia de las capas.' },
    { id: 'efficiency', label: 'Eficiencia logística', status: 'not_evaluable', evidence: summary.efficiency?.missing || ['Datos operativos y unidades verificadas'] },
  ];
}

class CleanComService {
  constructor(repository) { this.repository = repository; }

  async cases(organizationId) {
    const entries = await this.repository.allowedEntries(organizationId);
    return Promise.all(entries.map(async (entry) => {
      try {
        const audit = await this.repository.audit(organizationId, entry.id);
        return { id: entry.id, dataType: entry.dataType || 'UNKNOWN', operational: false, accessScope: entry.accessScope || 'organization', title: audit.case.title, provider: audit.case.provider, declaredYear: audit.case.declaredYear,
          version: audit.source.sha256, createdAt: audit.createdAt, layerCount: audit.layers.length, status: 'ready' };
      } catch (error) {
        if (error.statusCode !== 503) throw error;
        return { id: entry.id, dataType: entry.dataType || 'UNKNOWN', operational: false, status: 'audit_pending' };
      }
    }));
  }

  async audit(organizationId, caseId) {
    const audit = await this.repository.audit(organizationId, caseId);
    const entry = (await this.repository.allowedEntries(organizationId)).find((item) => item.id === caseId);
    return { ...audit, dataType: entry?.dataType || 'UNKNOWN', operational: false, capabilities: capabilities(audit), processingMode: 'versioned_offline_worker' };
  }

  async features(organizationId, caseId, layerId, query) {
    const limit = integer(query.limit, 200, 500, 1);
    const offset = integer(query.offset, 0, 10000);
    const bbox = query.bbox === undefined ? null : parseBbox(query.bbox);
    if (bbox && (String(query.bbox).split(',').some((value) => !value.trim()) || bbox[0] > bbox[2] || bbox[1] > bbox[3] || bbox[0] < -180 || bbox[2] > 180 || bbox[1] < -90 || bbox[3] > 90)) throw new ApiError(400, 'El área de consulta debe estar dentro de WGS84 y tener límites ordenados.');
    const { audit, layer, collection } = await this.repository.collection(organizationId, caseId, layerId);
    const matches = bbox ? collection.features.filter((feature) => boundsIntersect(feature.bbox || geometryBounds(feature.geometry), bbox)) : collection.features;
    let bytes = 0;
    const features = [];
    for (const feature of matches.slice(offset, offset + limit)) {
      bytes += Buffer.byteLength(JSON.stringify(feature));
      if (bytes > 2 * 1024 * 1024) break;
      features.push(feature);
    }
    if (!features.length && matches.length > offset) throw new ApiError(413, 'Una geometría supera el tamaño permitido para esta vista.');
    validateFeatureCollection({ type: 'FeatureCollection', features });
    const next = offset + features.length;
    const entry = (await this.repository.allowedEntries(organizationId)).find((item) => item.id === caseId);
    return { type: 'FeatureCollection', features, metadata: { caseId, layerId, dataType: entry?.dataType || 'UNKNOWN', operational: false, version: audit.source.sha256,
      sourceRecords: layer.recordCount, previewRecords: layer.preview.count, matchingPreviewRecords: matches.length,
      returned: features.length, offset, nextOffset: next < matches.length ? next : null,
      preview: layer.preview, crs: layer.crs, boundsWgs84: layer.boundsWgs84,
      periodHint: layer.periodHint, dataMode: 'source_geometry_reprojected', sourceDate: null, auditCreatedAt: audit.createdAt } };
  }
}

module.exports = { CleanComService, capabilities, service: new CleanComService(new ArtifactRepository()) };
