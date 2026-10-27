const TOKEN_KEY = 'backstage_token';
const USER_KEY = 'backstage_user';
// A blocked/quota-limited browser keeps this tab usable. Never share the
// fallback across windows, users or organizations, and never revive deleted data.
const browserFallbacks = new WeakMap();
function fallback() {
  if (!browserFallbacks.has(window)) browserFallbacks.set(window, new Map());
  return browserFallbacks.get(window);
}
export function getBrowserValue(key) {
  const memory = fallback();
  if (memory.has(key)) return memory.get(key);
  try { return window.localStorage.getItem(key); } catch { return null; }
}
export function setBrowserValue(key, value) {
  const text = String(value);
  try { window.localStorage.setItem(key, text); fallback().delete(key); return true; }
  catch { fallback().set(key, text); return false; }
}
export function removeBrowserValue(key) {
  try { window.localStorage.removeItem(key); fallback().delete(key); }
  catch { fallback().set(key, null); }
}
export function browserKeys() {
  let keys = []; try { keys = Object.keys(window.localStorage); } catch {}
  return [...new Set([...keys, ...fallback().keys()])];
}
export function hasVolatileBrowserState() { return fallback().size > 0; }

export function getSessionToken() {
  return getBrowserValue(TOKEN_KEY);
}

export function setSession(token, user) {
  removeBrowserValue('authToken');
  setBrowserValue(TOKEN_KEY, token);
  setBrowserValue(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  removeBrowserValue('authToken');
  removeBrowserValue(TOKEN_KEY);
  removeBrowserValue(USER_KEY);
}

export function getSessionUser() {
  if (!getSessionToken()) return null;
  const raw = getBrowserValue(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function establishSession(token, user) {
  if (typeof token !== 'string' || !token.trim() || !user?.user_id) throw new Error('La respuesta de acceso está incompleta.');
  // Comprobar el token a través del proxy real antes de abrir la plataforma.
  const response = await fetch('/api/auth/me', {
    headers: { Authorization: `Bearer ${token}`, 'X-Organization-Id': String(user.organization_id || '') },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(response.status === 401
    ? 'No pudimos validar el acceso. Intenta de nuevo; si continúa, el servicio necesita revisión.'
    : 'No pudimos comprobar tu acceso. Intenta de nuevo en unos momentos.');
  const profile = await response.json();
  if (String(profile.user_id) !== String(user.user_id) || String(profile.organization_id) !== String(user.organization_id)) throw new Error('No pudimos confirmar tu espacio de trabajo.');
  setSession(token, profile);
  return profile;
}
