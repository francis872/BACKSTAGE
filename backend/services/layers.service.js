const layersRepository = require('../repositories/layers.repository');

async function listLayers(organizationId, role) {
  return layersRepository.listLayers(organizationId, role);
}

async function getLayerById(idOrSlug, organizationId, role) {
  return layersRepository.getLayerById(idOrSlug, organizationId, role);
}

async function getLayerFeatures(idOrSlug, query, organizationId, role) {
  const layer = await layersRepository.getLayerById(idOrSlug, organizationId, role);
  return layersRepository.getLayerFeatures(layer, {
    bbox: query.bbox,
    limit: query.limit,
    offset: query.offset,
  });
}

module.exports = {
  listLayers,
  getLayerById,
  getLayerFeatures,
};
