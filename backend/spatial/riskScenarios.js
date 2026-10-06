const { evaluateRisk } = require('./riskModels');

function clamp(value) { return Math.max(0, Math.min(1, Number(value))); }

function applyScenario(inputs, changes = {}) {
  return Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, clamp(Number(value) + Number(changes[key] || 0))]));
}

function evaluateScenario(input = {}) {
  if (!Array.isArray(input.cells) || input.cells.length === 0 || input.cells.length > 2500) {
    throw new TypeError('cells debe contener entre 1 y 2500 celdas.');
  }
  const hazard = input.hazard;
  if (!['wildfire', 'flood', 'landslide'].includes(hazard)) throw new TypeError('hazard no es válido.');
  const features = input.cells.map((cell, index) => {
    if (!cell?.geometry?.type || !cell.inputs) throw new TypeError(`Celda ${index} requiere geometry e inputs.`);
    const base = evaluateRisk({ [hazard]: cell.inputs, dataMode: input.dataMode || 'derived', confidence: input.confidence }).hazards[hazard];
    const scenarioInputs = applyScenario(cell.inputs, input.changes);
    const scenario = evaluateRisk({ [hazard]: scenarioInputs, dataMode: input.dataMode || 'derived', confidence: input.confidence }).hazards[hazard];
    return {
      type: 'Feature', id: cell.id || `cell-${index}`, geometry: cell.geometry,
      properties: {
        hazard, baseScore: base.score, scenarioScore: scenario.score, delta: scenario.score - base.score,
        baseClassification: base.classification, scenarioClassification: scenario.classification,
      },
    };
  });
  const mean = (field) => features.reduce((sum, feature) => sum + feature.properties[field], 0) / features.length;
  return {
    type: 'FeatureCollection', features,
    metadata: {
      modelVersion: 'backstage-risk-scenario-v1', hazard, dataMode: input.dataMode || 'derived', confidence: input.confidence ?? null,
      baseMean: mean('baseScore'), scenarioMean: mean('scenarioScore'), deltaMean: mean('delta'), changes: input.changes || {},
      advisory: 'Escenario comparativo, no pronóstico. La calidad depende de las entradas de cada celda.',
    },
  };
}

module.exports = { applyScenario, evaluateScenario };
