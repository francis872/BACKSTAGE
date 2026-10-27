import './States.css';

export function EmptyState({ title = 'No hay resultados', description, children, tone = 'neutral', className = '', ...props }) {
  return <div {...props} className={`ui-state ui-state--${tone} ${className}`} role={tone === 'error' ? 'alert' : props.role}>
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {children && <div className="ui-state__actions">{children}</div>}
  </div>;
}
export default EmptyState;
