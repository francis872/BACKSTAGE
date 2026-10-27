import { useEffect,useState } from 'react';
import { apiRequest } from '../lib/api';
import IdentityMfaPanel from './IdentityMfaPanel';
export default function AccountSecurityPanel({user,onLogout}){
 const [capabilities,setCapabilities]=useState(null),[sessions,setSessions]=useState(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
 const [current,setCurrent]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState(''),[revokePassword,setRevokePassword]=useState('');
 const load=async(signal)=>{const r=await apiRequest('/auth/sessions',{signal});const data=await r.json();if(r.ok)setSessions(data);};
 useEffect(()=>{const c=new AbortController();load(c.signal).catch(()=>{});apiRequest('/auth/capabilities',{signal:c.signal}).then(async r=>{if(r.ok)setCapabilities(await r.json());}).catch(()=>{});return()=>c.abort();},[user.user_id]);
 const action=async(path,body,method='POST')=>{if(busy)return;setBusy(true);setMessage('');try{const r=await apiRequest(`/auth/${path}`,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});const data=await r.json();if(!r.ok)throw Error(data.error||'No pudimos completar esta acción.');setMessage(data.message||'La acción quedó guardada.');if(data.requires_login||data.current_session_closed){onLogout({serverRevoked:true});return;}await load();}catch(error){setMessage(error.message);}finally{setBusy(false);}};
 return <section className="form-section account-security"><h3>Seguridad y sesiones</h3><p>Correo {user.email_verified?'verificado':'pendiente de verificar'}.</p>
   <IdentityMfaPanel user={user}/>
   {!user.email_verified&&<><button type="button" className="secondary" disabled={busy||!capabilities?.email_verification} onClick={()=>action('request-verification',{})}>Enviar enlace de verificación</button>{capabilities?.email_verification===false&&<p className="auth-hint">Falta configurar el proveedor de correo. Tu acceso actual se conserva.</p>}</>}
   <details><summary>Cambiar mi contraseña</summary><form onSubmit={e=>{e.preventDefault();if(password!==confirmation){setMessage('Las contraseñas no coinciden.');return;}action('change-password',{current_password:current,password});}}>
     <label htmlFor="security-current-password">Contraseña actual</label><input id="security-current-password" type="password" autoComplete="current-password" required maxLength={72} value={current} onChange={e=>setCurrent(e.target.value)}/>
     <label htmlFor="security-new-password">Nueva contraseña</label><input id="security-new-password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} onChange={e=>setPassword(e.target.value)}/>
     <label htmlFor="security-confirm-password">Repite la nueva contraseña</label><input id="security-confirm-password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/>
     <p>Al guardarla se cerrarán las sesiones anteriores. Volverás a entrar con la nueva contraseña.</p><button disabled={busy}>Guardar contraseña y volver a entrar</button>
   </form></details>
   <details><summary>Mis sesiones abiertas</summary><p>Se muestran los accesos registrados desde esta versión; no se recopilan ubicaciones del dispositivo.</p>
     {sessions?.legacy_sessions_may_exist&&<p>Puede haber sesiones de una versión anterior que no aparecen individualmente. Cerrar todas también las invalida.</p>}
     {sessions?.data?.map(row=><div className="session-entry" key={row.id}><span>{row.current?'Esta sesión':'Otro acceso'} · iniciada {new Date(row.started_at).toLocaleString()} · vence {new Date(row.expires_at).toLocaleString()}</span><button type="button" className="secondary" disabled={busy} onClick={()=>action(`sessions/${row.id}`,undefined,'DELETE')}>Cerrar esta sesión</button></div>)}
     {!sessions&&<button type="button" className="secondary" onClick={()=>load().catch(()=>setMessage('No pudimos consultar las sesiones.'))}>Consultar sesiones</button>}
     <details><summary>Cerrar todas mis sesiones</summary><form onSubmit={e=>{e.preventDefault();action('sessions/revoke-all',{current_password:revokePassword});}}><label htmlFor="security-revoke-password">Confirma tu contraseña actual</label><input id="security-revoke-password" type="password" autoComplete="current-password" required maxLength={72} value={revokePassword} onChange={e=>setRevokePassword(e.target.value)}/><p>También saldrás de este navegador.</p><button disabled={busy}>Confirmar cierre de todas las sesiones</button></form></details>
   </details>
   <button type="button" className="secondary" onClick={()=>onLogout()}>Cerrar sesión</button>{message&&<p role="status">{message}</p>}
 </section>;
}
