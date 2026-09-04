import React from 'react';
import './Card.css';

/**
 * Card Component - Container for grouped content
 * Variants: solid, outlined, interactive
 * Can include header, body, footer sections
 */
export const Card = ({
  children,
  header = null,
  footer = null,
  variant = 'solid',
  hoverable = false,
  onClick = null,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`card card-${variant} ${hoverable ? 'card-hoverable' : ''} ${className}`}
      onClick={onClick}
      {...props}
    >
      {header && <div className="card-header">{header}</div>}
      <div className="card-body">{children}</div>
      {footer && <div className="card-footer">{footer}</div>}
    </div>
  );
};

export default Card;
