const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export function apiUrl(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

function getSessionUser() {
  const raw = window.localStorage.getItem('backstage_user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function apiRequest(path, options = {}) {
  const token = window.localStorage.getItem('backstage_token');
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

