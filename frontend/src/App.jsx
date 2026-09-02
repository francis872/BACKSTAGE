import { useEffect, useMemo, useState } from 'react';
import './App.css';
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
import TerritorialExplorer from './pages/TerritorialExplorer';
import Reports from './pages/Reports';
import AdvancedComparator from './pages/AdvancedComparator';
import AuditLogsAdmin from './pages/AuditLogsAdmin';
import { apiRequest } from './lib/api';
import { clearSession, getSessionUser, setSession } from './lib/auth';

const menu = [
  { key: 'mission-control', label: 'Centro de operaciones', group: 'BACKSTAGE' },
  { key: 'territorial-explorer', label: 'Explorador territorial', group: 'BACKSTAGE' },
  { key: 'portfolio-assets', label: 'Portafolio / Activos', group: 'Portafolio' },
  { key: 'portfolio-projects', label: 'Portafolio / Proyectos', group: 'Portafolio' },
  { key: 'portfolio-comparator', label: 'Portafolio / Comparador', group: 'Portafolio' },
  { key: 'intelligence-evaluations', label: 'Inteligencia / Evaluaciones', group: 'Inteligencia' },
  { key: 'intelligence-risks', label: 'Inteligencia / Riesgos', group: 'Inteligencia' },
  { key: 'intelligence-opportunities', label: 'Inteligencia / Oportunidades', group: 'Inteligencia' },
  { key: 'intelligence-recommendations', label: 'Inteligencia / Recomendaciones', group: 'Inteligencia' },
  { key: 'earthart', label: 'EarthArt', group: 'EarthArt' },
  { key: 'reports', label: 'Informes', group: 'Informes' },
  { key: 'admin-users', label: 'Administración / Usuarios y roles', group: 'Administración' },
  { key: 'admin-datasets', label: 'Administración / Fuentes y datasets', group: 'Administración' },
  { key: 'admin-layer-catalog', label: 'Administración / Catálogo de capas', group: 'Administración' },
  { key: 'admin-audit-logs', label: 'Administración / Auditoría de acciones', group: 'Administración' },
];

function App() {
  const [activePage, setActivePage] = useState('mission-control');
  const [authForm, setAuthForm] = useState({ email: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ name: '', email: '', password: '', organization_id: '' });
  const [authMode, setAuthMode] = useState('login');
  const [publicOrganizations, setPublicOrganizations] = useState([]);
  const [sessionUser, setSessionUser] = useState(() => getSessionUser());
  const [authMessage, setAuthMessage] = useState('');
  const [recommendation, setRecommendation] = useState('Cargando recomendación operativa...');
  const [switchingOrg, setSwitchingOrg] = useState(false);

  useEffect(() => {
    apiRequest('/recommendation/example')
      .then((res) => res.json())
      .then((data) => setRecommendation(data.message))
      .catch(() => setRecommendation('No se pudo cargar la recomendación.'));
  }, []);

  useEffect(() => {
    if (sessionUser) return;
    apiRequest('/auth/public-organizations')
      .then((res) => res.json())
      .then((data) => {
        const organizations = Array.isArray(data) ? data : [];
        setPublicOrganizations(organizations);
        if (!registerForm.organization_id && organizations.length > 0) {
          setRegisterForm((prev) => ({ ...prev, organization_id: String(organizations[0].organization_id) }));
        }
      })
      .catch(() => setPublicOrganizations([]));
  }, [sessionUser]);

  const groupedMenu = useMemo(() => {
    return menu.reduce((acc, item) => {
      if (!acc[item.group]) acc[item.group] = [];
      acc[item.group].push(item);
      return acc;
    }, {});
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'mission-control':
        return <MissionControl onNavigate={setActivePage} />;
      case 'territorial-explorer':
        return <TerritorialExplorer />;
      case 'portfolio-assets':
        return <RealEstatePortfolio />;
      case 'portfolio-projects':
        return <RetailZones />;
      case 'portfolio-comparator':
        return <AdvancedComparator />;
      case 'intelligence-evaluations':
        return <RiskAssessments />;
      case 'intelligence-risks':
        return <RiskComponents />;
      case 'intelligence-opportunities':
        return <GeoInsights />;
      case 'intelligence-recommendations':
        return <Recommendations />;
      case 'earthart':
        return <EarthArt />;
      case 'reports':
        return <Reports />;
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
    setAuthMessage('');
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(authForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión.');
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
      const payload = {
        name: registerForm.name || null,
        email: registerForm.email,
        password: registerForm.password,
      };
      if (registerForm.organization_id) {
        payload.organization_id = Number(registerForm.organization_id);
      }

      const res = await apiRequest('/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo crear la cuenta.');
      setSession(data.token, data.user);
      setSessionUser(data.user);
      setRegisterForm({ name: '', email: '', password: '', organization_id: '' });
      setAuthMessage(`Cuenta creada y sesión iniciada en ${data.user.organization_name}.`);
    } catch (error) {
      setAuthMessage(`Error: ${error.message}`);
    }
  };

  const handleLogout = () => {
    clearSession();
    setSessionUser(null);
    setAuthMessage('Sesión cerrada.');
  };

  const handleOrganizationSwitch = async (organizationId) => {
    setAuthMessage('');
    setSwitchingOrg(true);
    try {
      const res = await apiRequest('/auth/switch-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organization_id: Number(organizationId) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo cambiar de organización.');
      setSession(data.token, data.user);
      setSessionUser(data.user);
      setAuthMessage(`Organización activa: ${data.user.organization_name}.`);
    } catch (error) {
      setAuthMessage(`Error: ${error.message}`);
    } finally {
      setSwitchingOrg(false);
    }
  };

  const isAdmin = sessionUser?.role === 'admin';
  const hasOrganizations = publicOrganizations.length > 0;

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
                <label>Organización inicial</label>
                <select
                  value={registerForm.organization_id}
                  onChange={(event) => setRegisterForm((prev) => ({ ...prev, organization_id: event.target.value }))}
                  required
                  disabled={!hasOrganizations}
                >
                  {publicOrganizations.map((organization) => (
                    <option key={organization.organization_id} value={organization.organization_id}>
                      {organization.organization_name}
                    </option>
                  ))}
                </select>
              </div>
              {!hasOrganizations && (
                <p className="message">No hay organizaciones disponibles para registro en este momento.</p>
              )}
              <p className="auth-hint">El registro público crea cuentas con rol inicial de consulta.</p>
              <div className="form-actions">
                <button type="submit" disabled={!hasOrganizations}>Crear cuenta</button>
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
      <aside className="side-nav">
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
                  onClick={() => setActivePage(item.key)}
                >
                  {item.label}
                </button>
                ))}
            </div>
          ))}
          {isAdmin && (
            <div className="menu-group">
              <h3>Desarrollo</h3>
              <button type="button" className={activePage === 'dev-architecture' ? 'active' : ''} onClick={() => setActivePage('dev-architecture')}>
                Arquitectura (técnico)
              </button>
            </div>
          )}
        </nav>
      </aside>

      <main className="content-panel">{renderPage()}</main>
    </div>
  );
}

export default App;
