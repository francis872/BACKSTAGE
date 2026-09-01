import { useEffect, useState } from 'react';
import { apiUrl } from '../lib/api';

const currency = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0
});

function RealEstatePortfolio() {
  const [portfolio, setPortfolio] = useState(null);
  const [properties, setProperties] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch(apiUrl('/real-estate/portfolio')),
      fetch(apiUrl('/real-estate/properties'))
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
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default RealEstatePortfolio;
