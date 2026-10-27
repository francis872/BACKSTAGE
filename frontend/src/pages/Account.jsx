import { useState } from 'react';
import { apiRequest } from '../lib/api';
import { hasVolatileBrowserState, getBrowserValue, setBrowserValue } from '../lib/auth';
import AccountSecurityPanel from '../components/AccountSecurityPanel';
export default function Account({ user, onProfile, onLogout, onSwitchOrganization, switching }) {
  const [name,setName]=useState(user.name||''),[phone,setPhone]=useState(user.phone||'');
  const [message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const key=`backstage:preferences:${user.user_id}:${user.organization_id}`;
  const [comfortable,setComfortable]=useState(()=>{try{return JSON.parse(getBrowserValue(key)||'{}').comfortable===true;}catch{return false;}});
  const save=async e=>{e.preventDefault();if(busy)return;setBusy(true);setMessage('');try{const r=await apiRequest('/auth/me',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:name.trim(),phone:phone.trim()})});const data=await r.json();if(!r.ok)throw Error(data.error||'No pudimos guardar tu perfil.');onProfile(data);setMessage('Tu perfil quedó guardado.');}catch(error){setMessage(error.message);}finally{setBusy(false);}};
  return <section className="account-workspace"><h2>Tu cuenta</h2><p>Tu información personal y las opciones para usar BACKSTAGE.</p>
    <form onSubmit={save} className="form-section"><h3>Perfil y contacto</h3><label htmlFor="account-name">Nombre</label><input id="account-name" value={name} required minLength="1" maxLength="120" onChange={e=>setName(e.target.value)}/><label htmlFor="account-phone">Teléfono de contacto (opcional)</label><input id="account-phone" type="tel" maxLength="40" value={phone} onChange={e=>setPhone(e.target.value)}/><p>Correo de acceso: <strong>{user.email}</strong></p><button disabled={busy}>{busy?'Guardando…':'Guardar perfil'}</button></form>
    <section className="form-section"><h3>Preferencias</h3><label><input type="checkbox" checked={comfortable} onChange={e=>{setComfortable(e.target.checked);setBrowserValue(key,JSON.stringify({comfortable:e.target.checked}));setBrowserValue('backstage:comfortable-reading:v1',e.target.checked?'true':'false');document.documentElement.dataset.reading=e.target.checked?'comfortable':'standard';}}/> Lectura cómoda</label><p>Se aplica en este navegador para tu cuenta y organización.</p>{hasVolatileBrowserState()&&<p role="status">Este navegador no permite guardar preferencias. Se conservarán mientras esta pestaña siga abierta; guarda tu trabajo en BACKSTAGE antes de salir.</p>}</section>
    <AccountSecurityPanel user={user} onLogout={onLogout}/>
    {(user.memberships||[]).length>1&&<section className="form-section"><h3>Espacio de trabajo</h3><label htmlFor="organization-switch">Cambiar organización</label><select id="organization-switch" value={user.organization_id} disabled={switching} onChange={e=>onSwitchOrganization(e.target.value)}>{user.memberships.map(m=><option key={m.organization_id} value={m.organization_id}>{m.organization_name}</option>)}</select></section>}
    {message&&<p role="status">{message}</p>}
  </section>;
}
