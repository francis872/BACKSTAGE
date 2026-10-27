import { coordinatesOf, belongsToTerritory } from '../lib/territory';
import { useLiveRefresh } from '../lib/useLiveResource';
import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import AnalyticsEvidence from '../components/AnalyticsEvidence';
import { decimal } from '../../../shared/decimal.mjs';

const currency = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
});

const initialAssumptions = {
  netOperatingIncomeAnnual: '',
  discountRatePct: '10',
  annualCashFlow: '',
  horizonYears: '10',
};

function FinancialAnalysisPanel({ property, projectId, onClose, onSaved }) {
  const [assumptions, setAssumptions] = useState(initialAssumptions);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setAssumptions((prev) => ({ ...prev, [name]: value }));
  };

  const runAnalysis = async (event) => {
    event.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const propertyValue = String(property.estimated_value ?? '');
      const noi = assumptions.netOperatingIncomeAnnual;
      const annualCashFlow = assumptions.annualCashFlow;
      const horizonYears = Number(assumptions.horizonYears);

      if (!noi.trim() || !annualCashFlow.trim() || !propertyValue.trim() || !Number.isInteger(horizonYears) || horizonYears < 1 || horizonYears > 40) {
        throw new Error('Completa ingreso operativo neto, flujo de caja anual y horizonte para calcular.');
      }

      const discountRate = decimal(`${decimal(assumptions.discountRatePct).text}e-2`).text;
      const initialValue = decimal(propertyValue).text;
      if (initialValue.startsWith('-') || initialValue === '0') throw Error('El valor de inversión debe ser positivo.');
      const cashFlows = [`-${initialValue}`, ...Array(horizonYears).fill(annualCashFlow)];
      const metadata = { currency: 'COP', unit: 'COP', period: 'year', rate_period: 'year', source: `Portafolio: activo #${property.location_id}; supuestos introducidos por el usuario`, data_type: 'ORGANIZATION_PROVIDED', assumptions: ['Valor del activo declarado en el portafolio; no es un avalúo certificado.', 'NOI y flujo anual constantes, definidos por el usuario.', 'Flujos igualmente espaciados al final de cada año; sin conversión monetaria.'], ...(projectId ? { analysis_run_id: projectId } : {}) };

      const [capRateRes, npvIrrRes, paybackRes] = await Promise.all([
        apiRequest('/analytics/financial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...metadata, algorithm: 'cap_rate', netOperatingIncome: noi, propertyValue }),
        }),
        apiRequest('/analytics/financial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...metadata, algorithm: 'npv_irr', cashFlows, discountRate: String(discountRate) }),
        }),
        apiRequest('/analytics/financial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...metadata, algorithm: 'payback', cashFlows, discountRate: String(discountRate) }),
        }),
      ]);
      const [capRateData, npvIrrData, paybackData] = await Promise.all([
        capRateRes.json(), npvIrrRes.json(), paybackRes.json(),
      ]);
      if (!capRateRes.ok) throw new Error(capRateData.error || 'Error calculando cap rate.');
      if (!npvIrrRes.ok) throw new Error(npvIrrData.error || 'Error calculando VPN/TIR.');
      if (!paybackRes.ok) throw new Error(paybackData.error || 'Error calculando payback.');

      setResult({
        capRate: capRateData.result.capRate,
        npv: npvIrrData.result.npv,
        npvDecimal: npvIrrData.result.npv_decimal,
        irr: npvIrrData.result.irr,
        payback: paybackData.result,
        jobIds: [capRateData.analytics_job_id, npvIrrData.analytics_job_id, paybackData.analytics_job_id],
      });
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="financial-panel">
      <div className="score-row">
        <h4>Análisis financiero — supuestos del usuario</h4>
        <button type="button" className="secondary" onClick={onClose}>Cerrar</button>
      </div>
      <p className="auth-hint">
        La inversión inicial usa el valor declarado del activo ({currency.format(property.estimated_value)}).
        El ingreso operativo neto y el flujo de caja anual son supuestos que tú defines, no datos observados.
      </p>
      <form className="entity-form" onSubmit={runAnalysis}>
        <div className="field-row">
          <label>Ingreso operativo neto anual (NOI, COP)</label>
          <input name="netOperatingIncomeAnnual" type="number" value={assumptions.netOperatingIncomeAnnual} onChange={handleChange} required />
        </div>
        <div className="field-row">
          <label>Flujo de caja anual proyectado (COP)</label>
          <input name="annualCashFlow" type="number" value={assumptions.annualCashFlow} onChange={handleChange} required />
        </div>
        <div className="field-row">
          <label>Horizonte (años)</label>
          <input name="horizonYears" type="number" min="1" max="40" value={assumptions.horizonYears} onChange={handleChange} required />
        </div>
        <div className="field-row">
          <label>Tasa de descuento anual (%)</label>
          <input name="discountRatePct" type="number" step="0.1" value={assumptions.discountRatePct} onChange={handleChange} required />
        </div>
        <div className="form-actions">
          <button type="submit" disabled={loading}>{loading ? 'Calculando...' : 'Calcular'}</button>
        </div>
      </form>
      {error && <p className="message">{error}</p>}
      {result && (
        <div className="metric-grid">
          <article className="metric-card"><span>Cap rate</span><strong>{result.capRate}%</strong></article>
          <article className="metric-card"><span>VPN (a la tasa indicada)</span><strong>{currency.format(result.npv)}</strong></article>
          <p className="auth-hint" style={{ overflowWrap: 'anywhere' }}>VPN conservado: {result.npvDecimal} COP · periodo anual · ejecuciones {result.jobIds.join(', ')}.</p>
          <article className="metric-card">
            <span>TIR</span>
            <strong>{result.irr.irr != null ? `${(result.irr.irr * 100).toFixed(2)}%` : 'No resuelta'}</strong>{result.irr.reason && <small>{result.irr.reason}</small>}
          </article>
          <article className="metric-card">
            <span>Payback simple</span>
            <strong>{result.payback.simple != null ? `${result.payback.simple} años` : 'No se recupera en el horizonte'}</strong>
          </article>
          <article className="metric-card">
            <span>Payback descontado</span>
            <strong>{result.payback.discounted != null ? `${result.payback.discounted} años` : 'No se recupera en el horizonte'}</strong>
          </article>
        </div>
      )}
    </div>
  );
}

