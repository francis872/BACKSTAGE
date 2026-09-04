import React, { useState } from 'react';
import './Input.css';

/**
 * Input Component - Form field for text, email, password, etc.
 * Variants: default, error, success, disabled
 */
export const Input = React.forwardRef(
  (
    {
      type = 'text',
      placeholder = '',
      value = '',
      onChange = null,
      onFocus = null,
      onBlur = null,
      error = false,
      success = false,
      disabled = false,
      required = false,
      icon = null,
      helperText = '',
      className = '',
      ...props
    },
    ref
  ) => {
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = (e) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e) => {
      setIsFocused(false);
      onBlur?.(e);
    };

    return (
      <div className={`input-wrapper ${className}`}>
        <div className={`input-container ${error ? 'input-error' : ''} ${success ? 'input-success' : ''} ${isFocused ? 'input-focused' : ''} ${disabled ? 'input-disabled' : ''}`}>
          {icon && <span className="input-icon-left">{icon}</span>}
          <input
            ref={ref}
            type={type}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            onFocus={handleFocus}
            onBlur={handleBlur}
            disabled={disabled}
            required={required}
            className={`input-field ${icon ? 'input-has-icon' : ''}`}
            {...props}
          />
        </div>
        {helperText && (
          <p className={`input-helper ${error ? 'input-helper-error' : success ? 'input-helper-success' : ''}`}>
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
