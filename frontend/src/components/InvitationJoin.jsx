import { useState } from 'react';
import { apiRequest } from '../lib/api';
import Button from './ui/Button';
import Input from './ui/Input';

export default function InvitationJoin({ initialToken = '', email, onAccepted }) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const accept = async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setMessage('');
    try {
      const response = await apiRequest('/auth/invitations/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.trim() }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'No se pudo aceptar la invitación.');
      await onAccepted(body);
      setToken(''); setMessage('Invitación aceptada. La organización invitante está activa.');
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <details className="form-section" open={initialToken ? true : undefined}>
    <summary>Unirse mediante invitación</summary>
    <p>Aceptarás con la cuenta {email}. El acceso y el rol corresponden a la invitación recibida.</p>
    <form onSubmit={accept} aria-label="Aceptar invitación">
      <Input label="Código de invitación" value={token} onChange={event => setToken(event.target.value)} autoComplete="off" required minLength={43} maxLength={43} disabled={busy} />
      <Button type="submit" loading={busy}>Aceptar invitación</Button>
    </form>
    {message && <p role="status">{message}</p>}
  </details>;
}
