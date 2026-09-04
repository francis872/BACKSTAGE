import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

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

function FinancialAnalysisPanel({ property, onClose }) {
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
      const propertyValue = Number(property.estimated_value);
      const noi = Number(assumptions.netOperatingIncomeAnnual);
      const discountRate = Number(assumptions.discountRatePct) / 100;
      const annualCashFlow = Number(assumptions.annualCashFlow);
      const horizonYears = Number(assumptions.horizonYears);

      if (!noi || !annualCashFlow || !horizonYears) {
        throw new Error('Completa ingreso operativo neto, flujo de caja anual y horizonte para calcular.');
      }

      const cashFlows = [-propertyValue, ...Array(horizonYears).fill(annualCashFlow)];

      const [capRateRes, npvIrrRes, paybackRes] = await Promise.all([
        apiRequest('/analytics/financial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ algorithm: 'cap_rate', netOperatingIncome: noi, propertyValue }),
        }),
        apiRequest('/analytics/financial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ algorithm: 'npv_irr', cashFlows, discountRate }),
        }),
        apiRequest('/analytics/financial', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ algorithm: 'payback', cashFlows, discountRate }),
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
        irr: npvIrrData.result.irr,
        payback: paybackData.result,
        jobIds: [capRateData.analytics_job_id, npvIrrData.analytics_job_id, paybackData.analytics_job_id],
      });
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
        La inversión inicial usa el valor estimado observado ({currency.format(property.estimated_value)}).
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
          <article className="metric-card">
            <span>TIR</span>
            <strong>{result.irr.irr != null ? `${(result.irr.irr * 100).toFixed(2)}%` : 'No definida'}</strong>
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

function RealEstatePortfolio() {
  const [portfolio, setPortfolio] = useState(null);
  const [properties, setProperties] = useState([]);
  const [error, setError] = useState('');
  const [analyzingPropertyId, setAnalyzingPropertyId] = useState(null);

  useEffect(() => {
    Promise.all([
      apiRequest('/real-estate/portfolio'),
      apiRequest('/real-estate/properties')
    ])
      .then(async ([portfolioResponse, propertiesResponse]) => {
        const [portfolioData, propertiesData] = await Promise.all([
          portfolioResponse.json(),
          propertiesResponse.json()
        ]);
        if (!portfolioResponse.ok || !propertiesResponse.ok) {
          throw new Error(portfolioData.error || propertiesData.error || 'No se pudo cargar el portafolio.');
        }
        setPortfolio(portfolioData);
        setProperties(propertiesData);
      })
      .catch((loadError) => setError(loadError.message));
  }, []);

  if (error) return <p className="message">Error: {error}</p>;
  if (!portfolio) return <p>Cargando portafolio inmobiliario...</p>;

  return (
    <section>
      <h2>Portafolio inmobiliario</h2>
      <p>Ranking de lotes por potencial de desarrollo, valorización proyectada y resiliencia territorial.</p>
      <div className="metric-grid">
        <article className="metric-card"><span>Lotes analizados</span><strong>{portfolio.properties}</strong></article>
        <article className="metric-card"><span>Valor estimado</span><strong>{currency.format(portfolio.estimated_portfolio_value)}</strong></article>
        <article className="metric-card"><span>Valorización anual</span><strong>{portfolio.average_appreciation_pct}%</strong></article>
        <article className="metric-card"><span>Índice de resiliencia</span><strong>{portfolio.average_risk_score}/100</strong></article>
      </div>

      {properties.length === 0 ? (
        <p>No hay lotes inmobiliarios registrados.</p>
      ) : (
        <div className="card-grid">
          {properties.map((property) => (
            <article className="card" key={property.location_id}>
              <div className="score-row">
                <h3>{property.name}</h3>
                <span className="score">{property.investment_score}/100</span>
              </div>
              <p>{property.address}, {property.city}</p>
              <dl className="property-details">
                <div><dt>Valor estimado</dt><dd>{currency.format(property.estimated_value)}</dd></div>
                <div><dt>Área</dt><dd>{property.land_area_m2} m2</dd></div>
                <div><dt>Valorización anual</dt><dd>{property.annual_appreciation_pct}%</dd></div>
                <div><dt>Potencial de desarrollo</dt><dd>{property.development_potential}/100</dd></div>
                <div><dt>Resiliencia territorial</dt><dd>{Number(property.risk_score * 100).toFixed(0)}/100</dd></div>
                <div><dt>Uso del suelo</dt><dd>{property.zoning || 'Sin definir'}</dd></div>
              </dl>
              <div className="card-actions">
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
                <FinancialAnalysisPanel property={property} onClose={() => setAnalyzingPropertyId(null)} />
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default RealEstatePortfolio;

