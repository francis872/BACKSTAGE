import './Button.css';
import './States.css';

export function LoadingState({ children = 'Cargando…', className = '' }) {
  return <div className={`ui-loading ${className}`} role="status" aria-live="polite" aria-atomic="true">
    <span className="ui-spinner" aria-hidden="true" /><span>{children}</span>
  </div>;
}
export default LoadingState;
