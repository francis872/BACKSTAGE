import React from 'react';
import { FiCheckCircle, FiXCircle, FiAlertTriangle, FiInfo, FiX } from 'react-icons/fi';
import './Alert.css';

/**
 * Alert Component - Notification message with icon and close action
 * Displays success, error, warning, or info messages
 */
export const Alert = ({
  type = 'info',
  title = '',
  message = '',
  onClose = null,
  closeable = true,
  className = '',
  ...props
}) => {
  return (
    <div className={`alert alert-${type} ${className}`} role="alert" {...props}>
      <div className="alert-icon">
        {type === 'success' && <FiCheckCircle />}
        {type === 'error' && <FiXCircle />}
        {type === 'warning' && <FiAlertTriangle />}
        {type === 'info' && <FiInfo />}
      </div>
      <div className="alert-content">
        {title && <h4 className="alert-title">{title}</h4>}
        {message && <p className="alert-message">{message}</p>}
      </div>
      {closeable && (
        <button
          className="alert-close"
          onClick={onClose}
          aria-label="Close alert"
        >
          <FiX />
        </button>
      )}
    </div>
  );
};

export default Alert;
