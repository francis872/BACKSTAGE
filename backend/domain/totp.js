// RFC 4226 dynamic truncation and RFC 6238 time steps, using Node's HMAC.
const crypto = require('node:crypto');
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function encode(bytes) { let bits = 0, value = 0, result = ''; for (const byte of bytes) { value = value << 8 | byte; bits += 8; while (bits >= 5) { result += alphabet[value >>> (bits - 5) & 31]; bits -= 5; } } if (bits) result += alphabet[value << (5 - bits) & 31]; return result; }
function decode(secret) { if (typeof secret !== 'string' || !/^[A-Z2-7]{16,128}$/.test(secret)) throw Error('Invalid TOTP secret'); let bits = 0, value = 0; const result = []; for (const c of secret) { value = value << 5 | alphabet.indexOf(c); bits += 5; if (bits >= 8) { result.push(value >>> (bits - 8) & 255); bits -= 8; } } return Buffer.from(result); }
function hotp(secret, counter, digits = 6, algorithm = 'sha1') {
  if (!Number.isSafeInteger(counter) || counter < 0 || ![6, 8].includes(digits) || !['sha1', 'sha256', 'sha512'].includes(algorithm)) throw Error('Invalid TOTP parameters');
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(BigInt(counter)); const h = crypto.createHmac(algorithm, decode(secret)).update(bytes).digest(); const offset = h.at(-1) & 15;
  return String((h.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits).padStart(digits, '0');
}
function matchedStep(secret, code, now, lastStep = -1) {
  if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) return null;
  const step = Math.floor(now / 30000); for (const candidate of [step, step - 1, step + 1]) if (candidate >= 0 && candidate > lastStep && crypto.timingSafeEqual(Buffer.from(hotp(secret, candidate)), Buffer.from(code))) return candidate;
  return null;
}
module.exports = { encode, hotp, matchedStep };
