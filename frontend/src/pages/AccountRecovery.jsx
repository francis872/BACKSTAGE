import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import AccessFrame from '../components/AccessFrame';
import { apiRequest } from '../lib/api';
import { clearSession } from '../lib/auth';
import { clearStoredOperationalContext } from '../lib/operationalContext';

export default function AccountRecovery() {
  const location=useLocation(),navigate=useNavigate(),mode=location.pathname==='/reset-password'?'reset':location.pathname==='/verify-email'?'verify':'request';
  const [token,setToken]=useState(()=>new URLSearchParams(location.hash.slice(1)).get('token')||'');
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false),[capabilities,setCapabilities]=useState(null);
  useEffect(()=>{
    if(location.hash){setToken(new URLSearchParams(location.hash.slice(1)).get('token')||'');window.history.replaceState(window.history.state,'',location.pathname+location.search);setDone(false);setMessage('');}
  },[location.pathname,location.hash]);
  useEffect(()=>{
    const existing=document.querySelector('meta[name=referrer]'),meta=existing||document.createElement('meta'),before=meta.content;
    meta.name='referrer';meta.content='no-referrer';if(!existing)document.head.appendChild(meta);
    const controller=new AbortController();
    apiRequest('/auth/capabilities',{signal:controller.signal}).then(async r=>{if(r.ok)setCapabilities(await r.json());}).catch(()=>{});
    return()=>{controller.abort();if(existing)meta.content=before;else meta.remove();};
  },[]);
  const submit=async e=>{
    e.preventDefault();if(busy)return;
    if(mode==='reset'&&password!==confirmation){setMessage('Las contraseñas no coinciden.');return;}
    setBusy(true);setMessage('');
    const route=mode==='request'?'forgot-password':mode==='reset'?'reset-password':'verify-email';
    const body=mode==='request'?{email:email.trim()}:mode==='reset'?{token,password}:{token};
    try{const r=await apiRequest(`/auth/${route}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const data=await r.json();if(!r.ok)throw Error(data.error||'No pudimos completar la solicitud.');if(mode==='reset'){clearStoredOperationalContext();clearSession();setPassword('');setConfirmation('');}setDone(true);setMessage(data.message||'Solicitud completada.');}catch(error){setMessage(error.message);}finally{setBusy(false);}
  };
  return <AccessFrame mode="login" onBack={()=>navigate('/')}><div className="account-recovery"><p className="eyebrow">Tu acceso a BACKSTAGE</p><h1>{mode==='request'?'Recupera tu cuenta':mode==='reset'?'Elige una nueva contraseña':'Verifica tu correo'}</h1>
    <p>{mode==='request'?'Usa el mismo correo con el que registraste tu cuenta. Tus proyectos y permisos se conservan.':mode==='reset'?'Este enlace es personal y solo puede usarse una vez.':'Confirma que recibiste el enlace en tu correo.'}</p>
    {mode==='request'&&capabilities?.password_recovery_email===false&&<p className="auth-hint" role="status">El envío de correos todavía no está configurado. El administrador debe conectar un proveedor para que puedas recibir el enlace.</p>}
    {mode!=='request'&&!token&&<p role="alert">Falta el enlace de seguridad. Solicita uno nuevo desde Recuperar cuenta.</p>}
    {!done&&<form onSubmit={submit} className="auth-grid">
      {mode==='request'&&<div className="field-row"><label htmlFor="recovery-email">Correo de tu cuenta</label><input id="recovery-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></div>}
      {mode==='reset'&&<><div className="field-row"><label htmlFor="recovery-password">Nueva contraseña</label><input id="recovery-password" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={e=>setPassword(e.target.value)}/></div><div className="field-row"><label htmlFor="recovery-confirmation">Repite la nueva contraseña</label><input id="recovery-confirmation" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></div><p className="auth-hint">Al cambiarla se cerrarán las sesiones anteriores de esta cuenta.</p></>}
      <button disabled={busy||mode!=='request'&&!token||mode==='request'&&capabilities?.password_recovery_email===false}>{busy?'Procesando…':mode==='request'?'Enviar enlace de recuperación':mode==='reset'?'Guardar nueva contraseña':'Verificar mi correo'}</button>
    </form>}
    {message&&<p role="status">{message}</p>}<p><Link to="/login">Volver a iniciar sesión</Link>{mode!=='request'&&<> · <Link to="/recover-account">Solicitar otro enlace</Link></>}</p>
  </div></AccessFrame>;
}
