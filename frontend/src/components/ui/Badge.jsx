import React from 'react';
import './Badge.css';

/**
 * Badge Component - Small tag/label for status or categorization
 * Can be solid, outlined, or subtle variants
 */
export const Badge = ({
  children = '',
  variant = 'solid',
  color = 'primary',
  size = 'md',
  className = '',
  ...props
}) => {
  return (
    <span
      className={`badge badge-${variant} badge-${color} badge-${size} ${className}`}
      {...props}
    >
      {children}
    </span>
  );
};

export default Badge;
