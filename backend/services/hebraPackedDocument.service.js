// Bounded compression/chunking around the existing authenticated Hebra primitive.
const zlib = require('node:zlib');
const { createHebraCipher, digest, canonical } = require('./hebraCipher.service');
const ApiError = require('../utils/ApiError');
const MAX_BYTES = 1000000, CHUNK = 48000;
function createPackedDocument(cipher = createHebraCipher()) {
  function seal(value, binding) {
    const bytes = Buffer.from(canonical(value)); if (bytes.length > MAX_BYTES) throw new ApiError(413, 'La evidencia económica supera 1 MB; reduce el conjunto.');
    const compressed = zlib.gzipSync(bytes), count = Math.ceil(compressed.length / CHUNK), parts = [];
    for (let i = 0; i < count; i++) parts.push(cipher.seal({ data: compressed.subarray(i * CHUNK, (i + 1) * CHUNK).toString('base64') }, { ...binding, purpose: 'hebra-packed-json-v1', part: i, count }));
    const packet = { version: 1, parts };
    return { packet, commitment: digest(packet) };
  }
  function open(packet, commitment, binding) {
    if (packet?.version !== 1 || !Array.isArray(packet.parts) || !packet.parts.length || packet.parts.length > 24 || digest(packet) !== commitment) throw new ApiError(409, 'La evidencia cifrada no conserva su integridad.');
    try {
      const chunks = packet.parts.map((part, i) => {
        const { data } = cipher.open(part.envelope, part.commitment, { ...binding, purpose: 'hebra-packed-json-v1', part: i, count: packet.parts.length });
        if (typeof data !== 'string' || data.length > 64000) throw Error(); const value = Buffer.from(data, 'base64'); if (value.toString('base64') !== data || value.length > CHUNK) throw Error(); return value;
      });
      return JSON.parse(zlib.gunzipSync(Buffer.concat(chunks), { maxOutputLength: MAX_BYTES }).toString('utf8'));
    } catch (e) { if (e.statusCode === 503) throw e; throw new ApiError(409, 'No se pudo verificar el documento económico cifrado.'); }
  }
  return { seal, open, configured: cipher.configured };
}
module.exports = { createPackedDocument };
