export default function MapLayerControl({ layers, values = {}, onChange, onManage }) {
  return <details className="map-layer-control"><summary>Capas del mapa</summary>
    <fieldset><legend>Qué quieres ver</legend>{layers.map(layer => <div className="map-layer-item" key={layer.key}>
      <label><input type="checkbox" disabled={!layer.available} checked={layer.available && values[layer.key] !== false} onChange={e => onChange(layer.key, e.target.checked)} />{layer.label}</label>
      <small>{layer.available ? layer.status || 'Disponible' : layer.reason || 'Fuente no disponible'}</small>
      {layer.manageLabel && <button type="button" className="secondary" onClick={() => onManage?.(layer.key)}>{layer.manageLabel}</button>}
      <details><summary>Fuente y leyenda</summary><p><span className="layer-legend" style={{ background: layer.color || '#E5E7EB' }} />{layer.legend || layer.label}</p><p>{layer.source || 'Sin fuente conectada'} · {layer.region || 'Cobertura según los datos disponibles'}</p><p>Actualización: {layer.updatedAt || 'La fuente no declara fecha'}</p></details>
    </div>)}</fieldset>
  </details>;
}
