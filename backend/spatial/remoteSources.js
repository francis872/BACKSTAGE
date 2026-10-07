const ALLOWED_HOSTS = new Set(['www.datos.gov.co', 'datos.gov.co', 'mapas2.igac.gov.co']);

function validateRemoteUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new TypeError('sourceUrl no es una URL válida.'); }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname)) {
    throw new TypeError('La fuente remota debe usar HTTPS y pertenecer a un dominio autorizado.');
  }
  if (url.username || url.password) throw new TypeError('La URL no puede incluir credenciales.');
  return url;
}

async function fetchGeoJSON(sourceUrl, { maxBytes = 10 * 1024 * 1024, timeoutMs = 20000 } = {}) {
  const url = validateRemoteUrl(sourceUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'error', headers: { Accept: 'application/geo+json, application/json' } });
    if (!response.ok) throw new Error(`La fuente respondió HTTP ${response.status}.`);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > maxBytes) throw new RangeError(`La fuente supera el límite de ${maxBytes} bytes.`);
    const chunks = []; let total = 0;
    for await (const chunk of response.body) {
      total += chunk.length;
      if (total > maxBytes) throw new RangeError(`La fuente supera el límite de ${maxBytes} bytes.`);
      chunks.push(chunk);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } finally { clearTimeout(timeout); }
}

module.exports = { ALLOWED_HOSTS, validateRemoteUrl, fetchGeoJSON };
