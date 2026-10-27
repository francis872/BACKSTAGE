const ApiError = require('../utils/ApiError');
const { geometry: validateGeometry } = require('./geometry');
const fail = (message, status = 400) => { throw new ApiError(status, message); };
const STRUCTURES = ['coproperty', 'residential_complex', 'building', 'tower', 'block'];
const KINDS = Object.freeze({
  coproperty: { label: 'Copropiedad', parents: [] },
  residential_complex: { label: 'Conjunto residencial', parents: ['coproperty'] },
  building: { label: 'Edificio', parents: ['coproperty', 'residential_complex', 'block'] },
  tower: { label: 'Torre', parents: ['coproperty', 'residential_complex', 'building', 'block'] },
  block: { label: 'Bloque', parents: ['coproperty', 'residential_complex'] },
  private_unit: { label: 'Unidad privada', parents: STRUCTURES },
  common_area: { label: 'Zona común', parents: STRUCTURES },
  parking: { label: 'Parqueadero', parents: [...STRUCTURES, 'common_area'] },
  technical_infrastructure: { label: 'Infraestructura técnica', parents: [...STRUCTURES, 'common_area'] },
  equipment: { label: 'Equipamiento', parents: [...STRUCTURES, 'common_area'] },
  waste_collection: { label: 'Punto de recolección de residuos', parents: [...STRUCTURES, 'common_area'] },
  access: { label: 'Acceso', parents: [...STRUCTURES, 'common_area'] },
  maintenance_area: { label: 'Área de mantenimiento', parents: [...STRUCTURES, 'common_area'] },
});
function identifier(value) {
  if (!['string', 'number'].includes(typeof value) || !/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail('Identificador inválido.');
  return Number(value);
}
function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('Campos de Propiedad Horizontal no admitidos.');
}
function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail(`${label}: escribe entre 1 y ${max} caracteres.`);
  return value.trim();
}
function coefficient(value) {
  if (value == null || value === '') return null;
  if (!['string', 'number'].includes(typeof value) || !/^(?:100(?:\.0{1,4})?|(?:0|[1-9][0-9]?)(?:\.[0-9]{1,4})?)$/.test(String(value))) fail('El coeficiente debe estar entre 0 y 100%, con hasta cuatro decimales.');
  const [whole, fraction = ''] = String(value).split('.');
  return Number(whole) * 10000 + Number(fraction.padEnd(4, '0'));
}
function values(input, { create = false, current } = {}) {
  object(input, create ? ['name', 'kind', 'parent_id', 'geometry', 'crs', 'coefficient_pct', 'source_name'] : ['revision', 'name', 'geometry', 'crs', 'coefficient_pct', 'source_name']);
  const kind = create ? input.kind : current.kind;
  if (!Object.hasOwn(KINDS, kind)) fail('Selecciona un tipo de entidad territorial válido.');
  if (create && kind !== 'coproperty' && input.parent_id == null) fail('Selecciona la entidad que contiene este elemento.');
  if (create && kind === 'coproperty' && input.parent_id != null) fail('La copropiedad es la raíz de la jerarquía.');
  if (input.crs != null && input.crs !== 'EPSG:4326') fail('La geometría debe estar expresada en EPSG:4326.');
  const coefficientUnits = create || Object.hasOwn(input, 'coefficient_pct') ? coefficient(input.coefficient_pct) : current.coefficient_units;
  if (kind !== 'private_unit' && coefficientUnits != null) fail('El coeficiente inicial corresponde únicamente a unidades privadas.');
  const geom = Object.hasOwn(input, 'geometry') ? input.geometry == null ? null : validateGeometry(input.geometry) : current?.geometry || null;
  if (geom && Object.hasOwn(input, 'geometry') && !input.source_name) fail('Indica la fuente de la geometría aportada.');
  return { kind, name: input.name == null && !create ? current.name : text(input.name, 'Nombre'), geometry: geom,
    parent_id: create && input.parent_id != null ? identifier(input.parent_id) : current?.parent_id ?? null,
    coefficient_units: coefficientUnits, source_name: input.source_name == null && !create ? current.source_name : text(input.source_name, 'Fuente', 300) };
}
function requestKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,128}$/.test(value)) fail('Se requiere una clave idempotente de 16 a 128 caracteres.');
  return value;
}
module.exports = { KINDS, VERSION: 1, TOTAL_UNITS: 1000000, fail, identifier, object, coefficient, values, requestKey };