function RealEstatePortfolio({ operationalContext, onNavigate, canManageAssets = false }) {
  const [portfolio, setPortfolio] = useState(null);
  const [properties, setProperties] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showAssetForm, setShowAssetForm] = useState(false);
  const [savingAsset, setSavingAsset] = useState(false);
  const [assetMessage, setAssetMessage] = useState('');
  const [assetForm, setAssetForm] = useState({ name: '', address: '', city: '', region: '', country: '', latitude: '', longitude: '' });
  const [analyzingPropertyId, setAnalyzingPropertyId] = useState(null);
  const [evidenceRevision, setEvidenceRevision] = useState(0);

  const loadPortfolio = async (background = false) => {
    if (!background) setLoading(true);
    setError('');
    try {
      const [portfolioResponse, propertiesResponse] = await Promise.all([
        apiRequest('/real-estate/portfolio'),
        apiRequest('/real-estate/properties'),
      ]);
      const [portfolioData, propertiesData] = await Promise.all([portfolioResponse.json(), propertiesResponse.json()]);
      if (!portfolioResponse.ok || !propertiesResponse.ok) {
        console.error('Asset portfolio API failed', { portfolioStatus: portfolioResponse.status, propertiesStatus: propertiesResponse.status, portfolioData, propertiesData });
        throw new Error('No pudimos cargar el portafolio.');
      }
      setPortfolio(portfolioData);
      setProperties(Array.isArray(propertiesData) ? propertiesData : []);
    } catch (loadError) {
      console.error('Asset portfolio request failed', loadError);
      setPortfolio(null);
      setProperties([]);
      setError('No pudimos cargar el portafolio.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPortfolio(); }, []);
  useLiveRefresh(() => loadPortfolio(true));

  useEffect(() => {
    const draft = operationalContext?.assetDraft;
    if (draft) {
      setAssetForm((current) => ({ ...current, ...draft }));
      setShowAssetForm(true);
      return;
    }
    const territory = operationalContext?.territory;
    if (!territory) return;
    const coordinates = territory.coordinates || [];
    setAssetForm((current) => ({
      ...current,
      name: current.name || territory.name || '',
      city: territory.city || '',
      region: territory.region || '',
      country: territory.country || '',
      latitude: coordinates[1] ?? territory.lat ?? current.latitude,
      longitude: coordinates[0] ?? territory.lng ?? current.longitude,
    }));
  }, [operationalContext?.territory, operationalContext?.assetDraft]);

  const propertyTerritory = (property) => ({
    id: property.location_id,
    location_id: property.location_id,
    type: 'asset',
    name: property.name,
    displayName: property.name,
    city: property.city,
    region: property.region,
    country: property.country || null,
    coordinates: [Number(property.longitude), Number(property.latitude)],
    geometry: property.geometry || null,
    source: property.metadata?.source || 'BACKSTAGE real-estate location',
  });

  const createAsset = async (event) => {
    event.preventDefault();
    setSavingAsset(true);
    setAssetMessage('');
    try {
      const latitude = assetForm.latitude === '' ? null : Number(assetForm.latitude);
      const longitude = assetForm.longitude === '' ? null : Number(assetForm.longitude);
      if ((latitude == null) !== (longitude == null) || (latitude != null && (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180))) {
        throw new Error('Las coordenadas deben ser un par WGS84 válido.');
      }
      const selectedPair = coordinatesOf(operationalContext?.territory);
      const samePoint = selectedPair && selectedPair[0] === longitude && selectedPair[1] === latitude;
      const geometry = samePoint ? assetForm.geometry || operationalContext?.territory?.geometry || { type: 'Point', coordinates: [longitude, latitude] } : latitude != null ? { type: 'Point', coordinates: [longitude, latitude] } : null;
      const associated = belongsToTerritory({ ...assetForm, latitude, longitude }, operationalContext?.territory);
      const response = await apiRequest('/locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...assetForm,
          type: 'property',
          latitude,
          longitude,
          geometry,
          metadata: {
            provenance: samePoint ? operationalContext?.territory?.provenance || null : null,
            source: samePoint ? assetForm.source || operationalContext?.territory?.source || 'Declarado por el usuario' : 'Coordenada introducida por el usuario',
            territory: associated && operationalContext?.territory ? {
              id: operationalContext.territory.id || null,
              name: operationalContext.territory.name || null,
              city: operationalContext.territory.city || null,
              region: operationalContext.territory.region || null,
              country: operationalContext.territory.country || null,
            } : null,
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No se pudo guardar el activo.');
      setAssetMessage('Activo añadido al portafolio.');
      setShowAssetForm(false);
      setAssetForm({ name: '', address: '', city: '', region: '', country: '', latitude: '', longitude: '' });
      onNavigate?.('portfolio-assets', { ...operationalContext, assetDraft: null });
      await loadPortfolio();
    } catch (saveError) {
      setAssetMessage(saveError.message || 'No se pudo guardar el activo.');
    } finally {
      setSavingAsset(false);
    }
  };

  return (
    <section>
      <h2>Portafolio inmobiliario</h2>
      <p>Activos georreferenciados y evidencia financiera disponible.</p>
      <AnalyticsEvidence key={operationalContext?.analysis_run_id || 'organization'} projectId={operationalContext?.analysis_run_id} category="financial." refreshKey={evidenceRevision} />
      {operationalContext?.territory && (
        <div className="active-operational-context">
          <span>Territorio activo</span>
          <strong>{operationalContext.territory.displayName || operationalContext.territory.name}</strong>
          <button type="button" onClick={() => onNavigate?.('territorial-explorer', operationalContext)}>Ver en mapa</button>
          <button type="button" className="secondary" onClick={() => onNavigate?.('portfolio-assets', { ...operationalContext, clearTerritory: true, assetDraft: null })}>Limpiar</button>
        </div>
      )}
      <div className="form-actions">
        {canManageAssets && <button type="button" onClick={() => setShowAssetForm((open) => !open)}>Añadir activo</button>}
        <button type="button" className="secondary" onClick={() => onNavigate?.('territorial-explorer', { ...operationalContext, assetPicker: true, assetImport: false, assetDraft: assetForm })}>Seleccionar en mapa</button>
        {canManageAssets && <button type="button" className="secondary" onClick={() => onNavigate?.('territorial-explorer', { ...operationalContext, openAdvancedTools: true, assetImport: true })}>Importar desde Explorer</button>}
      </div>
      {showAssetForm && (
        <form className="form-section entity-form" onSubmit={createAsset}>
          <h3>Añadir activo</h3>
          <div className="field-row"><label>Nombre</label><input value={assetForm.name} onChange={(event) => setAssetForm((current) => ({ ...current, name: event.target.value }))} required /></div>
          <div className="field-row"><label>Dirección o descripción</label><input value={assetForm.address} onChange={(event) => setAssetForm((current) => ({ ...current, address: event.target.value }))} /></div>
          <div className="field-row"><label>Ciudad</label><input value={assetForm.city} onChange={(event) => setAssetForm((current) => ({ ...current, city: event.target.value }))} /></div>
          <details><summary>Ubicación avanzada</summary><div className="field-row"><label>Latitud</label><input type="number" step="any" value={assetForm.latitude} onChange={(event) => setAssetForm((current) => ({ ...current, latitude: event.target.value }))} /></div><div className="field-row"><label>Longitud</label><input type="number" step="any" value={assetForm.longitude} onChange={(event) => setAssetForm((current) => ({ ...current, longitude: event.target.value }))} /></div></details>
          <div className="form-actions"><button type="submit" disabled={savingAsset}>{savingAsset ? 'Guardando…' : 'Guardar activo'}</button><button type="button" className="secondary" onClick={() => setShowAssetForm(false)}>Cancelar</button></div>
        </form>
      )}
      {assetMessage && <p className="message" role="status">{assetMessage}</p>}
      {loading ? <p className="auth-hint" role="status">Cargando activos…</p> : error ? (
        <div className="message" role="alert"><p>{error}</p><button type="button" className="secondary" onClick={loadPortfolio}>Reintentar</button></div>
      ) : !portfolio ? (
        <div className="form-section"><p>No hay activos todavía.</p>{canManageAssets && <button type="button" onClick={() => setShowAssetForm(true)}>Añadir activo</button>}</div>
      ) : null}
      {!loading && !error && portfolio && (
        <>
      <div className="metric-grid">
        <article className="metric-card"><span>Lotes analizados</span><strong>{portfolio.properties}</strong></article>
        <article className="metric-card"><span>Valor estimado</span><strong>{portfolio.estimated_portfolio_value == null ? 'Sin datos' : currency.format(portfolio.estimated_portfolio_value)}</strong></article>
        <article className="metric-card"><span>Valorización anual</span><strong>{portfolio.average_appreciation_pct == null ? 'Sin datos' : `${portfolio.average_appreciation_pct}%`}</strong></article>
        <article className="metric-card"><span>Índice de resiliencia</span><strong>{portfolio.average_risk_score == null ? 'Sin datos' : `${portfolio.average_risk_score}/100`}</strong></article>
      </div>

      {properties.length === 0 ? (
        <div className="form-section"><p>No hay activos todavía.</p>{canManageAssets && <button type="button" onClick={() => setShowAssetForm(true)}>Añadir activo</button>}</div>
      ) : (
        <div className="card-grid">
          {properties.map((property) => (
            <article className="card" key={property.location_id}>
              <div className="score-row">
                <h3>{property.name}</h3>
                <span className="score">{property.investment_score == null ? 'Sin datos' : `${property.investment_score}/100`}</span>
              </div>
              <p>{property.address}, {property.city}</p>
              <dl className="property-details">
                <div><dt>Valor estimado</dt><dd>{property.estimated_value == null ? 'Sin datos' : currency.format(property.estimated_value)}</dd></div>
                <div><dt>Área</dt><dd>{property.land_area_m2 == null ? 'Sin datos' : `${property.land_area_m2} m2`}</dd></div>
                <div><dt>Valorización anual</dt><dd>{property.annual_appreciation_pct == null ? 'Sin datos' : `${property.annual_appreciation_pct}%`}</dd></div>
                <div><dt>Potencial de desarrollo</dt><dd>{property.development_potential == null ? 'Sin datos' : `${property.development_potential}/100`}</dd></div>
                <div><dt>Resiliencia territorial</dt><dd>{property.risk_score == null ? 'Sin datos' : `${Number(property.risk_score * 100).toFixed(0)}/100`}</dd></div>
                <div><dt>Uso del suelo</dt><dd>{property.zoning || 'Sin definir'}</dd></div>
              </dl>
              <div className="card-actions">
                {property.latitude != null && property.longitude != null && (
                  <>
                    <button type="button" className="secondary" onClick={() => onNavigate?.('territorial-explorer', {
                      ...operationalContext,
                      territory: propertyTerritory(property),
                      selectedLocation: propertyTerritory(property),
                      city: property.city,
                      longitude: Number(property.longitude),
                      latitude: Number(property.latitude),
                    })}>Ver en mapa</button>
                    <button type="button" className="secondary" onClick={() => onNavigate?.('earthart', {
                      ...operationalContext,
                      territory: propertyTerritory(property),
                      city: property.city,
                      longitude: Number(property.longitude),
                      latitude: Number(property.latitude),
                    })}>AirHeart</button>
                    <button type="button" className="secondary" onClick={() => onNavigate?.('portfolio-comparator', {
                      ...operationalContext,
                      candidates: [...(operationalContext?.candidates || []), propertyTerritory(property)].slice(0, 6),
                    })}>Comparar</button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setAnalyzingPropertyId(
                    analyzingPropertyId === property.location_id ? null : property.location_id
                  )}
                >
                  {analyzingPropertyId === property.location_id ? 'Ocultar análisis financiero' : 'Analizar financieramente'}
                </button>
              </div>
              {analyzingPropertyId === property.location_id && (
                <FinancialAnalysisPanel property={property} projectId={operationalContext?.analysis_run_id} onSaved={() => setEvidenceRevision(v => v + 1)} onClose={() => setAnalyzingPropertyId(null)} />
              )}
            </article>
          ))}
        </div>
      )}
        </>
      )}
    </section>
  );
}

export default RealEstatePortfolio;

