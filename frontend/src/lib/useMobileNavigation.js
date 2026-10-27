import { useEffect, useRef, useState } from 'react';

// Keep the existing sidebar; disclose it accessibly when the mobile breakpoint is active.
export function useMobileNavigation(open, onClose) {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 768px)').matches);
  const triggerRef = useRef(null), panelRef = useRef(null), closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!open || !isMobile || !panelRef.current) return;
    const panel = panelRef.current;
    const previous = document.activeElement;
    (panel.querySelector('.side-menu button[aria-current="page"]') || panel.querySelector('button'))?.focus();
    const keydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); return; }
      if (event.key !== 'Tab') return;
      const controls = [triggerRef.current, ...panel.querySelectorAll('button:not(:disabled), select:not(:disabled), a[href]')].filter(element => element && element.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      if (panel.contains(document.activeElement) || document.activeElement === document.body) {
        const target = previous?.isConnected && !panel.contains(previous) ? previous : triggerRef.current;
        target?.focus({ preventScroll: true });
      }
    };
  }, [open, isMobile]);
  return { isMobile, triggerRef, panelRef };
}
