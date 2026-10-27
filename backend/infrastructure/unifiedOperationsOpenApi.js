const { TYPES } = require('../domain/propertyOperations');
const id = { name: 'id', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };
const record = { name: 'record', in: 'path', required: true, schema: { type: 'integer', minimum: 1 } };
const json = schema => ({ 'application/json': { schema } });
const body = schema => ({ required: true, content: json(schema) });
const responses = { 200: { description: 'Respuesta autorizada' }, 400: { description: 'Datos inválidos' }, 401: { description: 'Sesión o desafío inválido' }, 403: { description: 'Permiso insuficiente o factor incorrecto' }, 404: { description: 'Objeto propio no disponible' }, 409: { description: 'Conflicto de estado, revisión, contenido o integridad' }, 410: { description: 'Contenido personal eliminado' }, 429: { description: 'Límite de solicitudes' }, 503: { description: 'Protección de claves o persistencia no disponible' } };
const command = { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', pattern: '^[A-Za-z0-9_-]{16,128}$' } };
const base = '/assets/layers/horizontal-property/{id}/operations';
const paths = {
  [base]: { parameters: [id], get: { summary: 'Operaciones del objeto seleccionado, catálogo por rol y estado del cifrado; sin cuerpos privados en el listado', responses } },
  [base + '/history']: { parameters: [id], get: { summary: 'Historial por objeto con huellas comprobadas; vista de consulta limitada a acciones propias', responses } },
  [base + '/economics']: { parameters: [id], get: { summary: 'Saldos y presupuesto del libro registrado; sin sumar monedas ni afirmar conciliación bancaria', responses } },
  [base + '/records/{record}']: { parameters: [id, record], get: { summary: 'Contenido descifrado según rol/autor, con consulta auditada', responses } },
  [base + '/records/{record}/transition']: { parameters: [id, record], post: { summary: 'Transición versionada e idempotente, con revisión y reglas por tipo', parameters: [command], requestBody: body({ type: 'object', additionalProperties: false, required: ['revision', 'status'], properties: { revision: { type: 'integer', minimum: 1 }, status: { type: 'string' }, note: { type: 'string', maxLength: 8000 }, response: { type: 'string', maxLength: 16000 }, minutes: { type: 'string', maxLength: 16000 } } }), responses } },
  [base + '/records/{record}/erase-content']: { parameters: [id, record], post: { summary: 'Admin: retirar cuerpos cifrados de versiones de una operación personal cerrada; conserva referencias y no borra backups', requestBody: body({ type: 'object', additionalProperties: false, required: ['revision', 'reason_code'], properties: { revision: { type: 'integer', minimum: 1 }, reason_code: { enum: ['user_request', 'retention_expired', 'administrative_correction'] } } }), responses } },
};
for (const [type, spec] of Object.entries(TYPES)) {
  const properties = Object.fromEntries(Object.entries(spec.fields).map(([name, field]) => [name, field.type === 'choice' ? { type: 'string', enum: field.values } : field.type === 'datetime' ? { type: 'string', format: 'date-time' } : ['integer', 'reference', 'member'].includes(field.type) ? { type: ['integer', 'string'], description: field.label } : { type: 'string', description: field.label, maxLength: field.max || 500 }]));
  paths[base + '/' + type] = { parameters: [id], post: { summary: spec.label, description: 'Cuerpo cifrado; requiere configuración real de claves. Los datos aportados conservan su naturaleza declarada.', parameters: [command], requestBody: body({ type: 'object', additionalProperties: false, required: Object.keys(spec.fields).filter(k => !spec.fields[k].optional), properties }), responses: { ...responses, 201: { description: 'Operación registrada' } } } };
}
const password = { type: 'string', maxLength: 72, writeOnly: true }, code = { type: 'string', maxLength: 32, writeOnly: true };
for (const [action, schema, summary] of [
  ['setup', { current_password: password }, 'Iniciar TOTP tras confirmar contraseña; secreto cifrado con vencimiento'],
  ['confirm', { code }, 'Activar con código TOTP; renueva sesión y muestra códigos de recuperación una sola vez'],
  ['disable', { current_password: password, code }, 'Desactivar con contraseña y factor; renueva sesión y cierra los otros accesos'],
  ['verify-login', { challenge: { type: 'string', minLength: 43, maxLength: 43 }, code }, 'Completar desafío opaco; no acepta el desafío como sesión; factor de un solo uso'],
]) paths['/auth/mfa/' + action] = { post: { summary, ...(action === 'verify-login' ? { security: [] } : {}), requestBody: body({ type: 'object', additionalProperties: false, required: Object.keys(schema), properties: schema }), responses } };
paths['/auth/mfa/status'] = { get: { summary: 'Estado de Backstage Identity MFA; no devuelve claves ni códigos', responses } };
module.exports = { paths };
