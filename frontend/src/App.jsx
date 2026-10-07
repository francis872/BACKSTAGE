import { lazy, Suspense, useState, useEffect, useMemo, Component } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

// Error Boundary
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('React Error Boundary caught:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          backgroundColor: '#0f172e',
          color: '#f0f4f9',
          padding: '20px',
          fontFamily: 'system-ui, -apple-system, sans-serif'
        }}>
          <div style={{ maxWidth: '600px', textAlign: 'center' }}>
            <h1 style={{ fontSize: '24px', marginBottom: '10px' }}>⚠️ Application Error</h1>
            <p style={{ fontSize: '14px', marginBottom: '20px', color: '#a8b5c8' }}>
              The application encountered an error during initialization.
            </p>
            {this.state.error && (
              <pre style={{
                backgroundColor: '#1a2847',
                padding: '15px',
                borderRadius: '4px',
                textAlign: 'left',
                fontSize: '12px',
                overflow: 'auto',
                marginBottom: '20px',
                color: '#ff3b30'
              }}>
                {this.state.error.toString()}
              </pre>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                backgroundColor: '#2b7fff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Legacy Pages
import RetailZones from './pages/RetailZones';
import RiskComponents from './pages/RiskComponents';
import Recommendations from './pages/Recommendations';
import GeoInsights from './pages/GeoInsights';
import RealEstatePortfolio from './pages/RealEstatePortfolio';
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
import { clearSession, getSessionUser, setSession } from './lib/auth';
import { clearStoredOperationalContext, getStoredOperationalContext, setStoredOperationalContext } from './lib/operationalContext';

const TerritorialExplorer = lazy(() => import('./pages/NativeTerritorialExplorer'));

const menu = [
  { key: 'mission-control', label: 'Centro de operaciones', group: 'Operación' },
  { key: 'territorial-explorer', label: 'Explorador territorial', group: 'Operación' },
  { key: 'earthart', label: 'AirHub · Perfil territorial', group: 'Operación' },
  { key: 'portfolio-assets', label: 'Activos', group: 'Portafolio' },
  { key: 'portfolio-projects', label: 'Proyectos', group: 'Portafolio' },
  { key: 'portfolio-comparator', label: 'Comparador inteligente', group: 'Portafolio' },
  { key: 'admin-users', label: 'Usuarios y roles', group: 'Administración' },
  { key: 'admin-datasets', label: 'Fuentes de datos', group: 'Administración' },
  { key: 'admin-audit-logs', label: 'Auditoría de acciones', group: 'Administración' },
];

const BackstageApp = () => {
  const [activePage, setActivePage] = useState('mission-control');
  const [operationalContext, setOperationalContext] = useState(() => getStoredOperationalContext());
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', organization_name: '' });
  const [authMode, setAuthMode] = useState(() => window.location.pathname === '/signup' ? 'register' : 'login');
  const [sessionUser, setSessionUser] = useState(() => getSessionUser());
  const [authMessage, setAuthMessage] = useState('');
  const [recommendation, setRecommendation] = useState('Cargando recomendación operativa...');
  const [switchingOrg, setSwitchingOrg] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
        longitude: context.longitude != null && Number.isFinite(Number(context.longitude)) ? Number(context.longitude) : null,
        latitude: context.latitude != null && Number.isFinite(Number(context.latitude)) ? Number(context.latitude) : null,
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
            <TerritorialExplorer
              operationalContext={operationalContext}
              onNavigate={navigateOperational}
              canManageSpatialData={['admin', 'analyst'].includes(sessionUser?.role)}
            />
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
    setAuthMessage('');
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm),
      });
      const data = await res.json();
      if (!res.ok) {
        const retryAfter = Math.max(1, Number(res.headers.get('Retry-After') || 1));
        throw new Error(res.status === 429
          ? `${data.error || 'Demasiados intentos.'} Intenta de nuevo en ${retryAfter} s.`
          : data.error || 'No se pudo iniciar sesión.');
      }
      setSession(data.token, data.user);
      setSessionUser(data.user);
      setAuthForm({ email: '', password: '' });
      setAuthMessage(`Sesión iniciada como ${data.user.role}.`);
    } catch (error) {
      setAuthMessage(`Error: ${error.message}`);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setAuthMessage('');
    try {
      const res = await apiRequest('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm),
      });
      const data = await res.json();
      if (!res.ok) {
        const retryAfter = Math.max(1, Number(res.headers.get('Retry-After') || 1));
        throw new Error(res.status === 429
          ? `${data.error || 'Demasiados intentos.'} Intenta de nuevo en ${retryAfter} s.`
          : data.error || 'No se pudo crear la cuenta.');
      }
      setSession(data.token, data.user);
      setSessionUser(data.user);
      setAuthMessage(`Espacio de trabajo ${data.organization?.name || data.user.organization_name} creado.`);
      setRegisterForm({ name: '', email: '', password: '', organization_name: '' });
    } catch (error) {
      setAuthMessage(`Error: ${error.message}`);
    }
  };

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      clearSession();
      clearStoredOperationalContext();
      setOperationalContext(null);
      setSessionUser(null);
    }
  };

  const handleOrganizationSwitch = async (newOrgId) => {
    setSwitchingOrg(true);
    try {
      const res = await apiRequest('/auth/organization-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: newOrgId }),
      });
      const data = await res.json();
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
          <p className="eyebrow">BACKSTAGE</p>
          <h1>Acceso y registro</h1>
          <p>Ingresa o crea tu cuenta para operar proyectos, capas y análisis geoestratégico.</p>
          <div className="auth-tabs" role="tablist" aria-label="Modo de autenticación">
            <button
              type="button"
              className={authMode === 'login' ? 'active' : ''}
              onClick={() => setAuthMode('login')}
            >
              Iniciar sesión
            </button>
            <button
              type="button"
              className={authMode === 'register' ? 'active' : ''}
              onClick={() => setAuthMode('register')}
            >
              Crear cuenta
            </button>
          </div>

          {authMode === 'login' ? (
            <form onSubmit={handleLogin} className="entity-form auth-grid">
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
                <button type="submit">Entrar</button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="entity-form auth-grid">
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
                <button type="submit">Crear espacio de trabajo</button>
              </div>
            </form>
          )}
          {authMessage && <p className="message">{authMessage}</p>}
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
          {Object.entries(groupedMenu).map(([group, entries]) => (
            <div key={group} className="menu-group">
              <h3>{group}</h3>
              {entries
                .filter((item) => isAdmin || !item.key.startsWith('admin-'))
                .map((item) => (
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

// Main App Router
function App() {
  useEffect(() => {
    console.log('🚀 App component mounted');
    return () => console.log('🛑 App component unmounted');
  }, []);

  return (
    <ErrorBoundary>
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <Router>
          <Routes>
            <Route path="/login" element={<BackstageApp />} />
            <Route path="/signup" element={<BackstageApp />} />
            <Route path="/dashboard" element={<BackstageApp />} />
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
