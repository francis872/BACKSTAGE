import { getSessionToken, getSessionUser } from './auth';

const API_BASE_URL = '/api';

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export async function apiRequest(path, options = {}) {
  const token = getSessionToken();
  const sessionUser = getSessionUser();
  const headers = { ...(options.headers || {}) };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (sessionUser?.organization_id) {
    headers['X-Organization-Id'] = String(sessionUser.organization_id);
  }

  const target = path.startsWith('/api/') ? path : apiUrl(path);
  return fetch(target, { ...options, headers });
}

