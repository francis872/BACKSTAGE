import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const empty = { email: '', name: '', role: 'viewer', password: '' };

function UsersAdmin() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');

  const loadUsers = async () => {
    try {
      const res = await apiRequest('/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al consultar usuarios.');
      setUsers(data);
      setMessage('');
    } catch (error) {
      setUsers([]);
      setMessage(`Error: ${error.message}`);
    }
  };

  useEffect(() => {
    loadUsers();
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
    try {
      const method = editingId ? 'PUT' : 'POST';
      const path = editingId ? `/users/${editingId}` : '/users';
      const payload = editingId
        ? { name: form.name, role: form.role }
        : { email: form.email, name: form.name, role: form.role, password: form.password };
      const res = await apiRequest(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar usuario.');
      setMessage(editingId ? 'Usuario actualizado.' : 'Usuario creado.');
      reset();
      loadUsers();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const startEdit = (user) => {
    setEditingId(user.user_id);
    setForm({ email: user.email, name: user.name || '', role: user.role, password: '' });
  };

  const remove = async (id) => {
    if (!window.confirm('¿Eliminar usuario?')) return;
    try {
      const res = await apiRequest(`/users/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar usuario.');
      setMessage('Usuario eliminado.');
      loadUsers();
      reset();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <section>
      <h2>Administración de Usuarios y Roles</h2>
      <div className="form-section">
        <h3>{editingId ? 'Editar usuario' : 'Crear usuario'}</h3>
        <form className="entity-form" onSubmit={submit}>
          <div className="field-row">
            <label>Email</label>
            <input name="email" type="email" value={form.email} onChange={setField} required disabled={Boolean(editingId)} />
          </div>
          <div className="field-row">
            <label>Nombre</label>
            <input name="name" value={form.name} onChange={setField} />
          </div>
          <div className="field-row">
            <label>Rol</label>
            <select name="role" value={form.role} onChange={setField}>
              <option value="admin">admin</option>
              <option value="analyst">analyst</option>
              <option value="viewer">viewer</option>
            </select>
          </div>
          {!editingId && (
            <div className="field-row">
              <label>Password (mínimo 8)</label>
              <input name="password" type="password" value={form.password} onChange={setField} minLength={8} required />
            </div>
          )}
          <div className="form-actions">
            <button type="submit">{editingId ? 'Actualizar' : 'Crear'}</button>
            {editingId && <button type="button" className="secondary" onClick={reset}>Cancelar</button>}
          </div>
        </form>
        {message && <p className="message">{message}</p>}
      </div>

      <div className="card-grid">
        {users.map((user) => (
          <article key={user.user_id} className="card">
            <h3>{user.name || user.email}</h3>
            <p>{user.email}</p>
            <p>Rol: <strong>{user.role}</strong></p>
            <p>Organización: {user.organization_name || user.organization_slug || 'N/A'}</p>
            <div className="card-actions">
              <button onClick={() => startEdit(user)}>Editar</button>
              <button className="secondary" onClick={() => remove(user.user_id)}>Eliminar</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export default UsersAdmin;
