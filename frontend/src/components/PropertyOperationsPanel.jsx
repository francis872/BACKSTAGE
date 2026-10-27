import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import { PROPERTY_LAYER_PATH } from '../lib/horizontalProperty.mjs';
import { toMinorUnits, displayMinorUnits } from '../lib/monetaryUnits.mjs';
import Button from './ui/Button';
import Input from './ui/Input';
const labels = { open: 'Abierto', in_review: 'En revisión', responded: 'Respondido', closed: 'Cerrado', requested: 'Solicitado', confirmed: 'Confirmado', completed: 'Finalizado', cancelled: 'Cancelado', expected: 'Visita prevista', arrived: 'Ingreso registrado', departed: 'Salida registrada', scheduled: 'Programado', in_progress: 'En curso', posted: 'Registrado', planned: 'Planificado', approved: 'Aprobado internamente', voided: 'Anulado' };
const typeLabels = { pqrs: 'PQRS', reservation: 'Reserva', gate_entry: 'Portería', assembly: 'Asamblea', task: 'Tarea', charge: 'Cuenta por cobrar', payment: 'Pago manual', budget: 'Presupuesto', expense: 'Egreso manual' };
const categoryLabels = { petition: 'Petición', complaint: 'Queja', claim: 'Reclamo', suggestion: 'Sugerencia' };
const actionLabels = { 'ph.operation.created': 'Operación registrada', 'ph.operation.transitioned': 'Estado actualizado', 'ph.operation.content_read': 'Contenido consultado', 'ph.operation.content_erased': 'Contenido personal eliminado', 'horizontal_property.created': 'Elemento registrado', 'horizontal_property.updated': 'Elemento actualizado', 'horizontal_property.archived': 'Elemento archivado', 'ph.economics.read': 'Cartera consultada' };
const money = group => `${group.currency} ${displayMinorUnits(group.outstanding_minor, group.scale)}`;
export default function PropertyOperationsPanel({ locationId, user }) {
  const base = `${PROPERTY_LAYER_PATH}/${locationId}/operations`;
  const [list, setList] = useState(null), [history, setHistory] = useState(null), [economic, setEconomic] = useState(null);
  const [selected, setSelected] = useState(null), [type, setType] = useState(''), [draft, setDraft] = useState(null), [next, setNext] = useState(''), [note, setNote] = useState('');
  const [message, setMessage] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [verified, setVerified] = useState(null);
  const alive = useRef(true), sending = useRef(false), command = useRef(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  async function request(path, options = {}) { const r = await apiRequest(path, options); const body = await r.json(); if (!r.ok) throw Error(body.error || 'No se pudo completar la consulta.'); return body; }
  async function load(before) {
    setLoading(true);
    try { const [rows, events] = await Promise.all([request(base + (before ? `?before=${before}` : '')), request(base + '/history')]); if (alive.current) { setList(old => before ? { ...rows, data: [...(old?.data || []), ...rows.data] } : rows); setHistory(events); setType(old => old || Object.keys(rows.catalog)[0] || ''); } }
    catch (e) { if (alive.current) setMessage(e.message); } finally { if (alive.current) setLoading(false); }
  }
  useEffect(() => { load(); }, [base]);
  const spec = list?.catalog[type], selectedRow = selected?.data;
  const charges = list?.data.filter(r => r.type === 'charge' && r.status === 'posted') || [];
  async function mutate(path, body, after) {
    if (sending.current) return; sending.current = true; setBusy(true); setMessage('');
    try {
      const response = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': command.current || crypto.randomUUID() }, body: JSON.stringify(body) });
      if (!alive.current) return; setDraft(null); setNext(''); setNote(''); setSelected(response.data ? { data: response.data, transitions: [] } : null); setMessage('Acción guardada con auditoría.'); await load(); if (after) await after(); else if(response.data)await openRecord(response.data.record_id);
    } catch (e) { if (alive.current) setMessage(e.message); } finally { sending.current = false; if (alive.current) setBusy(false); }
  }
  async function openRecord(id) { setMessage(''); try { const row = await request(`${base}/records/${id}`); if (alive.current) { setSelected(row); setNext(''); setNote(''); command.current = crypto.randomUUID(); } } catch (e) { if (alive.current) setMessage(e.message); } }
  const create = event => {
    event.preventDefault();
    try {
      const body = {};
      for (const [name, field] of Object.entries(spec.fields)) {
        const value = draft[name]; if (field.optional && (value == null || value === '')) continue;
        if (name === 'amount_minor') { const scale = type === 'payment' ? charges.find(c => c.record_id === Number(draft.charge_id))?.public.scale : Number(draft.scale); body[name] = toMinorUnits(value, scale); }
        else if (field.type === 'datetime') body[name] = new Date(value).toISOString();
        else body[name] = value;
      }
      mutate(`${base}/${type}`, body);
    } catch (e) { setMessage(e.message); }
  };
  return <section aria-label="Operaciones del objeto seleccionado">
    <h3>Trabajar con este lugar</h3><p>Los registros y el historial se vinculan al objeto seleccionado.</p>
    {loading && <p role="status">Consultando operaciones…</p>}
    {list?.encryption_configured === false && <p>El administrador debe configurar la protección cifrada del servidor para registrar información sensible.</p>}
    {list && <><Input as="select" label="Qué necesitas hacer" value={type} disabled={busy || !!draft} onChange={e => setType(e.target.value)}>{Object.entries(list.catalog).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</Input>
      {!draft && spec && <Button disabled={busy || !list.encryption_configured} onClick={() => { command.current = crypto.randomUUID(); setSelected(null); setDraft({ currency: 'COP', scale: '2' }); }}>Abrir formulario</Button>}
    </>}
    {draft && spec && <form onSubmit={create} aria-label="Registrar operación del objeto" aria-busy={busy || undefined}>
      <h4>{spec.label}</h4>
      {Object.entries(spec.fields).filter(([, field]) => field.type !== 'member').map(([name, field]) => name === 'charge_id' ? <Input key={name} as="select" label={field.label} required value={draft[name] || ''} disabled={busy} onChange={e => setDraft({ ...draft, [name]: e.target.value })}><option value="">Selecciona una cuenta</option>{charges.map(c => <option key={c.record_id} value={c.record_id}>Cuenta #{c.record_id} · {c.public.currency} {displayMinorUnits(c.public.amount_minor, c.public.scale)}</option>)}</Input> :
        <Input key={name} as={field.type === 'choice' ? 'select' : field.type === 'text' && field.max > 500 ? 'textarea' : 'input'} label={name === 'amount_minor' ? 'Importe' : field.label} type={field.type === 'datetime' ? 'datetime-local' : field.type === 'integer' && name !== 'amount_minor' ? 'number' : 'text'} min={field.min} max={field.max} step={field.type === 'integer' ? '1' : undefined} maxLength={field.type === 'currency' ? 3 : field.type === 'text' ? field.max || 200 : 32} helperText={name === 'amount_minor' ? 'Escribe el valor en moneda, por ejemplo 1200.50. No se realiza un cobro bancario.' : field.type === 'datetime' ? 'Fecha y hora de tu dispositivo.' : ''} required={!field.optional} disabled={busy} value={draft[name] ?? ''} onChange={e => setDraft({ ...draft, [name]: e.target.value })}>{field.type === 'choice' ? <><option value="">Selecciona una opción</option>{field.values.map(v => <option key={v} value={v}>{categoryLabels[v] || v}</option>)}</> : undefined}</Input>)}
      {type === 'payment' && !charges.length && <p>Primero registra una cuenta por cobrar en esta unidad. Puedes cargar más registros de la lista si ya existe.</p>}
      <div className="form-actions"><Button type="submit" loading={busy}>Guardar operación</Button><Button variant="secondary" disabled={busy} onClick={() => setDraft(null)}>Cancelar</Button></div>
    </form>}
    <ul>{list?.data.map(row => <li key={row.record_id}><Button variant="secondary" disabled={busy || !row.can_read_content && !row.content_erased} onClick={() => openRecord(row.record_id)}>{typeLabels[row.type]} #{row.record_id} · {labels[row.status] || row.status}</Button>{row.type === 'reservation' && <small>{new Date(row.public.starts_at).toLocaleString()}–{new Date(row.public.ends_at).toLocaleString()}</small>}</li>)}</ul>
    {list?.next_before && <Button variant="secondary" disabled={busy || loading} onClick={() => load(list.next_before)}>Cargar más registros</Button>}
    {selectedRow && <article aria-label="Detalle de operación"><h4>{typeLabels[selectedRow.type]} #{selectedRow.record_id}</h4><p>{labels[selectedRow.status]}</p>
      {selectedRow.content_erased ? <p>Contenido personal eliminado. Se conservan las referencias de integridad y auditoría.</p> : <dl>{Object.entries(selectedRow.data || {}).map(([key, value]) => <div key={key}><dt>{key === 'amount_minor' ? 'Importe' : list?.catalog[selectedRow.type]?.fields[key]?.label || ({ response: 'Respuesta', minutes: 'Acta aportada', last_note: 'Evidencia o motivo' }[key]) || key}</dt><dd style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{key === 'amount_minor' ? `${selectedRow.public.currency} ${displayMinorUnits(value, selectedRow.public.scale)}` : categoryLabels[value] || String(value)}</dd></div>)}</dl>}
      {selectedRow.type === 'assembly' && <p>El registro de agenda y acta no certifica quórum, votaciones ni validez jurídica.</p>}
      {selected?.transitions.length > 0 && !selectedRow.content_erased && <form onSubmit={e => { e.preventDefault(); mutate(`${base}/records/${selectedRow.record_id}/transition`, { revision: selectedRow.revision, status: next, ...(next === 'responded' ? { response: note } : next === 'closed' && selectedRow.type === 'assembly' ? { minutes: note } : note ? { note } : {}) }, () => openRecord(selectedRow.record_id)); }}>
        <Input as="select" label="Cambiar estado" required disabled={busy} value={next} onChange={e => { setNext(e.target.value); command.current = crypto.randomUUID(); }}><option value="">Selecciona una acción</option>{selected.transitions.map(v => <option key={v} value={v}>{labels[v]}</option>)}</Input>
        <Input as="textarea" label={next === 'responded' ? 'Respuesta' : selectedRow.type === 'assembly' && next === 'closed' ? 'Acta aportada' : 'Evidencia o motivo'} maxLength={8000} disabled={busy} value={note} onChange={e => setNote(e.target.value)} required={['responded', 'completed', 'voided', 'approved'].includes(next) || selectedRow.type === 'assembly' && next === 'closed'}/>
        <Button type="submit" loading={busy}>Guardar cambio de estado</Button>
      </form>}
      {user.role === 'admin' && !selectedRow.content_erased && !['charge', 'payment', 'budget'].includes(selectedRow.type) && ['closed', 'cancelled', 'departed', 'completed'].includes(selectedRow.status) && <details><summary>Eliminar contenido personal</summary><p>Se retirarán los cuerpos cifrados de todas las versiones de este registro activo en Atlas. Esta acción no borra respaldos ni las referencias técnicas conservadas.</p><Button disabled={busy} onClick={() => mutate(`${base}/records/${selectedRow.record_id}/erase-content`, { revision: selectedRow.revision, reason_code: 'user_request' }, () => openRecord(selectedRow.record_id))}>Confirmar eliminación del contenido</Button></details>}
    </article>}
    {['admin', 'analyst'].includes(user.role) && <details><summary>Cartera y recursos registrados</summary><Button variant="secondary" disabled={busy} onClick={() => request(base + '/economics').then(setEconomic).catch(e => setMessage(e.message))}>Consultar saldos y presupuesto</Button>{economic?.groups.map(g => <p key={g.currency + g.scale}>Saldo: {money(g)} · Recaudado: {g.currency} {displayMinorUnits(g.collected_minor, g.scale)} · Presupuesto registrado: {g.currency} {displayMinorUnits(g.budget_minor, g.scale)}</p>)}{economic && <p>Datos registrados por la organización; sin conciliación bancaria ni pronóstico automático.</p>}</details>}
    <details><summary>Historial confiable de este objeto</summary><ol>{history?.data.map(row => <li key={row.audit_log_id}><span>{new Date(row.created_at).toLocaleString()} · {actionLabels[row.action] || row.action} · usuario #{row.user_id}</span><small style={{ display: 'block', overflowWrap: 'anywhere' }}>Referencia: {row.event_hash}</small></li>)}</ol>{user.role === 'admin' && <Button variant="secondary" onClick={() => request('/audit-logs/chain-status?limit=2000').then(setVerified).catch(e => setMessage(e.message))}>Comprobar cadena de la organización</Button>}{verified && <p role="status">{verified.valid ? 'La cadena verificada conserva su integridad.' : 'No se pudo certificar toda la cadena. Revisa el diagnóstico de auditoría.'}</p>}</details>
    {message && <p role="status" aria-live="polite">{message}</p>}
    {history?.integrity && <p role={history.integrity.valid?'status':'alert'}>{history.integrity.valid?'Las huellas de los eventos mostrados coinciden. La comprobación de toda la cadena se realiza por separado.':'Hay eventos cuya integridad no coincide. Solicita revisión al administrador.'}</p>}
  </section>;
}
