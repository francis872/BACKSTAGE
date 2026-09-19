const STORAGE_KEY = 'backstage_operational_context';

export function getStoredOperationalContext() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed?.analysis_run_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setStoredOperationalContext(context) {
  if (!context?.analysis_run_id) return;
  const payload = {
    analysis_run_id: Number(context.analysis_run_id),
    project_name: context.project_name || null,
    city: context.city || null,
    organization_id: context.organization_id || null,
    saved_at: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredOperationalContext() {
  window.localStorage.removeItem(STORAGE_KEY);
}
