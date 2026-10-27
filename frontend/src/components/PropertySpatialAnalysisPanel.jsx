import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { PROPERTY_LAYER_PATH } from '../lib/horizontalProperty.mjs';
import Button from './ui/Button';
import Input from './ui/Input';
const methods = { weights: 'Matriz de vecindad', moran: 'Moran global', local_moran: 'Moran local / LISA y atípicos espaciales', gi_star: 'Hotspots y coldspots (Gi*)', kde: 'Densidad de PQRS registradas (KDE)', temporal: 'Comparar periodos de PQRS' };
const metrics = { pqrs_count: 'Cantidad de PQRS retenidas', open_pqrs_count: 'PQRS abiertas o en revisión', outstanding_minor: 'Saldo registrado de cartera', overdue_minor: 'Saldo vencido registrado' };
const neighbors = { queen: 'Queen · polígonos que se tocan', rook: 'Rook · polígonos que comparten borde', knn: 'K vecinos más cercanos', distance_band: 'Distancia máxima', inverse_distance: 'Inverso de la distancia' };
const kinds = { private_unit: 'Unidades privadas', common_area: 'Zonas comunes', building: 'Edificios', tower: 'Torres', block: 'Bloques', parking: 'Parqueaderos', equipment: 'Equipamientos', waste_collection: 'Puntos de residuos', access: 'Accesos', maintenance_area: 'Áreas de mantenimiento', technical_infrastructure: 'Infraestructura técnica', residential_complex: 'Conjuntos', coproperty: 'Copropiedades' };
const categories = { HH: 'Valores altos rodeados de altos', LL: 'Valores bajos rodeados de bajos', HL: 'Atípico: alto entre bajos', LH: 'Atípico: bajo entre altos', HOTSPOT: 'Concentración de valores altos', COLDSPOT: 'Concentración de valores bajos', NOT_SIGNIFICANT: 'Sin evidencia significativa', ISLAND: 'Sin vecinos', UNDEFINED_FULL_NEIGHBORHOOD: 'Vecindad completa: estadístico indefinido', UNDEFINED_ZERO_DEVIATION: 'Sin desviación respecto a la media' };
export default function PropertySpatialAnalysisPanel({ locationId, user }) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const [runs, setRuns] = useState([]), [preview, setPreview] = useState(null), [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ method: 'moran', metric: 'pqrs_count', unit_kind: 'private_unit', weights: 'knn', k: '2', distance: '500', permutations: '199', seed: '0', alpha: '0.05', currency: 'COP', scale: '2', bandwidth: '100', start: '', middle: '', end: '' });
  const mounted = useRef(true), sending = useRef(false), command = useRef(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const base = `${PROPERTY_LAYER_PATH}/${locationId}/analysis`;
  async function request(path, options = {}) { const r = await apiRequest(path, options); const value = await r.json(); if (!r.ok) throw Error(value.error || 'No se pudo completar el análisis.'); return value; }
  async function action(work) { if (sending.current) return; sending.current = true; setBusy(true); setMessage(''); try { await work(); } catch (e) { if (mounted.current) setMessage(e.message); } finally { sending.current = false; if (mounted.current) setBusy(false); } }
  async function load() { const value = await request(base); if (mounted.current) setRuns(value.data); }
  useEffect(() => { if (open) action(load); }, [open]);
  function parameters() {
    const p = { method: form.method, metric: form.metric, unit_kind: form.unit_kind, weights: { method: form.weights }, permutations: Number(form.permutations), seed: Number(form.seed), alpha: Number(form.alpha) };
    if (form.weights === 'knn') p.weights.k = Number(form.k);
    if (['distance_band', 'inverse_distance'].includes(form.weights)) p.weights.distance_m = Number(form.distance);
    if (form.metric.endsWith('_minor')) { p.currency = form.currency; p.scale = Number(form.scale); }
    if (form.method === 'kde') p.density = { bandwidth_m: Number(form.bandwidth), resolution: 8, kernel: 'gaussian' };
    if (form.method === 'temporal') p.periods = [{ start: new Date(form.start).toISOString(), end: new Date(form.middle).toISOString() }, { start: new Date(form.middle).toISOString(), end: new Date(form.end).toISOString() }];
    return p;
  }
  function change(name, value) { setForm(f => ({ ...f, [name]: value, ...(name === 'method' && (value === 'temporal' || value === 'kde' && f.metric.endsWith('_minor')) ? { metric: 'pqrs_count' } : {}) })); setPreview(null); command.current = null; }
  async function openRun(id) { const value = await request(`${base}/${id}`); if (mounted.current) setSelected(value.data); }
  const input = (name, label, extra = {}) => <Input label={label} value={form[name]} disabled={busy} onChange={e => change(name, e.target.value)} {...extra}/>;
  const select = (name, label, options) => <Input as="select" label={label} value={form[name]} disabled={busy} onChange={e => change(name, e.target.value)}>{Object.entries(options).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</Input>;
  const result = selected?.result?.result, provenance = selected?.snapshot.provenance, observations = result?.observations;
  function download() {
    const geojson = selected?.result?.result?.geojson;
    const file = { type: 'BackstageSpatialEvidence', analysis_id: selected.analysis_id, parameters: selected.parameters, snapshot: selected.snapshot, input: selected.input, manifest: selected.manifest, provenance, result: selected.result, ...(geojson ? { geojson } : {}) };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `backstage-analisis-${selected.analysis_id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  if (!['admin', 'analyst'].includes(user.role)) return null;
  return <details className="property-spatial-analysis" onToggle={e => setOpen(e.currentTarget.open)}><summary>Analizar los datos de este lugar</summary>
    {open && <section aria-label="Análisis territorial del objeto seleccionado">
      <h3>Inteligencia matemática y espacial</h3><p>Usa los registros de este objeto y sus descendientes del tipo elegido. Solo entran entidades con geometría propia; no se copian coordenadas del edificio.</p>
      <form aria-label="Configurar análisis territorial" onSubmit={e => { e.preventDefault(); action(async () => { command.current ||= crypto.randomUUID(); const value = await request(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': command.current }, body: JSON.stringify(parameters()) }); if (mounted.current) setSelected(value.data); await load(); }); }}>
        {select('unit_kind', 'Qué lugares comparar', kinds)}
        {select('metric', 'Qué dato analizar', form.method === 'temporal' ? { pqrs_count: metrics.pqrs_count } : form.method === 'kde' ? { pqrs_count: metrics.pqrs_count, open_pqrs_count: metrics.open_pqrs_count } : metrics)}
        {select('method', 'Cómo analizar', methods)}
        {form.method !== 'kde' && <>{select('weights', 'Cómo definir los vecinos', neighbors)}{form.weights === 'knn' && input('k', 'Cantidad de vecinos (K)', { type: 'number', min: 1, max: 63 })}{['distance_band', 'inverse_distance'].includes(form.weights) && input('distance', 'Distancia máxima en metros', { type: 'number', min: 1, max: 100000 })}</>}
        {form.metric.endsWith('_minor') && <>{input('currency', 'Moneda de la cartera', { maxLength: 3, required: true })}{input('scale', 'Decimales de la moneda', { type: 'number', min: 0, max: 4 })}</>}
        {form.method === 'kde' && input('bandwidth', 'Ancho de banda KDE en metros', { type: 'number', min: 1, max: 100000 })}
        {form.method === 'temporal' && <>{input('start', 'Inicio del primer periodo', { type: 'datetime-local', required: true })}{input('middle', 'Fin del primero e inicio del segundo', { type: 'datetime-local', required: true })}{input('end', 'Fin del segundo periodo', { type: 'datetime-local', required: true })}<p>Compara conteos por fecha de creación verificada en auditoría. Los cambios entre periodos son descriptivos; no prueban causalidad ni cambio significativo.</p></>}
        <details><summary>Parámetros de significancia y repetición</summary>{input('permutations', 'Permutaciones', { type: 'number', min: 19, max: 9999 })}{input('seed', 'Semilla reproducible', { type: 'number', min: 0, max: 2147483647 })}{select('alpha', 'Nivel de significancia', { '0.1': '10%', '0.05': '5%', '0.01': '1%' })}<p>Contraste bilateral; corrección Benjamini–Hochberg en cada análisis local. No corrige entre ejecuciones o periodos.</p></details>
        <div className="form-actions"><Button variant="secondary" disabled={busy} onClick={() => action(async () => { const value = await request(base + '/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parameters()) }); if (mounted.current) setPreview(value); })}>Revisar datos disponibles</Button><Button type="submit" loading={busy}>Calcular y guardar evidencia</Button></div>
      </form>
      {preview && <p role="status">{preview.provenance.coverage.included} lugares incluidos; {preview.provenance.coverage.excluded_unlocated.length} sin ubicación propia excluidos. Mínimo para este método: {preview.minimum_observations}. {preview.encryption_configured ? '' : 'Falta configurar el cifrado del servidor.'}</p>}
      <h4>Análisis guardados de este objeto</h4><ul>{runs.map(run => <li key={run.analysis_id}><Button variant="secondary" disabled={busy} onClick={() => action(() => openRun(run.analysis_id))}>Análisis #{run.analysis_id} · {new Date(run.created_at).toLocaleString()}</Button></li>)}</ul><p>Se muestran los treinta más recientes.</p>
      {selected && <article aria-label="Resultado de análisis territorial"><h4>{methods[selected.parameters.method]} · #{selected.analysis_id}</h4><p>{metrics[selected.parameters.metric]} · {provenance.coverage.included} lugares · Captura: {new Date(provenance.captured_at).toLocaleString()}</p>
        {selected.parameters.metric.endsWith('_minor') && <p>Valores en unidades mínimas: {selected.parameters.currency}, {selected.parameters.scale} decimales; sin mezclar monedas.</p>}
        {result?.statistic != null && <p>I de Moran: {result.statistic.toFixed(6)} · p: {result.p_value.toFixed(4)}. {result.interpretation}</p>}
        {selected.result.weights && <p>Vecindad: {selected.result.weights.method} · {selected.result.weights.nonzero} conexiones · {selected.result.weights.islands.length} lugares sin vecinos.</p>}
        {result?.shape && <p>Matriz {result.shape.join(' × ')}; pesos almacenados como conexiones dispersas.</p>}
        {observations && <ul>{observations.map(row => <li key={row.id}>Lugar #{row.id}: {categories[row.category] || row.category}{row.adjusted_p != null ? ` · p corregido ${row.adjusted_p.toFixed(4)}` : ''}</li>)}</ul>}
        {result?.grid && <p>Superficie KDE calculada: {result.resolution} × {result.resolution} celdas; banda {result.bandwidth_m} m. Describe conteos registrados por área; no estima riesgo futuro.</p>}
        {selected.result.comparison?.series && <ul>{selected.result.comparison.series.map(p => <li key={p.period}>{p.period}: Moran {p.statistic.toFixed(6)} · p {p.p_value.toFixed(4)}</li>)}</ul>}
        {selected.result.interpretation && <p>{selected.result.interpretation}</p>}
        <p>Fuente: registros aportados por la organización. Cobertura completa sin verificar. No identifica causalidad, riesgo sanitario ni cumplimiento normativo.</p>
        <p>La descarga incluye los valores agregados y las geometrías de la instantánea guardada.</p>
        <small style={{ display: 'block', overflowWrap: 'anywhere' }}>Integridad de entrada: {selected.manifest.input_sha256} · Motor: {selected.manifest.engine_version}</small>
        <div className="form-actions"><Button disabled={busy} variant="secondary" onClick={() => action(async () => { const check = await request(`${base}/${selected.analysis_id}/reproduce`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (mounted.current) setMessage(check.verified ? 'Resultado reproducido con la misma instantánea y semilla.' : 'El resultado no coincide; requiere revisión.'); })}>Reproducir instantánea guardada</Button><Button disabled={busy} variant="secondary" onClick={() => action(async () => { const value = await request(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(selected.parameters) }); if (mounted.current) setSelected(value.data); await load(); })}>Calcular otra vez con datos actuales</Button><Button disabled={busy} variant="secondary" onClick={download}>Descargar resultado y procedencia</Button></div>
      </article>}
      {message && <p role="status" aria-live="polite">{message}</p>}
    </section>}
  </details>;
}
