// Geography contracts retain structured provenance; JSX requires a readable label.
// Never stringify the entire provider object or discard its evidence metadata.
export function sourceLabel(value, fallback = 'Fuente no indicada') {
  if (typeof value === 'string' && value.trim()) return value;
  if (value && typeof value === 'object') {
    for (const key of ['name','label','provider','source']) {
      if (typeof value[key] === 'string' && value[key].trim()) return value[key];
    }
  }
  return fallback;
}
