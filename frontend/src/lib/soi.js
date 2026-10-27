import { useEffect, useState } from 'react';
import { apiRequest } from './api';
import { getSessionUser } from './auth';

export async function soiRequest(path, body, method = body === undefined ? 'GET' : 'POST', signal) {
  const response = await apiRequest(`/soi${path}`, { method, signal,
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || 'SOI no pudo completar la solicitud.');
  return value;
}

// Drafts belong to both the signed-in user and the active organization.
export function useSoiDraft(name, initial) {
  const user = getSessionUser();
  const key = `backstage:soi:${user?.user_id}:${user?.organization_id}:${name}`;
  const [draft, setDraft] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(key)) || initial; } catch { return initial; }
  });
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(draft)); } catch { /* Still usable without storage. */ } }, [key, draft]);
  return [draft, setDraft];
}
