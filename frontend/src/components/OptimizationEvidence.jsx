import { useState } from 'react';
import { soiRequest } from '../lib/soi';
export default function OptimizationEvidence({ record, canWrite }) {
  const [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const act = async mode => {
    setBusy(true); setMessage('');
    try {
      const output = await soiRequest(`/sanitary/optimization/${record.record_id}/${mode}`, mode === 'reproduce' ? {} : undefined);
      const report = mode === 'export' ? output.verification : output.data;
      setMessage(mode === 'reproduce' ? `Búsqueda repetida: ${report.solution_validation.valid ? 'comprobación válida' : 'comprobación fallida'}. Coincidencia exacta del resultado: ${report.exact_result_matches ? 'sí' : 'no'}. El registro original se conserva.` : report.verified ? 'Evidencia y restricciones verificadas.' : `Comprobación: ${report.status}`);
      if (mode === 'export') { const url = URL.createObjectURL(new Blob([JSON.stringify(output, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `backstage-optimizacion-${record.record_id}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    } catch (e) { setMessage(e.message); } finally { setBusy(false); }
  };
  return <div className="optimization-evidence">
    <h4>Trazabilidad y reglas de la propuesta</h4>
    <p>Planificación con datos aportados; sin proveedor GPS ni tráfico en vivo. La búsqueda acotada puede devolver otra ruta válida. Una propuesta requiere aprobación antes de operar.</p>
    <p style={{ overflowWrap: 'anywhere' }}>{record.analysis?.business_rules?.version || 'Histórico sin contrato'} · {record.analysis?.spatial_reference?.crs || 'Referencia no registrada'} · {record.analysis_run_id ? `Proyecto #${record.analysis_run_id}` : 'Sin proyecto vinculado'}</p>
    <div className="form-actions"><button disabled={busy} onClick={() => act('reproducibility')}>Comprobar evidencia de rutas</button><button disabled={busy} onClick={() => act('export')}>Descargar evidencia de rutas</button>{canWrite && record.analysis && <button disabled={busy} onClick={() => act('reproduce')}>Repetir búsqueda guardada</button>}</div>
    {message && <p role="status" className="message">{message}</p>}
  </div>;
}
