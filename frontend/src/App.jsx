import { contextFromProject, restoreValidatedProjectContext } from './lib/projectContext.mjs';
import TerritoryLiveBar from './components/TerritoryLiveBar';
import { mergeOperationalContext } from './lib/territory';
import { useMobileNavigation } from './lib/useMobileNavigation';
import { lazy, Suspense, useState, useEffect, useMemo, useRef, Component } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import './App.css';
import './styles/immersive.css';
import InvitationJoin from './components/InvitationJoin';
import OrbitalEntry from './components/OrbitalEntry';
import AccessFrame from './components/AccessFrame';
import WorkspaceGuide from './components/WorkspaceGuide';
import './styles/usability.css';

import CapabilityBoundary from './components/CapabilityBoundary';
import ExplorerWorkspace from './components/ExplorerWorkspace';
import Account from './pages/Account';
import AccountRecovery from './pages/AccountRecovery';
import Feed from './pages/Feed';
import './styles/origin.css';
const ErrorBoundary = CapabilityBoundary;

// Legacy Pages
import RetailZones from './pages/RetailZones';
import RiskComponents from './pages/RiskComponents';
import Recommendations from './pages/Recommendations';
import GeoInsights from './pages/GeoInsights';
import EarthArt from './pages/EarthArt';
import RiskAssessments from './pages/RiskAssessments';
import UsersAdmin from './pages/UsersAdmin';
import MissionControl from './pages/MissionControl';
import LayerCatalogAdmin from './pages/LayerCatalogAdmin';
import Reports from './pages/Reports';
import AdvancedComparator from './pages/AdvancedComparator';
import AuditLogsAdmin from './pages/AuditLogsAdmin';
import ProbabilityEngine from './pages/ProbabilityEngine';

import { apiRequest } from './lib/api';
import { clearSession, establishSession, getSessionUser, getSessionToken, setSession, getBrowserValue } from './lib/auth';
import { clearStoredOperationalContext, getStoredOperationalContext, setStoredOperationalContext } from './lib/operationalContext';

const TerritorialExplorer = lazy(() => import('./pages/NativeTerritorialExplorer'));
import AssetsWorkspace from './pages/AssetsWorkspace';
import { CORE_NAVIGATION, selectedPage, isExplorerPage, primaryPage } from './lib/navigationRegistry.mjs';
import { MODULE_NAVIGATION, modulePage } from './modules/moduleRegistry';

const menu = CORE_NAVIGATION;

const roleLabels = { admin: 'Administrador', analyst: 'Analista', viewer: 'Consulta' };
const displayRole = (role) => roleLabels[role] || role || 'Sin rol';

function retryDelayMinutes(response) {
  const retryAfter = response.headers.get('Retry-After');
  const seconds = Number(retryAfter);
  const waitSeconds = Number.isFinite(seconds) && seconds > 0
    ? seconds
    : Math.max(60, (Date.parse(retryAfter || '') - Date.now()) / 1000 || 60);
  return Math.max(1, Math.ceil(waitSeconds / 60));
}

function authErrorMessage(response, data, mode) {
  if (response.status === 429) return `Has realizado demasiados intentos. Puedes volver a intentarlo en ${retryDelayMinutes(response)} minutos.`;
  if (mode === 'login' && response.status === 401) return 'Correo o contraseña incorrectos.';
  if (mode === 'register' && response.status === 409) return 'Este correo ya está registrado.';
  if (response.status === 400) return data.error || 'Revisa los datos ingresados.';
  if (response.status === 503) return 'El servicio de acceso no está disponible. Inténtalo nuevamente.';
  if (response.status >= 500) return 'BACKSTAGE no pudo completar la solicitud. Inténtalo más tarde.';
  return data.error || 'No se pudo completar la solicitud de autenticación.';
}

