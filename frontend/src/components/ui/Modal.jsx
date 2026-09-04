import React from 'react';
import { FiX } from 'react-icons/fi';
import './Modal.css';

/**
 * Modal Component - Dialog overlay with configurable content
 * Shows overlay and centered modal with title, body, and footer
 */
export const Modal = ({
  isOpen = false,
  onClose = null,
  title = '',
  children = null,
  footer = null,
  closeButton = true,
  size = 'md',
  className = '',
  ...props
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className={`modal modal-${size} ${className}`}
        onClick={(e) => e.stopPropagation()}
        {...props}
      >
        <div className="modal-header">
          {title && <h2 className="modal-title">{title}</h2>}
          {closeButton && (
            <button
              className="modal-close"
              onClick={onClose}
              aria-label="Close modal"
            >
              <FiX />
            </button>
          )}
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  );
};

export default Modal;
