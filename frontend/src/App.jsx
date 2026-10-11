import { lazy, Suspense, useState, useEffect, useMemo, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import './App.css';

// Legacy Pages
import RetailZones from './pages/RetailZones';
import RiskComponents from './pages/RiskComponents';
import Recommendations from './pages/Recommendations';
import GeoInsights from './pages/GeoInsights';
import RealEstatePortfolio from './pages/RealEstatePortfolio';
import EarthArt from './pages/EarthArt';
import RiskAssessments from './pages/RiskAssessments';
import UsersAdmin from './pages/UsersAdmin';
import PlatformArchitecture from './pages/PlatformArchitecture';
import MissionControl from './pages/MissionControl';
import LayerCatalogAdmin from './pages/LayerCatalogAdmin';
import Reports from './pages/Reports';
import AdvancedComparator from './pages/AdvancedComparator';
import AuditLogsAdmin from './pages/AuditLogsAdmin';
import ProbabilityEngine from './pages/ProbabilityEngine';

import { apiRequest } from './lib/api';
import { clearSession, getSessionUser, setSession } from './lib/auth';
import { clearStoredOperationalContext, getStoredOperationalContext, setStoredOperationalContext } from './lib/operationalContext';

const TerritorialExplorer = lazy(() => import('./pages/NativeTerritorialExplorer'));

const menu = [
  { key: 'mission-control', label: 'Centro de operaciones', group: 'Operación' },
  { key: 'territorial-explorer', label: 'Explorador territorial', group: 'Operación' },
  { key: 'earthart', label: 'EarthArt 2GIS', group: 'Operación' },
  { key: 'portfolio-assets', label: 'Activos', group: 'Portafolio' },
  { key: 'portfolio-projects', label: 'Proyectos', group: 'Portafolio' },
  { key: 'portfolio-comparator', label: 'Comparador inteligente', group: 'Portafolio' },
  { key: 'intelligence-evaluations', label: 'Evaluaciones', group: 'Inteligencia' },
  { key: 'intelligence-risks', label: 'Riesgos', group: 'Inteligencia' },
  { key: 'intelligence-opportunities', label: 'Oportunidades', group: 'Inteligencia' },
  { key: 'intelligence-recommendations', label: 'Recomendaciones', group: 'Inteligencia' },
  { key: 'probability-engine', label: 'Backstage Probability Engine', group: 'Inteligencia' },
  { key: 'reports', label: 'Informes ejecutivos', group: 'Inteligencia' },
  { key: 'admin-users', label: 'Usuarios y roles', group: 'Administración' },
  { key: 'admin-datasets', label: 'Fuentes y datasets', group: 'Administración' },
  { key: 'admin-layer-catalog', label: 'Catálogo de capas', group: 'Administración' },
  { key: 'admin-audit-logs', label: 'Auditoría de acciones', group: 'Administración' },
];

function retryAfterMinutes(response) {
  const retryAfter = response.headers.get('Retry-After');
  const seconds = Number(retryAfter);
  const delay = Number.isFinite(seconds) && seconds > 0
    ? seconds
    : Math.max(60, (Date.parse(retryAfter || '') - Date.now()) / 1000 || 60);
  return Math.max(1, Math.ceil(delay / 60));
}

function authResponseMessage(response, data, mode) {
  if (response.status === 429) return `Has realizado demasiados intentos. Puedes volver a intentarlo en ${retryAfterMinutes(response)} minutos.`;
  if (mode === 'login' && response.status === 401) return 'Correo o contraseña incorrectos.';
  if (mode === 'register' && response.status === 409) return 'Este correo ya está registrado.';
  if (response.status === 400) return data.error || 'Revisa los datos ingresados.';
  if (response.status === 503) return 'El registro no está disponible. El servicio requiere configuración o migraciones.';
  if (response.status >= 500) return 'BACKSTAGE no pudo completar la solicitud. Inténtalo más tarde.';
  return data.error || 'No se pudo completar la solicitud de autenticación.';
}

async function readAuthResponse(response) {
  if (!(response.headers.get('Content-Type') || '').toLowerCase().includes('application/json')) {
    throw new Error('El servicio de autenticación respondió con un formato inesperado.');
  }
  return response.json();
}

// Legacy App Component (original behavior)
const LegacyApp = () => {
  const navigate = useNavigate();
  const [activePage, setActivePage] = useState('mission-control');
  const [operationalContext, setOperationalContext] = useState(() => getStoredOperationalContext());
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', confirmPassword: '', organization_name: '' });
  const [authMode, setAuthMode] = useState(() => window.location.pathname === '/signup' ? 'register' : 'login');
  const [sessionUser, setSessionUser] = useState(() => getSessionUser());
  const [authMessage, setAuthMessage] = useState('');
  const [recommendation, setRecommendation] = useState('Cargando recomendación operativa...');
  const [switchingOrg, setSwitchingOrg] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const authRequestActive = useRef(false);

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

  const navigateOperational = (page, context = null) => {
    if (context) {
      const nextContext = {
        analysis_run_id: context.analysis_run_id ? Number(context.analysis_run_id) : null,
        project_name: context.project_name || null,
        city: context.city || null,
        location_id: context.location_id ? Number(context.location_id) : null,
        organization_id: sessionUser?.organization_id || null,
      };
      setOperationalContext(nextContext);
      if (nextContext.analysis_run_id) setStoredOperationalContext(nextContext);
    }
    setActivePage(page);
  };

  useEffect(() => {
    if (!sessionUser || !operationalContext?.analysis_run_id) return;

    if (
      operationalContext.organization_id &&
      Number(operationalContext.organization_id) !== Number(sessionUser.organization_id)
    ) {
      clearStoredOperationalContext();
      setOperationalContext(null);
      return;
    }

    let cancelled = false;
    apiRequest(`/analysis/${operationalContext.analysis_run_id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error('Proyecto operativo no disponible.');
        return res.json();
      })
      .then((run) => {
        if (cancelled) return;
        const validatedContext = {
          analysis_run_id: Number(run.analysis_run_id),
          project_name: run.project_name || null,
          city: run.city || null,
          location_id: operationalContext.location_id || null,
          organization_id: Number(sessionUser.organization_id),
        };
        setOperationalContext(validatedContext);
        setStoredOperationalContext(validatedContext);
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredOperationalContext();
        setOperationalContext(null);
      });

    return () => {
      cancelled = true;
    };
  }, [sessionUser?.organization_id, operationalContext?.analysis_run_id]);

  const renderPage = () => {
    switch (activePage) {
      case 'mission-control':
        return <MissionControl onNavigate={navigateOperational} />;
      case 'territorial-explorer':
        return (
          <Suspense fallback={<p className="auth-hint">Cargando motor territorial WebGL…</p>}>
            <TerritorialExplorer operationalContext={operationalContext} onNavigate={navigateOperational} />
          </Suspense>
        );
      case 'portfolio-assets':
        return <RealEstatePortfolio />;
      case 'portfolio-projects':
        return <RetailZones />;
      case 'portfolio-comparator':
        return <AdvancedComparator operationalContext={operationalContext} onNavigate={navigateOperational} />;
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
      case 'dev-architecture':
        return <PlatformArchitecture />;
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
    let response;
    try {
      response = await apiRequest('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authForm.email.trim(), password: authForm.password }),
      });
      const data = await readAuthResponse(response);
      if (!response.ok) {
        setAuthMessage(authResponseMessage(response, data, 'login'));
        return;
      }
      if (!data.token || !data.user) throw new Error('La respuesta de autenticación está incompleta.');
      setSession(data.token, data.user);
      setSessionUser(data.user);
      setAuthForm({ email: '', password: '' });
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setAuthMessage(error instanceof TypeError ? 'No pudimos conectar con BACKSTAGE.' : error.message || 'No se pudo iniciar sesión.');
    } finally {
      authRequestActive.current = false;
      setAuthBusy(false);
    }
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
    let response;
    try {
      response = await apiRequest('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: registerForm.name.trim(),
          email: registerForm.email.trim(),
          password: registerForm.password,
          organization_name: registerForm.organization_name.trim(),
        }),
      });
      const data = await readAuthResponse(response);
      if (!response.ok) {
        setAuthMessage(authResponseMessage(response, data, 'register'));
        return;
      }
      if (!data.token || !data.user || !data.organization) throw new Error('La respuesta de registro está incompleta.');
      setSession(data.token, data.user);
      setSessionUser(data.user);
      setRegisterForm({ name: '', email: '', password: '', confirmPassword: '', organization_name: '' });
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setAuthMessage(error instanceof TypeError ? 'No pudimos conectar con BACKSTAGE.' : error.message || 'No se pudo crear la cuenta.');
    } finally {
      authRequestActive.current = false;
      setAuthBusy(false);
    }
  };

  const handleLogout = () => {
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
      const data = await readAuthResponse(res);
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar de organización.');
      setSession(data.token, data.user);
      clearStoredOperationalContext();
      setOperationalContext(null);
      setSessionUser(data.user);
      setAuthMessage(`Organización activa: ${data.user.organization_name}.`);
    } catch (error) {
      setAuthMessage(`Error: ${error.message}`);
    } finally {
      setSwitchingOrg(false);
    }
  };

  const isAdmin = sessionUser?.role === 'admin';
  if (!sessionUser) {
    return (
      <div className="app app-auth">
        <section className="form-section auth-screen">
          <div className="auth-form-panel">
            <p className="eyebrow">BACKSTAGE</p>
            <h1>Acceso y registro</h1>
            <p>Ingresa o crea tu cuenta para operar proyectos, capas y análisis geoestratégico.</p>
            <div className="auth-tabs" role="tablist" aria-label="Modo de autenticación">
            <button
              type="button"
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => { setAuthMode('login'); navigate('/login'); }}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'active' : ''}
              onClick={() => { setAuthMode('register'); navigate('/signup'); }}
            >
              Crear cuenta
            </button>
            </div>

            {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="auth-grid">
              <div className="field-row">
                <label>Correo electrónico</label>
                <input
                  type="email"
                  value={authForm.email}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>
              <div className="field-row">
                <label>Contraseña</label>
                <input
                  type="password"
                  value={authForm.password}
                  onChange={(event) => setAuthForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </div>
              <div className="form-actions">
                <button type="submit" disabled={authBusy}>{authBusy ? 'Entrando…' : 'Entrar'}</button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="auth-grid">
              <div className="field-row">
                <label>Nombre</label>
                <input
                  value={registerForm.name}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Tu nombre"
                  maxLength={120}
                  required
                />
              </div>
              <div className="field-row">
                <label>Correo electrónico</label>
                <input
                  type="email"
                  value={registerForm.email}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, email: event.target.value }))}
                  required
                />
              </div>
              <div className="field-row">
                <label>Contraseña</label>
                <input
                  type="password"
                  minLength={8}
                  value={registerForm.password}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, password: event.target.value }))}
                  required
                />
              </div>
              <div className="field-row">
                <label>Confirmar contraseña</label>
                <input
                  type="password"
                  value={registerForm.confirmPassword}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, confirmPassword: event.target.value }))}
                  required
                />
              </div>
              <div className="field-row">
                <label>Nombre del espacio de trabajo</label>
                <input
                  value={registerForm.organization_name}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, organization_name: event.target.value }))}
                  placeholder="Nombre de tu organización"
                  minLength={2}
                  maxLength={120}
                  required
                />
              </div>
              <p className="auth-hint">Serás administrador de este espacio de trabajo.</p>
              <div className="form-actions">
                <button type="submit" disabled={authBusy}>{authBusy ? 'Creando cuenta…' : 'Crear cuenta'}</button>
              </div>
            </form>
          )}
            {authMessage && <p className="message" role="alert">{authMessage}</p>}
          </div>
          <aside className="auth-visual-panel" aria-hidden="true">
            <div className="auth-visual-grid" />
            <div className="auth-visual-axis auth-visual-axis-horizontal" />
            <div className="auth-visual-axis auth-visual-axis-vertical" />
            <div className="auth-visual-mark"><span /><span /><span /></div>
          </aside>
        </section>
      </div>
    );
  }

  return (
    <div className="app shell">
      <button
        type="button"
        className="mobile-nav-toggle"
        aria-label={mobileNavOpen ? 'Cerrar menú' : 'Abrir menú'}
        onClick={() => setMobileNavOpen((prev) => !prev)}
      >
        <span />
        <span />
        <span />
      </button>
      {mobileNavOpen && <div className="mobile-nav-backdrop" onClick={() => setMobileNavOpen(false)} />}
      <aside className={`side-nav ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="side-brand">
          <p className="eyebrow">Centro de operaciones</p>
          <h1>BACKSTAGE</h1>
        </div>
        <div className="identity-panel">
          <p className="identity-user">{sessionUser.name || sessionUser.email}</p>
          <p className="identity-role">Rol: <strong>{sessionUser.role}</strong></p>
          <p className="identity-role">Organización activa: <strong>{sessionUser.organization_name || 'Sin organización'}</strong></p>
          {(sessionUser.memberships || []).length > 1 && (
            <div className="field-row org-switcher">
              <label>Cambiar organización</label>
              <select
                value={sessionUser.organization_id || ''}
                onChange={(event) => handleOrganizationSwitch(event.target.value)}
                disabled={switchingOrg}
              >
                {(sessionUser.memberships || []).map((membership) => (
                  <option key={`${membership.organization_id}-${membership.role}`} value={membership.organization_id}>
                    {membership.organization_name} ({membership.role})
                  </option>
                ))}
              </select>
            </div>
          )}
          <button type="button" className="ghost-btn" onClick={handleLogout}>Cerrar sesión</button>
        </div>

        <nav className="side-menu">
          {Object.entries(groupedMenu).filter(([group]) => group === 'Operación' || group === 'Portafolio').map(([group, entries]) => (
            <div key={group} className="menu-group">
              <h3>{group}</h3>
              {entries.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={activePage === item.key ? 'active' : ''}
                  onClick={() => {
                    setActivePage(item.key);
                    setMobileNavOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
          <details className="menu-internal-tools">
            <summary>Herramientas internas</summary>
            {Object.entries(groupedMenu)
              .filter(([group]) => !['Operación', 'Portafolio'].includes(group))
              .map(([group, entries]) => {
                const visibleEntries = entries.filter((item) => isAdmin || !item.key.startsWith('admin-'));
                if (!visibleEntries.length) return null;
                return (
                  <div key={group} className="menu-group">
                    <h3>{group}</h3>
                    {visibleEntries.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        className={activePage === item.key ? 'active' : ''}
                        onClick={() => {
                          setActivePage(item.key);
                          setMobileNavOpen(false);
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                );
              })}
            {isAdmin && (
              <div className="menu-group">
                <h3>Desarrollo</h3>
                <button
                  type="button"
                  className={activePage === 'dev-architecture' ? 'active' : ''}
                  onClick={() => {
                    setActivePage('dev-architecture');
                    setMobileNavOpen(false);
                  }}
                >
                  Arquitectura (técnico)
                </button>
              </div>
            )}
          </details>
        </nav>
      </aside>

      <main className="content-panel">
        {operationalContext?.analysis_run_id && (
          <div className="active-operational-context">
            <span>Proyecto activo</span>
            <strong>{operationalContext.project_name || `Análisis #${operationalContext.analysis_run_id}`}</strong>
            <small>#{operationalContext.analysis_run_id}{operationalContext.city ? ` · ${operationalContext.city}` : ''}</small>
            <button
              type="button"
              onClick={() => {
                clearStoredOperationalContext();
                setOperationalContext(null);
              }}
            >
              Cerrar contexto
            </button>
          </div>
        )}
        {renderPage()}
      </main>
    </div>
  );
};

// All public auth URLs share the same onboarding form and session state.
function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<LegacyApp />} />
        <Route path="/login" element={<LegacyApp />} />
        <Route path="/signup" element={<LegacyApp />} />
        <Route path="/dashboard" element={<LegacyApp />} />
        
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
