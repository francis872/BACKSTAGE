import './Card.css';

export function Card({ as: Component = 'div', children, header = null, footer = null, variant = 'solid', hoverable = false, className = '', ...props }) {
  return <Component {...props} className={`ui-card ui-card--${variant} ${hoverable ? 'ui-card--hoverable' : ''} ${className}`}>
    {header && <div className="ui-card__header">{header}</div>}
    <div className="ui-card__body">{children}</div>
    {footer && <div className="ui-card__footer">{footer}</div>}
  </Component>;
}
export default Card;
