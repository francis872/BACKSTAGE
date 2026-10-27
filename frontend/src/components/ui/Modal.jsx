import { useId, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Button from './Button';
import './Modal.css';

export function Modal({ isOpen = false, onClose, title = '', children, footer = null, closeButton = true, size = 'md', className = '', ...props }) {
  const dialogRef = useRef(null);
  const titleId = useId();
  useLayoutEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [isOpen]);
  if (!isOpen) return null;
  return createPortal(<dialog {...props} ref={dialogRef} className={`ui-dialog ui-dialog--${size} ${className}`} aria-labelledby={title ? titleId : undefined} aria-label={title ? undefined : props['aria-label'] || 'Diálogo'} onKeyDown={event => {
    props.onKeyDown?.(event);
    if (event.defaultPrevented || event.key !== 'Tab') return;
    const controls = [...event.currentTarget.querySelectorAll('button, input, select, textarea, a[href], [tabindex]')].filter(element => !element.disabled && element.tabIndex >= 0 && element.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    if (!first) { event.preventDefault(); event.currentTarget.focus(); }
    else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }} onCancel={event => { event.preventDefault(); onClose?.(); }} onClick={event => {
    const box = event.currentTarget.getBoundingClientRect();
    if (event.target === event.currentTarget && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) onClose?.();
  }}>
    <div className="ui-dialog__header">
      {title && <h2 id={titleId}>{title}</h2>}
      {closeButton && <Button variant="ghost" onClick={onClose} aria-label="Cerrar diálogo">×</Button>}
    </div>
    <div className="ui-dialog__body">{children}</div>
    {footer && <div className="ui-dialog__footer">{footer}</div>}
  </dialog>, document.body);
}
export default Modal;
