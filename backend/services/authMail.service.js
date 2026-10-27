const ApiError = require('../utils/ApiError');
function createAuthMailer({ apiKey = process.env.RESEND_API_KEY, from = process.env.AUTH_EMAIL_FROM, appUrl = process.env.AUTH_PUBLIC_APP_URL, fetchImpl = globalThis.fetch } = {}) {
  let origin = null;
  try {
    const url = new URL(appUrl);
    if (url.protocol === 'https:' && !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash) origin = url.origin;
  } catch {}
  const configured = () => Boolean(apiKey && typeof from === 'string' && from.length <= 254 && !/[\r\n]/.test(from) && origin);
  async function send({ to, purpose, token, actionId }) {
    if (!configured()) throw new ApiError(503, 'El envío de correos de acceso todavía no está configurado.');
    const reset = purpose === 'reset';
    const url = `${origin}/${reset ? 'reset-password' : 'verify-email'}#token=${encodeURIComponent(token)}`;
    try {
      const result = await fetchImpl('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000), headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': actionId }, body: JSON.stringify({ from, to: [to], subject: reset ? 'Restablece tu contraseña de BACKSTAGE' : 'Verifica tu correo de BACKSTAGE', text: `BACKSTAGE\n\n${reset ? 'Para elegir una nueva contraseña' : 'Para verificar tu correo'}, abre este enlace:\n${url}\n\nEl enlace vence en 30 minutos y solo puede usarse una vez. Si no lo solicitaste, ignora este mensaje. Tu contraseña no cambia al solicitar el enlace.` }) });
      if (!result.ok) throw Error('provider_rejected');
      const data = await result.json();
      if (typeof data.id !== 'string') throw Error('provider_invalid');
      return { accepted: true };
    } catch { throw new ApiError(503, 'El proveedor de correo no pudo aceptar el envío.'); }
  }
  return { configured, send };
}
module.exports = { createAuthMailer };
