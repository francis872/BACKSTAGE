import { useEffect, useState } from 'react';
import './App.css';
import RetailZones from './pages/RetailZones';
import RiskComponents from './pages/RiskComponents';
import Recommendations from './pages/Recommendations';
import GeoInsights from './pages/GeoInsights';
import RealEstatePortfolio from './pages/RealEstatePortfolio';
import EarthArt from './pages/EarthArt';
import { apiUrl } from './lib/api';

function App() {
  const [recommendation, setRecommendation] = useState('Cargando recomendación...');
  const [activePage, setActivePage] = useState('home');

  useEffect(() => {
    fetch(apiUrl('/recommendation/example'))
      .then((res) => res.json())
      .then((data) => setRecommendation(data.message))
      .catch(() => setRecommendation('No se pudo cargar la recomendación.'));
  }, []);

  const renderPage = () => {
    switch (activePage) {
      case 'retail':
        return <RetailZones />;
      case 'risk':
        return <RiskComponents />;
      case 'recommendations':
        return <Recommendations />;
      case 'geo':
        return <GeoInsights />;
      case 'real-estate':
        return <RealEstatePortfolio />;
      case 'earthart':
        return <EarthArt />;
      default:
        return (
          <section className="hero">
            <h2>Inteligencia para inversión inmobiliaria</h2>
            <p>Evalúa lotes con valorización, potencial urbanístico y riesgo territorial en un solo flujo de decisión.</p>
            <p>{recommendation}</p>
          </section>
        );
    }
  };

  return (
    <div className="app">
      <header>
        <h1>BACKSTAGE Intelligence</h1>
        <p>Decision intelligence para ubicación, inversión y riesgos.</p>
      </header>
      <nav className="nav-bar">
        <button onClick={() => setActivePage('home')} className={activePage === 'home' ? 'active' : ''}>Inicio</button>
        <button onClick={() => setActivePage('real-estate')} className={activePage === 'real-estate' ? 'active' : ''}>Inmobiliario</button>
        <button onClick={() => setActivePage('risk')} className={activePage === 'risk' ? 'active' : ''}>Riesgos</button>
        <button onClick={() => setActivePage('recommendations')} className={activePage === 'recommendations' ? 'active' : ''}>Recomendaciones</button>
        <button onClick={() => setActivePage('geo')} className={activePage === 'geo' ? 'active' : ''}>Geo Insights</button>
        <button onClick={() => setActivePage('earthart')} className={activePage === 'earthart' ? 'active' : ''}>EarthArt</button>
      </nav>
      <main>{renderPage()}</main>
    </div>
  );
}

export default App;
