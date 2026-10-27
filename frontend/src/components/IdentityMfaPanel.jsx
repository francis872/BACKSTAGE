import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { establishSession, setSession } from '../lib/auth';
export default function IdentityMfaPanel({ user }) {
  const [status, setStatus] = useState(null), [setup, setSetup] = useState(null), [codes, setCodes] = useState(null);
  const [password, setPassword] = useState(''), [code, setCode] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => { const c = new AbortController(); apiRequest('/auth/mfa/status', { signal: c.signal }).then(async r => { if (r.ok) setStatus(await r.json()); }).catch(() => {}); return () => c.abort(); }, [user.user_id]);
  async function submit(action, body) {
    if (busy) return; setBusy(true); setMessage('');
    try {
      const r = await apiRequest(`/auth/mfa/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json(); if (!r.ok) throw Error(data.error || 'No se pudo completar esta acción.');
      if (action === 'setup') { setSetup(data); setPassword(''); }
      else { if(!data.token||data.user?.user_id!==user.user_id)throw Error('La renovación del acceso está incompleta.');setSession(data.token,data.user);await establishSession(data.token, data.user); setSetup(null); setCodes(data.recovery_codes || null); setStatus(s => ({ ...s, enabled: data.enabled, recovery_codes_remaining: data.recovery_codes?.length || 0 })); setPassword(''); setCode(''); setMessage(data.enabled ? 'Segundo factor activado. Los otros accesos se cerraron.' : 'Segundo factor desactivado. Los otros accesos se cerraron.'); }
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  }
  return <details className="native-identity-mfa"><summary>Proteger mi acceso con un segundo factor</summary>
    {!status && <p>Consultando protección de tu cuenta…</p>}
    {status && <p>{status.enabled ? 'Tu cuenta requiere un código adicional al entrar.' : 'Puedes añadir códigos de una aplicación autenticadora.'}</p>}
    {status?.available === false && !status.enabled && <p>El administrador debe configurar la protección de claves del servidor para activar esta función.</p>}
    {!status?.enabled && status?.available && !setup && <form onSubmit={e => { e.preventDefault(); submit('setup', { current_password: password }); }}>
      <label htmlFor="mfa-password">Contraseña actual</label><input id="mfa-password" type="password" autoComplete="current-password" required maxLength={72} value={password} onChange={e => setPassword(e.target.value)} />
      <button disabled={busy}>Configurar segundo factor</button>
    </form>}
    {setup && <form onSubmit={e => { e.preventDefault(); submit('confirm', { code }); }}>
      <p>Añade una cuenta TOTP en tu aplicación autenticadora con esta clave. Se muestra solo para esta configuración; vence en cinco minutos.</p><code style={{ overflowWrap: 'anywhere' }}>{setup.secret}</code>
      <label htmlFor="mfa-enrollment-code">Código de seis dígitos</label><input id="mfa-enrollment-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" required value={code} onChange={e => setCode(e.target.value)} />
      <button disabled={busy}>Confirmar y activar</button>
    </form>}
    {codes && <section aria-label="Códigos de recuperación"><h4>Guarda estos códigos antes de continuar</h4><p>Cada código permite entrar una sola vez si pierdes el autenticador. No se volverán a mostrar. Guárdalos en un lugar privado separado del dispositivo.</p><ul>{codes.map(c => <li key={c}><code>{c}</code></li>)}</ul><button type="button" onClick={() => setCodes(null)}>Ya guardé mis códigos</button></section>}
    {status?.enabled && !codes && <details><summary>Desactivar segundo factor</summary><form onSubmit={e => { e.preventDefault(); submit('disable', { current_password: password, code }); }}>
      <label htmlFor="mfa-disable-password">Contraseña actual</label><input id="mfa-disable-password" type="password" autoComplete="current-password" required maxLength={72} value={password} onChange={e => setPassword(e.target.value)} />
      <label htmlFor="mfa-disable-code">Código del autenticador o código de recuperación sin usar</label><input id="mfa-disable-code" autoComplete="one-time-code" required maxLength={32} value={code} onChange={e => setCode(e.target.value)} />
      <button disabled={busy}>Confirmar desactivación</button>
    </form></details>}
    {message && <p role="status">{message}</p>}
  </details>;
}
