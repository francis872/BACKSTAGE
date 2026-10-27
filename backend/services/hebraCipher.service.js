// Cryptographic primitive for existing records. This is not a Vault replacement.
const crypto = require('node:crypto');
const ApiError = require('../utils/ApiError');
const { canonicalJson: canonical } = require('./intelligenceContract.service');
const digest = value => crypto.createHash('sha256').update(canonical(value)).digest('hex');
function createHebraCipher(env = process.env) {
  function keys() {
    try {
      const values = JSON.parse(env.HEBRA_ENCRYPTION_KEYS || '{}'), active = env.HEBRA_ACTIVE_KEY_ID;
      if (!active || !/^[a-zA-Z0-9_-]{1,40}$/.test(active) || !Object.hasOwn(values, active)) throw Error();
      const ring = Object.fromEntries(Object.entries(values).map(([id, encoded]) => {
        if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id) || typeof encoded !== 'string') throw Error();
        const key = Buffer.from(encoded, 'base64'); if (key.length !== 32 || key.toString('base64') !== encoded) throw Error(); return [id, key];
      }));
      return { active, ring };
    } catch { throw new ApiError(503, 'La protección cifrada de datos no está configurada. Contacta al administrador.'); }
  }
  function encrypt(key, value, aad) {
    const nonce = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(canonical(aad)));
    return { nonce: nonce.toString('base64'), ciphertext: Buffer.concat([cipher.update(value), cipher.final()]).toString('base64'), tag: cipher.getAuthTag().toString('base64') };
  }
  function decrypt(key, sealed, aad) {
    const cipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.nonce, 'base64'));
    cipher.setAAD(Buffer.from(canonical(aad))); cipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    return Buffer.concat([cipher.update(Buffer.from(sealed.ciphertext, 'base64')), cipher.final()]);
  }
  function seal(payload, binding) {
    const { active, ring } = keys(), key = crypto.randomBytes(32);
    try {
      const text = canonical(payload); if (Buffer.byteLength(text) > 100000) throw new ApiError(413, 'El registro excede el límite de tamaño.');
      const envelope = { version: 1, algorithm: 'AES-256-GCM', key_id: active, data: encrypt(key, Buffer.from(text), binding), wrapped_key: encrypt(ring[active], key, { ...binding, purpose: 'hebra-data-key' }) };
      return { envelope, commitment: digest(envelope) };
    } finally { key.fill(0); }
  }
  function open(envelope, commitment, binding) {
    const { ring } = keys();
    if (!Object.hasOwn(ring, envelope?.key_id)) throw new ApiError(503, 'No está disponible la clave histórica del registro.');
    try {
      if (envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM' || digest(envelope) !== commitment) throw Error();
      const key = decrypt(ring[envelope.key_id], envelope.wrapped_key, { ...binding, purpose: 'hebra-data-key' });
      try { return JSON.parse(decrypt(key, envelope.data, binding).toString('utf8')); } finally { key.fill(0); }
    } catch { throw new ApiError(409, 'No se pudo comprobar la integridad del contenido cifrado.'); }
  }
  return { seal, open, configured: () => { try { keys(); return true; } catch { return false; } } };
}
module.exports = { createHebraCipher, digest, canonical };
