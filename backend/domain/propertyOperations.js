const C = require('./horizontalProperty');
const text = (label, options = {}) => ({ type: 'text', label, ...options });
const date = (label, options = {}) => ({ type: 'datetime', label, ...options });
const amount = { type: 'integer', label: 'Importe en unidades monetarias mínimas', min: 1, max: 9000000000000 };
const currency = { type: 'currency', label: 'Moneda (código de tres letras)' };
const scale = { type: 'integer', label: 'Decimales de la moneda', min: 0, max: 4 };
const source = text('Fuente y referencia del registro', { max: 500 });
const fields = data => ({ ...data, source_name: source });
const TYPES = {
  pqrs: { label: 'PQRS', initial: 'open', roles: ['admin', 'analyst', 'viewer'], fields: fields({ title: text('Asunto'), category: { type: 'choice', label: 'Tipo', values: ['petition', 'complaint', 'claim', 'suggestion'] }, description: text('Descripción', { max: 8000 }), due_at: date('Fecha de respuesta acordada', { optional: true }) }), transitions: { open: ['in_review', 'cancelled'], in_review: ['responded', 'cancelled'], responded: ['closed', 'in_review'], closed: [], cancelled: [] } },
  reservation: { label: 'Reserva exclusiva', initial: 'requested', roles: ['admin', 'analyst', 'viewer'], kinds: ['common_area', 'parking', 'equipment', 'maintenance_area'], fields: fields({ title: text('Motivo de la reserva'), starts_at: date('Inicio'), ends_at: date('Fin') }), transitions: { requested: ['confirmed', 'cancelled'], confirmed: ['completed', 'cancelled'], completed: [], cancelled: [] } },
  gate_entry: { label: 'Registro de portería', initial: 'expected', roles: ['admin', 'analyst'], fields: fields({ visitor_name: text('Nombre de la persona visitante'), reason: text('Motivo de la visita', { max: 1000 }), host_user_id: { type: 'member', label: 'Identificador del anfitrión', optional: true } }), transitions: { expected: ['arrived', 'cancelled'], arrived: ['departed'], departed: [], cancelled: [] } },
  assembly: { label: 'Asamblea: agenda y acta', initial: 'scheduled', roles: ['admin'], kinds: ['coproperty'], fields: fields({ title: text('Nombre de la asamblea'), starts_at: date('Inicio'), agenda: text('Orden del día', { max: 8000 }) }), transitions: { scheduled: ['open', 'cancelled'], open: ['closed'], closed: [], cancelled: [] } },
  task: { label: 'Tarea administrativa o de mantenimiento', initial: 'open', roles: ['admin', 'analyst'], fields: fields({ title: text('Trabajo por realizar'), description: text('Descripción', { max: 8000 }), due_at: date('Fecha prevista', { optional: true }), assignee_user_id: { type: 'member', label: 'Identificador del responsable', optional: true } }), transitions: { open: ['in_progress', 'cancelled'], in_progress: ['completed', 'cancelled'], completed: [], cancelled: [] } },
  charge: { label: 'Cuenta por cobrar', initial: 'posted', roles: ['admin'], kinds: ['private_unit'], financial: true, fields: fields({ title: text('Concepto'), amount_minor: amount, currency, scale, issued_at: date('Fecha de emisión'), due_at: date('Fecha de vencimiento') }), transitions: { posted: ['voided'], voided: [] } },
  payment: { label: 'Pago registrado manualmente', initial: 'posted', roles: ['admin'], kinds: ['private_unit'], financial: true, fields: fields({ charge_id: { type: 'reference', label: 'Cuenta por cobrar vinculada' }, amount_minor: amount, reference: text('Comprobante o referencia del pago', { max: 500 }) }), transitions: { posted: ['voided'], voided: [] } },
  budget: { label: 'Presupuesto de operación', initial: 'planned', roles: ['admin'], financial: true, fields: fields({ title: text('Concepto del presupuesto'), amount_minor: amount, currency, scale, starts_at: date('Inicio del periodo'), ends_at: date('Fin del periodo') }), transitions: { planned: ['approved', 'voided'], approved: ['voided'], voided: [] } },
  expense: { label: 'Egreso registrado manualmente', initial: 'posted', roles: ['admin'], financial: true, fields: fields({ title: text('Concepto del egreso'), amount_minor: amount, currency, scale, paid_at: date('Fecha declarada del egreso'), reference: text('Comprobante o referencia', { max: 500 }) }), transitions: { posted: ['voided'], voided: [] } },
};
function timestamp(value, label) {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) C.fail(`${label}: indica fecha, hora y zona horaria.`);
  return new Date(value).toISOString();
}
function integer(value, spec) {
  if (!['string', 'number'].includes(typeof value) || !/^(0|[1-9][0-9]*)$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < (spec.min ?? 1) || Number(value) > (spec.max ?? Number.MAX_SAFE_INTEGER)) C.fail(`${spec.label}: entero fuera de rango.`);
  return Number(value);
}
function values(type, input) {
  const spec = TYPES[type]; if (!spec) C.fail('Operación no reconocida.');
  C.object(input, Object.keys(spec.fields)); const data = {};
  for (const [key, field] of Object.entries(spec.fields)) {
    const value = input[key]; if (field.optional && (value == null || value === '')) continue;
    if (field.type === 'datetime') data[key] = timestamp(value, field.label);
    else if (['integer', 'reference', 'member'].includes(field.type)) data[key] = integer(value, field);
    else if (field.type === 'currency') { if (typeof value !== 'string' || !/^[A-Z]{3}$/.test(value)) C.fail('Indica un código de moneda de tres letras.'); data[key] = value; }
    else if (field.type === 'choice') { if (!field.values.includes(value)) C.fail(`${field.label}: valor no permitido.`); data[key] = value; }
    else { if (typeof value !== 'string' || !value.trim() || value.length > (field.max || 200)) C.fail(`${field.label}: texto requerido, máximo ${field.max || 200} caracteres.`); data[key] = value.trim(); }
  }
  if (data.starts_at && data.ends_at && data.starts_at >= data.ends_at) C.fail('El fin debe ser posterior al inicio.');
  if (data.issued_at && data.due_at < data.issued_at) C.fail('El vencimiento no puede ser anterior a la emisión.');
  return data;
}
function catalog(kind, role) { return Object.fromEntries(Object.entries(TYPES).filter(([, s]) => (!s.kinds || s.kinds.includes(kind)) && s.roles.includes(role)).map(([key, spec]) => [key, { ...spec, confidential: true }])); }
module.exports = { TYPES, values, timestamp, integer, catalog };