async function authResponseBody(response) {
  if (!(response.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw new Error('El servicio de autenticación respondió con un formato inesperado.');
  }
  return response.json();
}

const BackstageApp = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [activePage, setActivePage] = useState(() => selectedPage(window.location.search));
  const [operationalContext, setOperationalContext] = useState(() => getStoredOperationalContext());
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', confirmPassword: '', organization_name: '' });
  const [authMode, setAuthMode] = useState(() => window.location.pathname === '/signup' ? 'register' : 'login');
  const [sessionUser, setSessionUser] = useState(() => getSessionUser());
  useEffect(() => {
    let comfortable = false;
    try { comfortable = JSON.parse(getBrowserValue(`backstage:preferences:${sessionUser?.user_id}:${sessionUser?.organization_id}`) || '{}').comfortable === true; } catch {}
    document.documentElement.dataset.reading = comfortable ? 'comfortable' : 'standard';
  }, [sessionUser?.user_id, sessionUser?.organization_id]);
  const [authMessage, setAuthMessage] = useState('');
  const [recommendation, setRecommendation] = useState('Cargando recomendación operativa...');
  const [switchingOrg, setSwitchingOrg] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [mfaChallenge, setMfaChallenge] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const authRequestActive = useRef(false);

  useEffect(() => {
    const expired = () => {
      setMobileNavOpen(false);
      clearStoredOperationalContext();
      setOperationalContext(null);
      setSessionUser(null);
      setAuthMode('login');
      setAuthMessage('Tu sesión terminó. Vuelve a iniciar sesión para continuar.');
      navigate('/login', { replace: true });
    };
    window.addEventListener('backstage:session-expired', expired);
    return () => window.removeEventListener('backstage:session-expired', expired);
  }, [navigate]);

  useEffect(() => {
    if (!sessionUser) return;
    const controller = new AbortController(); const token = getSessionToken();
    let requestVersion=0;
    const refresh = async () => {
      const version=++requestVersion;
      try {
        const response = await apiRequest('/auth/me', {signal:controller.signal});
        if(controller.signal.aborted || getSessionToken()!==token || version!==requestVersion)return;
        if([403,404].includes(response.status)) {
          clearSession();window.dispatchEvent(new Event('backstage:session-expired'));return;
        }
        if(!response.ok)return;
        const profile=await response.json();
        if(controller.signal.aborted || getSessionToken()!==token || version!==requestVersion)return;
        setSession(token,profile);setSessionUser(profile);
      }catch { /* A temporary outage keeps the session; authorization remains server-side. */ }
    };
    refresh();const timer=setInterval(refresh,20000);window.addEventListener('focus',refresh);
    return () => {controller.abort();clearInterval(timer);window.removeEventListener('focus',refresh);};
  }, [sessionUser?.user_id, sessionUser?.organization_id]);

  useEffect(() => {
    setAuthMode(location.pathname === '/signup' ? 'register' : 'login');
    setShowPassword(false);
  }, [location.pathname]);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const { isMobile, triggerRef, panelRef } = useMobileNavigation(mobileNavOpen, () => setMobileNavOpen(false));
  const [organizationSettingsView, setOrganizationSettingsView] = useState('overview');
  useEffect(() => {
    setActivePage(selectedPage(location.search));
  }, [location.search]);

  useEffect(() => {
    apiRequest('/recommendation/example')
      .then((res) => res.json())
      .then((data) => setRecommendation(data.message))
      .catch(() => setRecommendation('No se pudo cargar la recomendación.'));
  }, []);

  const groupedMenu = useMemo(() => {
    return menu.reduce((acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, []);

  const historyContexts = useRef(new Map());
  const [contextError, setContextError] = useState('');
  const [contextRetry, setContextRetry] = useState(0);
  const navigateOperational = (page, context = null) => {
    let targetPage = page;
    if (page === 'admin-users') {
      setOrganizationSettingsView('members');
      targetPage = 'organization-settings';
    } else if (page === 'admin-datasets' || page === 'admin-layer-catalog') {
      targetPage = 'territorial-explorer';
    } else if (page === 'admin-audit-logs') {
      setOrganizationSettingsView('audit');
      targetPage = 'organization-settings';
    }
    historyContexts.current.set(location.key, { user_id: sessionUser?.user_id, organization_id: sessionUser?.organization_id, context: operationalContext });
    const nextContext=context?.clearWorkspace?null:context?mergeOperationalContext(operationalContext,context,sessionUser?.organization_id):operationalContext;
    if(context?.clearWorkspace)clearStoredOperationalContext();
    else if(nextContext)setStoredOperationalContext(nextContext);
    setOperationalContext(nextContext);setContextError('');setActivePage(targetPage);
    const params=new URLSearchParams({page:targetPage});
    if(nextContext?.analysis_run_id)params.set('project',nextContext.analysis_run_id);
    if(nextContext?.comparison_id)params.set('comparison',nextContext.comparison_id);
    navigate(`/dashboard?${params}`, {state:{workspace:{user_id:sessionUser?.user_id,organization_id:sessionUser?.organization_id,context:nextContext}}});
  };

  useEffect(() => {
    if(!sessionUser)return;
    const frame=location.state?.workspace||historyContexts.current.get(location.key);
    if(frame&&String(frame.user_id)===String(sessionUser.user_id)&&String(frame.organization_id)===String(sessionUser.organization_id)){
      setOperationalContext(frame.context);if(frame.context)setStoredOperationalContext(frame.context);else clearStoredOperationalContext();return;
    }
    const params=new URLSearchParams(location.search);
    const id=value=>/^[1-9][0-9]*$/.test(value||'')&&Number.isSafeInteger(Number(value))?Number(value):null;
    const project=id(params.get('project')),comparison=id(params.get('comparison'));
    if(project||comparison)setOperationalContext({organization_id:sessionUser.organization_id,analysis_run_id:project,comparison_id:comparison,comparison_mode:comparison?'configurable':'existing'});
  }, [location.key,sessionUser?.user_id,sessionUser?.organization_id]);

  useEffect(() => {
    if (!sessionUser) return;

    if (
      operationalContext?.organization_id &&
      Number(operationalContext.organization_id) !== Number(sessionUser.organization_id)
    ) {
      clearStoredOperationalContext();
      setOperationalContext(null);
      return;
    }
    if (!operationalContext?.analysis_run_id) return;

    let cancelled = false;
    apiRequest(`/analysis/${operationalContext.analysis_run_id}`)
      .then(async (res) => {
        if (!res.ok) { const error=new Error('No se pudo recuperar el proyecto.');error.status=res.status;throw error; }
        return res.json();
      })
      .then((run) => {
        if (cancelled) return;
        setContextError('');
        setOperationalContext(current=>{
          const validated=restoreValidatedProjectContext(current,run,sessionUser.organization_id);
          if(validated!==current)setStoredOperationalContext(validated);
          return validated;
        });
      })
      .catch(error => {
        if (cancelled) return;
        setContextError(error.message);
        if([401,403,404].includes(error.status)){clearStoredOperationalContext();setOperationalContext(null);}
      });

    return () => {
      cancelled = true;
    };
  }, [sessionUser?.user_id, sessionUser?.organization_id, operationalContext?.analysis_run_id, contextRetry]);

  const invitationJoin = <InvitationJoin initialToken={new URLSearchParams(location.hash.slice(1)).get('invitation') || ''} email={sessionUser?.email} onAccepted={async data => {
    const profile=await establishSession(data.token,data.user);
    clearStoredOperationalContext();setOperationalContext(null);setSessionUser(profile);
    navigate('/dashboard?page=organization-settings',{replace:true});
  }} />;
  const renderPage = () => {
    const ModulePage = modulePage(activePage);
    if (ModulePage) return <Suspense fallback={<p role="status">Cargando módulo…</p>}><ModulePage key={sessionUser?.organization_id} user={sessionUser} operationalContext={operationalContext} onNavigate={navigateOperational} /></Suspense>;
    switch (activePage) {
      case 'mission-control':
        return <MissionControl operationalContext={operationalContext} onNavigate={navigateOperational} />;
      case 'territorial-explorer':
        return null;
      case 'portfolio-assets':
        return <AssetsWorkspace operationalContext={operationalContext} onNavigate={navigateOperational} canManageAssets={['admin','analyst'].includes(sessionUser?.role)} />;
      case 'portfolio-projects':
        return <RetailZones operationalContext={operationalContext} onNavigate={navigateOperational} canManageProjects={['admin', 'analyst'].includes(sessionUser?.role)} />;
      case 'portfolio-comparator':
        return <AdvancedComparator operationalContext={operationalContext} onNavigate={navigateOperational} />;
      case 'profile':
        return <Account key={`${sessionUser?.user_id}:${sessionUser?.organization_id}`} user={sessionUser} onProfile={profile=>{setSession(getSessionToken(),profile);setSessionUser(profile);}} onLogout={handleLogout} onSwitchOrganization={handleOrganizationSwitch} switching={switchingOrg}/>;
      case 'feed':
        return <Feed user={sessionUser} onNavigate={navigateOperational}/>;
      case 'organization-settings':
        if (!isAdmin) return (
          <section>
            <h2>Organización</h2>
            {invitationJoin}
            <p>{sessionUser?.organization_name || 'Sin organización activa'}</p>
            <p className="auth-hint">Rol en esta organización: {displayRole(sessionUser?.role)}</p>
          </section>
        );
        return (
          <section>
            <h2>Configuración de organización</h2>
            {invitationJoin}
            <div className="form-actions" role="tablist" aria-label="Configuración de organización">
              {[
                ['overview', 'Información'],
                ['members', 'Miembros y roles'],
                ['permissions', 'Permisos'],
                ['audit', 'Auditoría'],
                ['diagnostics', 'Diagnóstico interno'],
              ].map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={organizationSettingsView === key} className={organizationSettingsView === key ? '' : 'secondary'} onClick={() => setOrganizationSettingsView(key)}>{label}</button>)}
            </div>
            {organizationSettingsView === 'overview' && <div className="form-section"><h3>{sessionUser?.organization_name || 'Organización'}</h3><p>Espacio de trabajo activo de {sessionUser?.name || sessionUser?.email}.</p><p className="auth-hint">Las fuentes y capas se administran desde el Explorador Territorial.</p></div>}
            {organizationSettingsView === 'diagnostics' && <MissionControl diagnosticsOnly onNavigate={navigateOperational}/>}
            {organizationSettingsView === 'audit' && <AuditLogsAdmin currentUser={sessionUser} />}
            {organizationSettingsView === 'members' && <UsersAdmin />}
            {organizationSettingsView === 'permissions' && <div className="form-section"><h3>Roles de organización</h3><p>Administra permisos por miembro desde Miembros y roles.</p><ul><li>Administrador: configuración del espacio y miembros</li><li>Analista: proyectos, activos y análisis</li><li>Consulta: acceso de solo lectura a resultados</li></ul><p className="auth-hint">Los permisos efectivos se asignan por membresía del servidor.</p></div>}
          </section>
        );
      case 'intelligence-evaluations':
        return <RiskAssessments operationalContext={operationalContext} onNavigate={navigateOperational} />;
      case 'intelligence-risks':
        return <RiskComponents operationalContext={operationalContext} onNavigate={navigateOperational} />;
      case 'intelligence-opportunities':
        return <GeoInsights operationalContext={operationalContext} onNavigate={navigateOperational} />;
      case 'intelligence-recommendations':
        return <Recommendations operationalContext={operationalContext} onNavigate={navigateOperational} />;
      case 'probability-engine':
        return <ProbabilityEngine onNavigate={navigateOperational} operationalContext={operationalContext} />;
      case 'earthart':
        return <EarthArt operationalContext={operationalContext} onNavigate={navigateOperational} />;
      case 'reports':
        return <Reports operationalContext={operationalContext} onNavigate={navigateOperational} />;
      case 'admin-users':
        return <UsersAdmin />;
      case 'admin-datasets':
      case 'admin-layer-catalog':
        return <LayerCatalogAdmin />;
      case 'admin-audit-logs':
        return <AuditLogsAdmin />;
      default:
        return (
          <section className="hero">
            <h2>Inteligencia territorial accionable</h2>
            <p>{recommendation}</p>
          </section>
        );
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    if (authRequestActive.current) return;
    authRequestActive.current = true;
    setAuthBusy(true);
    setAuthMessage('');
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authForm.email.trim(), password: authForm.password }),
      });
      const data = await authResponseBody(res);
      if (!res.ok) {
        setAuthMessage(authErrorMessage(res, data, 'login'));
        return;
      }
      if (data.requires_mfa) { setMfaChallenge(data.challenge); setMfaCode(''); setAuthForm(old=>({...old,password:''})); setAuthMessage('Escribe el código de tu autenticador o un código de recuperación sin usar.'); return; }
      if (!data.token || !data.user) throw new Error('La respuesta de autenticación está incompleta.');
      const verifiedUser = await establishSession(data.token, data.user);
      setSessionUser(verifiedUser);
      setAuthForm({ email: '', password: '' });
      navigate(location.hash.startsWith('#invitation=') ? `/dashboard?page=organization-settings${location.hash}` : '/dashboard', { replace: true });
    } catch (error) {
      setAuthMessage(error instanceof TypeError ? 'No pudimos conectar con BACKSTAGE.' : error.message || 'No se pudo iniciar sesión.');
    } finally {
      authRequestActive.current = false;
      setAuthBusy(false);
    }
  };

  const handleMfaLogin = async event => {
    event.preventDefault(); if (authRequestActive.current) return;
    authRequestActive.current=true;setAuthBusy(true);setAuthMessage('');
    try {
      const response=await apiRequest('/auth/mfa/verify-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge:mfaChallenge,code:mfaCode.trim()})});
      const data=await authResponseBody(response);if(!response.ok){setAuthMessage(response.status===429?`Inténtalo de nuevo en ${retryDelayMinutes(response)} minutos.`:data.error||'No se pudo comprobar el código.');return;}
      const profile=await establishSession(data.token,data.user);setSessionUser(profile);setMfaChallenge(null);setMfaCode('');setAuthForm({email:'',password:''});
      navigate(location.hash.startsWith('#invitation=')?`/dashboard?page=organization-settings${location.hash}`:'/dashboard',{replace:true});
    }catch(error){setAuthMessage(error.message||'No se pudo completar el acceso.');}
    finally{authRequestActive.current=false;setAuthBusy(false);}
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    if (authRequestActive.current) return;
    if (registerForm.password !== registerForm.confirmPassword) {
      setAuthMessage('Las contraseñas no coinciden.');
      return;
    }
    if (registerForm.password.length < 8) {
      setAuthMessage('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    authRequestActive.current = true;
    setAuthBusy(true);
    setAuthMessage('');
    try {
      const res = await apiRequest('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerForm.name.trim(),
          email: registerForm.email.trim(),
          password: registerForm.password,
          organization_name: registerForm.organization_name.trim(),
        }),
      });
      const data = await authResponseBody(res);
      if (!res.ok) {
        setAuthMessage(authErrorMessage(res, data, 'register'));
        return;
      }
      if (!data.token || !data.user || !data.organization) throw new Error('La respuesta de registro está incompleta.');
      const verifiedUser = await establishSession(data.token, data.user);
      setSessionUser(verifiedUser);
      setRegisterForm({ name: '', email: '', password: '', confirmPassword: '', organization_name: '' });
      navigate(location.hash.startsWith('#invitation=') ? `/dashboard?page=organization-settings${location.hash}` : '/dashboard', { replace: true });
    } catch (error) {
      setAuthMessage(error instanceof TypeError ? 'No pudimos conectar con BACKSTAGE.' : error.message || 'No se pudo crear la cuenta.');
    } finally {
      authRequestActive.current = false;
      setAuthBusy(false);
    }
  };

  const handleLogout = async ({serverRevoked=false}={}) => {
    if(!serverRevoked&&getSessionToken())try{await apiRequest('/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});}catch{}
    setMobileNavOpen(false);
    clearSession();
    clearStoredOperationalContext();
    setOperationalContext(null);
    setSessionUser(null);
    setAuthMode('login');
    setAuthForm({ email: '', password: '' });
    navigate('/login', { replace: true });
  };

  const handleOrganizationSwitch = async (newOrgId) => {
    setSwitchingOrg(true);
    try {
      const res = await apiRequest('/auth/switch-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: newOrgId }),
      });
      const data = await authResponseBody(res);
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar de organización.');
      const verifiedUser = await establishSession(data.token, data.user);
      clearStoredOperationalContext();
      setOperationalContext(null);
      setSessionUser(verifiedUser);
      setAuthMessage(`Organización activa: ${data.user.organization_name}.`);
    } catch (error) {
      setAuthMessage(`Error: ${error.message}`);
    } finally {
      setSwitchingOrg(false);
    }
  };

  const isAdmin = sessionUser?.role === 'admin';
  if (!sessionUser && location.pathname === '/') {
    return <OrbitalEntry onEnter={() => navigate('/login'+location.hash)} />;
  }

  if (!sessionUser) {
    return (
      <AccessFrame mode={authMode} onBack={() => navigate('/')}>
          <p className="eyebrow">BACKSTAGE</p>
          <h1 id="auth-heading">{authMode === 'login' ? 'Entra a BACKSTAGE' : 'Crea tu cuenta'}</h1>
          <p>{authMode === 'login' ? 'Escribe el correo y la contraseña de tu cuenta.' : 'Completa tus datos para organizar los proyectos de tu empresa o equipo.'}</p>
          <div className="auth-tabs" role="group" aria-label="Modo de autenticación">
            <button
              type="button"
              className={authMode === 'login' ? 'active' : ''} aria-pressed={authMode === 'login'}
              onClick={() => { setAuthMode('login'); navigate('/login'+location.hash); }}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'active' : ''} aria-pressed={authMode === 'register'}
              onClick={() => { setAuthMode('register'); navigate('/signup'+location.hash); }}
            >
              Crear cuenta
            </button>
          </div>

          {authMode === 'login' && mfaChallenge ? <form onSubmit={handleMfaLogin} className="auth-grid" aria-label="Verificar segundo factor">
            <label htmlFor="login-mfa-code">Código del autenticador o código de recuperación</label>
            <input id="login-mfa-code" autoComplete="one-time-code" required autoFocus maxLength={32} value={mfaCode} onChange={event=>setMfaCode(event.target.value)}/>
            <button type="submit" disabled={authBusy}>{authBusy?'Comprobando…':'Verificar y entrar'}</button>
            <button type="button" className="secondary" disabled={authBusy} onClick={()=>{setMfaChallenge(null);setMfaCode('');setAuthMessage('');}}>Volver al inicio de sesión</button>
          </form> : authMode === 'login' ? (
            <form onSubmit={handleLogin} className="auth-grid">
              <div className="field-row">
                <label htmlFor="login-email">Correo electrónico</label>
                <input id="login-email" name="login-email" autoComplete="email"
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>
              <div className="field-row">
                <label htmlFor="login-password">Contraseña</label>
                <input id="login-password" name="login-password" autoComplete="current-password"
                  type={showPassword ? 'text' : 'password'}
                  value={authForm.password}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
                <button type="button" className="password-visibility secondary" aria-pressed={showPassword} aria-controls="login-password" onClick={()=>setShowPassword(value=>!value)}>{showPassword?'Ocultar contraseña':'Mostrar contraseña'}</button>
              </div>
              <div className="form-actions">
                <button type="submit" disabled={authBusy}>{authBusy ? 'Entrando…' : 'Iniciar sesión'}</button>
              </div>
              <p><a href="/recover-account">¿Olvidaste tu contraseña?</a></p>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="auth-grid">
              <div className="field-row">
                <label htmlFor="register-name">Nombre</label>
                <input id="register-name" name="register-name" autoComplete="name"
                  value={registerForm.name}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Tu nombre"
                  maxLength={120}
                  required
                />
              </div>
              <div className="field-row">
                <label htmlFor="register-email">Correo electrónico</label>
                <input id="register-email" name="register-email" autoComplete="email"
                  type="email"
                  value={registerForm.email}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>
              <div className="field-row">
                <label htmlFor="register-password">Contraseña</label>
                <input id="register-password" name="register-password" autoComplete="new-password"
                  type={showPassword ? 'text' : 'password'}
                  minLength={8}
                  aria-describedby="password-requirements"
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
                <p id="password-requirements" className="auth-hint">Usa al menos 8 caracteres.</p>
              </div>
              <div className="field-row">
                <label htmlFor="register-confirm-password">Confirmar contraseña</label>
                <input id="register-confirm-password" name="register-confirm-password" autoComplete="new-password"
                  type={showPassword ? 'text' : 'password'}
                  value={registerForm.confirmPassword}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                  required
                />
                <button type="button" className="password-visibility secondary" aria-pressed={showPassword} aria-controls="register-password register-confirm-password" onClick={()=>setShowPassword(value=>!value)}>{showPassword?'Ocultar contraseñas':'Mostrar contraseñas'}</button>
              </div>
              <div className="field-row">
                <label htmlFor="register-organization">Nombre del espacio de trabajo</label>
                <input id="register-organization" name="register-organization" autoComplete="organization"
                  value={registerForm.organization_name}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, organization_name: event.target.value }))}
                  placeholder="Nombre de tu organización"
                  minLength={2}
                  maxLength={120}
                  aria-describedby="organization-help"
                  required
                />
                <p id="organization-help" className="auth-hint">El nombre de tu empresa o equipo. Aquí reunirás sus proyectos.</p>
              </div>
              <p className="auth-hint">Serás administrador de este espacio de trabajo.</p>
              <div className="form-actions">
                <button type="submit" disabled={authBusy}>{authBusy ? 'Creando cuenta…' : 'Crear cuenta'}</button>
              </div>
            </form>
          )}
          {authMessage && <p className="message" role="alert">{authMessage}</p>}
      </AccessFrame>
    );
  }

  return (
    <div className="app shell origin-shell">
      <a className="ui-skip-link" href="#backstage-main">Saltar al contenido principal</a>
      <button
        type="button"
        className="mobile-nav-toggle"
        ref={triggerRef}
        aria-expanded={mobileNavOpen}
        aria-controls="backstage-navigation"
        aria-label={mobileNavOpen ? 'Cerrar menú' : 'Abrir menú'}
        onClick={() => setMobileNavOpen((prev) => !prev)}
      >
        <span aria-hidden="true">☰</span>
        <span>{mobileNavOpen ? 'Cerrar' : 'Menú'}</span>
      </button>
      {mobileNavOpen && <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <aside id="backstage-navigation" ref={panelRef} aria-label="Panel de navegación" inert={isMobile && !mobileNavOpen ? '' : undefined} className={`side-nav ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="side-brand">
          <p className="eyebrow">Origin</p>
          <h1>BACKSTAGE</h1>
        </div>
        <nav className="side-menu" aria-label="Navegación principal">
          {Object.entries(groupedMenu).map(([group, entries]) => (
            <div key={group} className="menu-group">
              <h3>{group}</h3>
              {entries
                .map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={primaryPage(activePage) === item.key ? 'active' : ''}
                  aria-current={primaryPage(activePage) === item.key ? 'page' : undefined}
                  onClick={() => {
                    navigateOperational(item.key);
                    setMobileNavOpen(false);
                  }}
                >
                  {item.label}
                </button>
                ))}
            </div>
          ))}
        </nav>
      </aside>

      <main id="backstage-main" tabIndex={-1} inert={isMobile && mobileNavOpen ? '' : undefined} className="content-panel" key={`${sessionUser.user_id}:${sessionUser.organization_id}`}>
        <header className="origin-topbar"><div><strong>BACKSTAGE</strong><span>{sessionUser.organization_name || 'Tu organización'}</span></div><div><button type="button" className="secondary" onClick={()=>navigateOperational('feed')}>Actividad</button><button type="button" className="secondary" onClick={()=>navigateOperational('profile')}>Cuenta</button></div></header>
        <div hidden={!isExplorerPage(activePage)} className="explorer-workspace-frame">
          <TerritoryLiveBar compact operationalContext={operationalContext} onSelect={territory=>navigateOperational('territorial-explorer',{territory,preserveProject:true})} onOpenProject={project=>navigateOperational('portfolio-projects',contextFromProject(project,sessionUser.organization_id))}/>
          {contextError && <div role="alert" className="message"><p>{contextError}</p><button type="button" onClick={()=>setContextRetry(v=>v+1)}>Recuperar proyecto</button></div>}
          <ExplorerWorkspace page={isExplorerPage(activePage)?activePage:'territorial-explorer'} context={operationalContext} user={sessionUser} onNavigate={navigateOperational} onCameraChange={mapContext=>{setOperationalContext(old=>{const next={...old,organization_id:sessionUser.organization_id,mapContext};setStoredOperationalContext(next);return next;});}} panel={isExplorerPage(activePage)?renderPage():null}/>
        </div>
        {!isExplorerPage(activePage)&&<div className="origin-account-content"><CapabilityBoundary name={activePage} resetKey={activePage}>{renderPage()}</CapabilityBoundary></div>}

      </main>
    </div>
  );
};

// Main App Router
function App() {
  useEffect(() => {
    console.log('🚀 App component mounted');
    return () => console.log('🛑 App component unmounted');
  }, []);

  return (
    <ErrorBoundary>
      <div className="app-route-frame">
        <Router>
          <Routes>
            <Route path="/login" element={<BackstageApp />} />
            <Route path="/signup" element={<BackstageApp />} />
            <Route path="/recover-account" element={<AccountRecovery />} />
            <Route path="/reset-password" element={<AccountRecovery />} />
            <Route path="/verify-email" element={<AccountRecovery />} />
            <Route path="/dashboard" element={<BackstageApp />} />
            <Route path="/soi" element={<Navigate to="/dashboard?page=soi" replace />} />
            <Route path="/soi/routes" element={<Navigate to="/dashboard?page=soi-routes" replace />} />
            <Route path="/clean-com" element={<Navigate to="/dashboard?page=clean-com" replace />} />
            <Route path="/" element={<BackstageApp />} />
            
            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Router>
      </div>
    </ErrorBoundary>
  );
}

export default App;
