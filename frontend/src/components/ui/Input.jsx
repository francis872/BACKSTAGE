import { forwardRef, useId } from 'react';
import './Input.css';

export const Input = forwardRef(function Input({ as: Control = 'input', label, id, type = 'text', error = false, success = false, icon = null, helperText = '', className = '', children, 'aria-describedby': describedBy, 'aria-invalid': invalid, ...props }, ref) {
  const generatedId = useId();
  const controlId = id || generatedId;
  const message = typeof error === 'string' ? error : helperText;
  const messageId = `${controlId}-help`;
  const description = [describedBy, message && messageId].filter(Boolean).join(' ') || undefined;
  return <div className={`ui-field ${error ? 'ui-field--error' : success ? 'ui-field--success' : ''} ${className}`}>
    {label && <label htmlFor={controlId}>{label}</label>}
    <div className={`ui-field__control ${icon ? 'ui-field__control--icon' : ''}`}>
      {icon && <span className="ui-field__icon" aria-hidden="true">{icon}</span>}
      <Control {...props} {...(Control === 'input' ? { type } : {})} ref={ref} id={controlId} className="ui-input" aria-invalid={error ? true : invalid} aria-describedby={description}>{children}</Control>
    </div>
    {message && <p className="ui-field__help" id={messageId}>{message}</p>}
  </div>;
});
export default Input;
