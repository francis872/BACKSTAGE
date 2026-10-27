import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import BusinessRulesPanel from '../components/BusinessRulesPanel';
import { getSessionUser } from '../lib/auth';

const empty = { name: '', role: 'viewer' };
const roleLabels = { admin: 'Administrador', analyst: 'Analista', viewer: 'Consulta' };

function UsersAdmin() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [invite, setInvite] = useState({email:'',role:'viewer'});
  const [invitations, setInvitations] = useState([]);
  const [invitationLink, setInvitationLink] = useState('');
  const loadInvitations = async () => {
    const response = await apiRequest('/users/invitations');
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'No se pudieron consultar invitaciones.');
    setInvitations(body.data);
  };
  const createInvitation = async event => {
    event.preventDefault(); if(busy)return; setBusy(true); setMessage(''); setInvitationLink('');
    try {
      const response = await apiRequest('/users/invitations',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(invite)});
      const body=await response.json();
      if(!response.ok)throw new Error(body.error || 'No se pudo crear la invitación.');
      setInvitationLink(`${window.location.origin}/dashboard?page=organization-settings#invitation=${body.token}`);
      setInvite({email:'',role:'viewer'}); await loadInvitations();
      setMessage('Invitación creada. Comparte el enlace con el destinatario; vence en siete días.');
    }catch(error){setMessage(error.message);}finally{setBusy(false);}
  };
  const revokeInvitation = async id => {
    if(busy)return; setBusy(true);
    try {
      const response=await apiRequest(`/users/invitations/${id}`,{method:'DELETE'});
      const body=await response.json();if(!response.ok)throw new Error(body.error || 'No se pudo revocar la invitación.');
      setInvitationLink('');await loadInvitations();setMessage('Invitación revocada.');
    }catch(error){setMessage(error.message);}finally{setBusy(false);}
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al consultar usuarios.');
      setUsers(data);
    } catch (error) {
      setUsers([]);
      console.error('Organization members request failed', error);
      setMessage('No pudimos cargar los miembros de la organización.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
    loadInvitations().catch(error=>setMessage(error.message));
  }, []);

  const setField = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const reset = () => {
    setForm(empty);
    setEditingId(null);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!editingId || busy) return;
    setBusy(true);
    try {
      const method = 'PUT';
      const path = `/users/${editingId}`;
      const payload = { name: form.name, role: form.role };
      const res = await apiRequest(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar usuario.');
      setMessage('Miembro actualizado.');
      reset();
      loadUsers();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally { setBusy(false); }
  };

  const startEdit = (user) => {
    setEditingId(user.user_id);
    setForm({ name: user.name || '', role: user.role });
  };

  const remove = async (id) => {
    if (busy || !window.confirm('¿Revocar el acceso de este miembro a esta organización? Su cuenta y sus otras organizaciones se conservan.')) return;
    setBusy(true);
    try {
      const res = await apiRequest(`/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar usuario.');
      setMessage('Acceso del miembro revocado en esta organización.');
      loadUsers();
      reset();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    } finally { setBusy(false); }
  };

  return (
    <section>
      <details className="form-section" onToggle={event=>setRulesOpen(event.currentTarget.open)}><summary>Reglas comerciales y alertas del administrador</summary>{rulesOpen&&<BusinessRulesPanel/>}</details>
      <div className="score-row"><div><h3>Miembros</h3><p className="auth-hint">Miembros y roles de esta organización.</p></div><Button onClick={()=>setShowInvite(value=>!value)} aria-expanded={showInvite}>Invitar miembro</Button></div>
      {showInvite && <section className="form-section">
        <h3>Invitar a la organización</h3>
        <p>Genera un enlace para compartir manualmente. El destinatario debe iniciar sesión y aceptar con el correo indicado.</p>
        <form onSubmit={createInvitation} aria-label="Crear invitación">
          <Input label="Correo del destinatario" type="email" value={invite.email} onChange={event=>setInvite({...invite,email:event.target.value})} required disabled={busy} />
          <Input as="select" label="Rol de la invitación" value={invite.role} onChange={event=>setInvite({...invite,role:event.target.value})} disabled={busy}>
            {Object.entries(roleLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}
          </Input>
          <Button type="submit" loading={busy}>Generar invitación</Button>
        </form>
        {invitationLink && <Input label="Enlace de invitación" value={invitationLink} readOnly onFocus={event=>event.target.select()} />}
      </section>}
      {invitations.length>0 && <details className="form-section"><summary>Invitaciones de la organización</summary><ul>{invitations.map(row=><li key={row.invitation_id}>{row.email} · {roleLabels[row.role]} · {({pending:'Pendiente',accepted:'Aceptada',revoked:'Revocada',expired:'Vencida'})[row.status]} {row.status==='pending' && <Button variant="secondary" size="sm" disabled={busy} onClick={()=>revokeInvitation(row.invitation_id)}>Revocar invitación</Button>}</li>)}</ul></details>}
      {editingId ? <div className="form-section">
        <h3>Editar miembro</h3>
        <form className="entity-form" onSubmit={submit}>
          <div className="field-row">
            <label htmlFor="member-name">Nombre</label>
            <input id="member-name" name="name" value={form.name} onChange={setField} />
          </div>
          <div className="field-row">
            <label htmlFor="member-role">Rol</label>
            <select id="member-role" name="role" value={form.role} onChange={setField} disabled={Number(editingId)===Number(getSessionUser()?.user_id)}>
              <option value="admin">Administrador</option>
              <option value="analyst">Analista</option>
              <option value="viewer">Consulta</option>
            </select>
          </div>
          <div className="form-actions">
            <button type="submit" disabled={!editingId || busy}>Actualizar rol</button>
            {editingId && <button type="button" className="secondary" onClick={reset}>Cancelar</button>}
          </div>
        </form>
        {message && <p className="message">{message}</p>}
      </div> : <p className="auth-hint">Selecciona un miembro para cambiar su nombre o rol.</p>}
      {!editingId && message && <p className="message">{message}</p>}

      {loading ? <p className="auth-hint" role="status">Cargando miembros…</p> : users.length === 0 ? <p>No hay miembros disponibles.</p> : <div className="card-grid">
        {users.map((user) => (
          <article key={user.user_id} className="card">
            <h3>{user.name || user.email}</h3>
            <p>{user.email}</p>
            <p>Rol: <strong>{roleLabels[user.role] || user.role}</strong></p>
            <p>Organización: {user.organization_name || user.organization_slug || 'N/A'}</p>
            <div className="card-actions">
              <button disabled={busy} onClick={() => startEdit(user)}>Editar</button>
              <button className="secondary" disabled={busy||Number(user.user_id)===Number(getSessionUser()?.user_id)} onClick={() => remove(user.user_id)}>Revocar acceso</button>
            </div>
          </article>
        ))}
      </div>}
    </section>
  );
}

export default UsersAdmin;
