import { contextFromProject } from '../lib/projectContext.mjs';
import { getSessionUser } from '../lib/auth';
import { useLiveResource, useLiveRefresh } from '../lib/useLiveResource';
import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

const emptyForm = {
  name: '',
  city: '',
  region: '',
  country: 'Colombia',
  population_density: '',
  pedestrian_traffic_score: '',
  vehicle_traffic_score: '',
  purchasing_power_index: ''
};

const projectTypes = [
  ['real_estate_development', 'Desarrollo inmobiliario'],
  ['architecture_site_analysis', 'Arquitectura y análisis del sitio'],
  ['civil_engineering', 'Ingeniería civil'],
  ['construction', 'Construcción'],
  ['excavation_earthworks', 'Excavación y movimiento de tierras'],
  ['infrastructure', 'Infraestructura'],
  ['retail', 'Comercio'],
  ['logistics', 'Logística'],
  ['investment', 'Inversión'],
  ['environmental', 'Ambiental'],
  ['custom', 'Personalizado'],
];

const projectCriterionLabels = {
  market: 'Mercado', accessibility: 'Accesibilidad', risk: 'Riesgo', terrain: 'Terreno',
  infrastructure: 'Infraestructura', financial: 'Finanzas', site_geometry: 'Geometría del sitio',
  orientation: 'Orientación', access: 'Accesos', surroundings: 'Entorno', constraints: 'Restricciones',
  slope: 'Pendiente', hydrology: 'Hidrología', logistics: 'Logística', cost_inputs: 'Costos',
  elevation: 'Elevación', drainage: 'Drenaje', geometry: 'Geometría', mobility: 'Movilidad',
  environment: 'Medio ambiente', population: 'Población', competition: 'Competencia',
  protected_areas: 'Áreas protegidas',
};

const projectProfiles = {
  real_estate_development: ['market', 'accessibility', 'risk', 'terrain', 'infrastructure', 'financial'],
  architecture_site_analysis: ['site_geometry', 'orientation', 'terrain', 'access', 'surroundings', 'constraints'],
  civil_engineering: ['terrain', 'slope', 'hydrology', 'access', 'infrastructure', 'risk'],
  construction: ['terrain', 'access', 'infrastructure', 'risk', 'logistics', 'cost_inputs'],
  excavation_earthworks: ['elevation', 'slope', 'terrain', 'drainage', 'geometry'],
  infrastructure: ['access', 'terrain', 'mobility', 'environment', 'risk'],
  retail: ['population', 'access', 'mobility', 'competition', 'market'],
  logistics: ['mobility', 'access', 'infrastructure', 'terrain', 'risk'],
  investment: ['market', 'risk', 'accessibility', 'infrastructure', 'financial'],
  environmental: ['environment', 'terrain', 'hydrology', 'protected_areas', 'risk'],
  custom: [],
};

