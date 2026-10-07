const COMPONENT_TYPES = ['threat', 'exposure', 'vulnerability'];
const LEGACY_TYPES = { flood: 'threat', crime: 'threat', climate: 'threat', hazard: 'threat' };

function canonicalComponentType(value) {
  const type = String(value || '').trim().toLowerCase();
  return LEGACY_TYPES[type] || type;
}

function normalizeRiskComponent(data = {}) {
  const riskId = Number(data.risk_id);
  if (!Number.isInteger(riskId) || riskId <= 0) throw new TypeError('risk_id debe ser un entero positivo.');
  const componentType = canonicalComponentType(data.component_type);
  if (!COMPONENT_TYPES.includes(componentType)) throw new TypeError('component_type debe ser threat, exposure o vulnerability.');
  const componentScore = Number(data.component_score);
  if (!Number.isFinite(componentScore) || componentScore < 0 || componentScore > 1) throw new TypeError('component_score debe estar entre 0 y 1.');
  const notes = String(data.notes || '').trim();
  if (notes.length > 2000) throw new TypeError('notes no puede superar 2000 caracteres.');
  return { risk_id: riskId, component_type: componentType, component_score: componentScore, notes: notes || null };
}

module.exports = { COMPONENT_TYPES, canonicalComponentType, normalizeRiskComponent };
