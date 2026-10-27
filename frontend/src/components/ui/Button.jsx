import { forwardRef } from 'react';
import './Button.css';

export const Button = forwardRef(function Button({ children, variant = 'primary', size = 'md', disabled = false, loading = false, icon = null, className = '', type = 'button', ...props }, ref) {
  return <button {...props} ref={ref} type={type} className={`ui-button ui-button--${variant} ui-button--${size} ${className}`} disabled={disabled || loading} aria-busy={loading || undefined}>
    {loading ? <span className="ui-spinner" aria-hidden="true" /> : icon && <span aria-hidden="true">{icon}</span>}
    <span>{children}</span>
  </button>;
});
export default Button;