function RetailZones({ operationalContext, onNavigate, canManageProjects = false }) {
  const [zones, setZones] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [projectName, setProjectName] = useState(operationalContext?.projectDraft?.name || '');
  const [projectType, setProjectType] = useState(operationalContext?.projectDraft?.type || 'real_estate_development');
  const [projectObjective, setProjectObjective] = useState(operationalContext?.projectDraft?.objective || '');
  const [projectTerritory, setProjectTerritory] = useState(operationalContext?.territory || null);
  const [projectQuery, setProjectQuery] = useState('');
  const [submittedProjectQuery, setSubmittedProjectQuery] = useState('');
  const [projectSearchVersion, setProjectSearchVersion] = useState(0);
  const [territoryOptions, setTerritoryOptions] = useState([]);
  const [projectMessage, setProjectMessage] = useState('');
  const [projectBusy, setProjectBusy] = useState(false);

  const loadZones = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/retail-zones');
      const data = await res.json();
      setZones(data);
    } catch (error) {
      setZones([]);
      setMessage('No se pudo cargar las zonas retail.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadZones();
  }, []);

  useEffect(() => {
    const territory = operationalContext?.territory;
    setProjectTerritory(territory || null);
    const draft = operationalContext?.projectDraft;
    if (draft) { setProjectName(draft.name || ''); setProjectType(draft.type || 'real_estate_development'); setProjectObjective(draft.objective || ''); }
  }, [operationalContext?.territory, operationalContext?.projectDraft]);

  useEffect(() => {
    const query = submittedProjectQuery;
    if (query.length < 2) { setTerritoryOptions([]); return undefined; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setProjectMessage('Buscando territorio…');
      const params = new URLSearchParams({ q: query, limit: '5' });
      try {
        const response = await apiRequest(`/spatial/geocode?${params}`, { signal: controller.signal });
        const rows = await response.json();
        if (!response.ok) throw new Error(rows.error || 'No pudimos buscar el territorio.');
        if (!controller.signal.aborted) {
          setTerritoryOptions(Array.isArray(rows) ? rows : []);
          setProjectMessage('');
        }
      } catch (error) {
        if (!controller.signal.aborted) setProjectMessage(`No pudimos buscar el territorio: ${error.message}`);
      }
    }, 400);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [submittedProjectQuery, projectSearchVersion]);

  const liveProjects = useLiveResource('/analysis?limit=50');
  useEffect(() => { if (Array.isArray(liveProjects.data)) setProjects(liveProjects.data); }, [liveProjects.data]);
  useLiveRefresh(loadZones);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setMessage('');
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      population_density: form.population_density ? Number(form.population_density) : null,
      pedestrian_traffic_score: form.pedestrian_traffic_score ? Number(form.pedestrian_traffic_score) : null,
      vehicle_traffic_score: form.vehicle_traffic_score ? Number(form.vehicle_traffic_score) : null,
      purchasing_power_index: form.purchasing_power_index ? Number(form.purchasing_power_index) : null
    };

    try {
      const path = editingId ? `/retail-zones/${editingId}` : '/retail-zones';
      const method = editingId ? 'PUT' : 'POST';
      const res = await apiRequest(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error en el servidor');
      setMessage(editingId ? 'Zona actualizada correctamente.' : 'Zona creada correctamente.');
      resetForm();
      loadZones();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const handleEdit = (zone) => {
    setEditingId(zone.retail_zone_id);
    setForm({
      name: zone.name || '',
      city: zone.city || '',
      region: zone.region || '',
      country: zone.country || 'Colombia',
      population_density: zone.population_density ?? '',
      pedestrian_traffic_score: zone.pedestrian_traffic_score ?? '',
      vehicle_traffic_score: zone.vehicle_traffic_score ?? '',
      purchasing_power_index: zone.purchasing_power_index ?? ''
    });
    setMessage('');
  };

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta zona retail?')) return;
    try {
      const res = await apiRequest(`/retail-zones/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Error en el servidor');
      setMessage('Zona retail eliminada correctamente.');
      loadZones();
      resetForm();
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  const createProject = async (event) => {
    event.preventDefault();
    if (!canManageProjects) return setProjectMessage('Se requieren permisos de analista para crear proyectos.');
    if (!projectTerritory) return setProjectMessage('Selecciona o busca un territorio antes de crear el proyecto.');
    setProjectBusy(true);
    setProjectMessage('Resolviendo datos disponibles del territorio…');
    try {
      const profileCriteria = projectProfiles[projectType] || [];
      let analysisContext = { data_status: 'insufficient_data', missing_inputs: profileCriteria };
      const territoryLabel = projectTerritory.displayName || projectTerritory.name || projectTerritory.city;
      try {
        const point = projectTerritory.coordinates || [projectTerritory.lng, projectTerritory.lat];
        if (point.every((value) => value != null && Number.isFinite(Number(value)))) {
          const liveResponse = await apiRequest('/spatial/live-context?' + new URLSearchParams({ lat: point[1], lng: point[0], radiusM: '1200' }));
          if (liveResponse.ok) {
            const live = await liveResponse.json();
            analysisContext = { ...analysisContext, territory: projectTerritory, weather: live.weather, cartography: live.cartography && { ...live.cartography, geojson: undefined }, consulted_at: live.fetchedAt };
          }
        }
      } catch { /* A project draft can be saved with explicitly missing evidence. */ }
      const criteria = profileCriteria.map((key) => ({
        key,
        sourceMode: 'AUTO',
        required: false,
        weight: profileCriteria.length ? 1 / profileCriteria.length : 0,
      }));
      const response = await apiRequest('/analysis/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: projectName.trim(),
          project_type: projectType,
          objective: projectObjective.trim(),
          city: projectTerritory.city || projectTerritory.municipality || null,
          territory: projectTerritory,
          analysis_profile: { project_type: projectType, criteria },
          analysis_context: analysisContext,
        }),
      });
      const project = await response.json();
      if (!response.ok) throw new Error(project.error || 'No se pudo crear el proyecto.');
      onNavigate?.('portfolio-projects', {
        ...operationalContext,
        project,
        analysis_run_id: project.analysis_run_id,
        project_name: project.project_name,
        city: project.city,
        territory: projectTerritory,
      });
      setProjectMessage(analysisContext.data_status === 'insufficient_data'
        ? 'Proyecto creado. Hay datos incompletos; no se inventaron métricas.'
        : 'Proyecto creado con el perfil de análisis seleccionado.');
      const updated = await apiRequest('/analysis?limit=50').then((res) => res.json());
      setProjects(Array.isArray(updated) ? updated : []);
    } catch (error) {
      setProjectMessage(error.message || 'No se pudo crear el proyecto.');
    } finally {
      setProjectBusy(false);
    }
  };

  return (
    <div>
      <h2>Proyectos</h2>
      <section className="form-section">
        <h3>Nuevo proyecto</h3>
        <p className="auth-hint">El perfil propone criterios y fuentes automáticas; cualquier dato que falte se conserva como insuficiente, no se rellena con valores inventados.</p>
        <form className="entity-form" onSubmit={createProject}>
          <div className="field-row"><label>1. Nombre del proyecto</label><input value={projectName} onChange={(event) => setProjectName(event.target.value)} required placeholder="Nombre del proyecto" /></div>
          <div className="field-row"><label>2. Tipo de proyecto</label><select value={projectType} onChange={(event) => setProjectType(event.target.value)}>{projectTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="field-row"><label>3. Objetivo</label><textarea value={projectObjective} onChange={(event) => setProjectObjective(event.target.value)} required maxLength={500} placeholder="Evaluar este predio para un proyecto residencial." /></div>
          <div className="field-row">
            <label>4. Lugar del proyecto</label>
            {projectTerritory && <p>Se usará {projectTerritory.displayName || projectTerritory.name}. El lugar seleccionado ya está incluido.</p>}
            <details open={!projectTerritory}><summary>{projectTerritory ? 'Cambiar lugar' : 'Elegir lugar del proyecto'}</summary>
            <input value={projectQuery} onChange={(event) => setProjectQuery(event.target.value)} placeholder="Ciudad, dirección o lugar" />
            <div className="form-actions">
              <button type="button" className="secondary" disabled={projectQuery.trim().length < 2} onClick={() => { setSubmittedProjectQuery(projectQuery.trim()); setProjectSearchVersion((v) => v + 1); }}>Buscar territorio</button>
              <button type="button" className="secondary" disabled={!operationalContext?.territory} onClick={() => setProjectTerritory(operationalContext?.territory || null)}>Usar territorio activo</button>
              <button type="button" className="secondary" onClick={() => onNavigate?.('territorial-explorer', { ...operationalContext, projectPicker: true, projectDraft: { name: projectName, type: projectType, objective: projectObjective } })}>Seleccionar en mapa</button>
            </div>
            {territoryOptions.length > 0 && (
              <div className="candidate-list">
                {territoryOptions.map((territory) => <div className="candidate-item" key={territory.id}>
                  <span><strong>{territory.displayName}</strong><small>{territory.region || 'Región no indicada'} · {territory.country || 'País no indicado'}</small></span>
                  <button type="button" onClick={() => { setProjectTerritory(territory); setProjectQuery(''); setTerritoryOptions([]); }}>Seleccionar</button>
                </div>)}
              </div>
            )}
            {projectTerritory && <p className="auth-hint">Seleccionado: {projectTerritory.displayName || projectTerritory.name} · {projectTerritory.region || ''} · {projectTerritory.country || ''}</p>}
            </details>
          </div>
          <div className="field-row">
            <label>5. Perfil de análisis</label>
            <div className="candidate-list">
              {(projectProfiles[projectType] || []).length ? projectProfiles[projectType].map((criterion) => <div className="candidate-item" key={criterion}><span>{projectCriterionLabels[criterion] || criterion.replace(/_/g, ' ')}</span><small>Fuente automática · resolverá al crear</small></div>) : <p className="auth-hint">Perfil personalizado: se resolverán únicamente los datos disponibles para el territorio.</p>}
            </div>
          </div>
          <div className="form-actions"><button type="submit" disabled={projectBusy || !canManageProjects}>{projectBusy ? 'Resolviendo y creando…' : 'Crear proyecto'}</button></div>
        </form>
        {projectMessage && <p className="message" role="status">{projectMessage}</p>}
      </section>

      <section className="form-section">
        <div className="score-row"><h3>Proyectos operativos</h3><span className="auth-hint">{projects.length} proyectos</span></div>
        {projects.length === 0 ? <p>No hay proyectos operativos en esta organización.</p> : (
          <div className="card-grid">
            {projects.map((project) => {
              const territory = project.metadata?.territory
                || (Number(project.analysis_run_id) === Number(operationalContext?.analysis_run_id) ? operationalContext?.territory : null);
              const coordinates = territory?.coordinates || (territory?.lng != null && territory?.lat != null ? [territory.lng, territory.lat] : null);
              const projectContext = contextFromProject(project, getSessionUser().organization_id);
              return (
                <article className="card" key={project.analysis_run_id}>
                  <p className="eyebrow">Proyecto #{project.analysis_run_id}</p>
                  <h4>{project.project_name}</h4>
                  {project.metadata?.comparison_snapshot_id && <p>Análisis guardado #{project.metadata.comparison_snapshot_id} · Activos: {(project.metadata.selected_assets || []).map(asset => asset.name).join(', ') || 'Sin activos asociados'}</p>}
                  {project.metadata?.analysis_context?.version && <p>Versión del análisis: {project.metadata.analysis_context.version}{project.metadata.analysis_context.manifest_sha256 ? ' · Evidencia vinculada' : ' · Registro anterior'}</p>}
                  <p>{project.city || territory?.displayName || territory?.name || territory?.region || 'Territorio no asignado'}{territory?.country ? ` · ${territory.country}` : ''}</p>
                  <div className="form-actions">
                    <button type="button" className="secondary" disabled={!coordinates} onClick={() => onNavigate?.('territorial-explorer', { ...projectContext, longitude: coordinates?.[0], latitude: coordinates?.[1] })}>Abrir territorio</button>
                    <button type="button" className="secondary" disabled={!territory} onClick={() => onNavigate?.('earthart', projectContext)}>AirHeart</button>
                    <button type="button" className="secondary" onClick={() => onNavigate?.('portfolio-comparator', { ...projectContext, candidates: projectContext.candidates })}>{project.metadata?.comparison_snapshot_id ? 'Recuperar análisis' : 'Comparar'}</button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <details className="form-section">
        <summary>Zonas Retail (herramientas secundarias)</summary>
      <div>
        <h3>{editingId ? 'Editar zona retail' : 'Crear nueva zona retail'}</h3>
        <form onSubmit={handleSubmit} className="entity-form">
          <div className="field-row">
            <label>Nombre</label>
            <input name="name" value={form.name} onChange={handleChange} required />
          </div>
          <div className="field-row">
            <label>Ciudad</label>
            <input name="city" value={form.city} onChange={handleChange} required />
          </div>
          <div className="field-row">
            <label>Región</label>
            <input name="region" value={form.region} onChange={handleChange} />
          </div>
          <div className="field-row">
            <label>País</label>
            <input name="country" value={form.country} onChange={handleChange} />
          </div>
          <div className="field-row">
            <label>Densidad poblacional</label>
            <input name="population_density" type="number" value={form.population_density} onChange={handleChange} />
          </div>
          <div className="field-row">
            <label>Puntaje peatones</label>
            <input name="pedestrian_traffic_score" type="number" value={form.pedestrian_traffic_score} onChange={handleChange} />
          </div>
          <div className="field-row">
            <label>Puntaje vehicular</label>
            <input name="vehicle_traffic_score" type="number" value={form.vehicle_traffic_score} onChange={handleChange} />
          </div>
          <div className="field-row">
            <label>Poder adquisitivo</label>
            <input name="purchasing_power_index" type="number" value={form.purchasing_power_index} onChange={handleChange} />
          </div>
          <div className="form-actions">
            <button type="submit">{editingId ? 'Actualizar' : 'Crear'}</button>
            {editingId && <button type="button" className="secondary" onClick={resetForm}>Cancelar</button>}
          </div>
        </form>
        {message && <p className="message">{message}</p>}
      </div>

      {loading ? (
        <p>Cargando zonas retail...</p>
      ) : zones.length === 0 ? (
        <p>No hay zonas retail disponibles.</p>
      ) : (
        <div className="card-grid">
          {zones.map((zone) => (
            <div key={zone.retail_zone_id} className="card">
              <h3>{zone.name}</h3>
              <p>{zone.city}, {zone.region}</p>
              <p>Puntaje de peatones: {zone.pedestrian_traffic_score}</p>
              <p>Puntaje de compra: {zone.purchasing_power_index}</p>
              <div className="card-actions">
                <button onClick={() => handleEdit(zone)}>Editar</button>
                <button className="secondary" onClick={() => handleDelete(zone.retail_zone_id)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
      </details>
    </div>
  );
}

export default RetailZones;
