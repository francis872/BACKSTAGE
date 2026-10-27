import { clearSession, getSessionToken, getSessionUser } from './auth';

const API_BASE_URL = '/api';

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function apiRequest(path, options = {}) {
  const token = getSessionToken();
  const sessionUser = getSessionUser();
  const headers = new Headers(options.headers);
  const target = path.startsWith('/api/') ? path : apiUrl(path);
  const publicAccess = /^\/api\/auth\/(login|register|mfa\/verify-login)(?:\?|$)/.test(target);

  if (token && !publicAccess) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (sessionUser?.organization_id && !publicAccess) {
    headers.set('X-Organization-Id', String(sessionUser.organization_id));
  }

  const response = await fetch(target, { ...options, headers });
  // Una respuesta tardía de la sesión anterior no debe cerrar un nuevo acceso.
  if (response.status === 401 && token && !publicAccess && getSessionToken() === token) {
    clearSession();
    window.dispatchEvent(new Event('backstage:session-expired'));
  }
  if (response.ok && !['GET', 'HEAD'].includes((options.method || 'GET').toUpperCase()) && !target.includes('/auth/')) {
    window.dispatchEvent(new Event('backstage:data-changed'));
  }
  return response;
}

