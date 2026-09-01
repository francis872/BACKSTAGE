import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

function LayerCatalogAdmin() {
  const [layers, setLayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let mounted = true;
    apiRequest('/layers')
      .then((res) => res.json())
      .then((data) => {
        if (!mounted) return;
        setLayers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setMessage('No se pudo cargar el catálogo de capas.');
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <section>
      <h2>Catálogo de capas</h2>
      <p>Inventario de capas disponibles para el explorador territorial.</p>
      {loading ? (
        <p>Cargando capas...</p>
      ) : (
        <div className="card-grid">
          {layers.map((layer) => (
            <article className="card" key={layer.layer_id}>
              <h3>{layer.name}</h3>
              <p>Categoría: {layer.category}</p>
              <p>Geometría: {layer.geometry_type}</p>
              <p>Fuente: {layer.source_name || 'No definida'}</p>
              <p>Confianza: {layer.confidence_level}</p>
              <p>Versión: {layer.layer_version}</p>
            </article>
          ))}
        </div>
      )}
      {message && <p className="message">{message}</p>}
    </section>
  );
}

export default LayerCatalogAdmin;
