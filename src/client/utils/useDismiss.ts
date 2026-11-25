import { type RefObject, useEffect } from 'react';

/** Close an open popover/modal on Escape and optionally on pointerdown outside `ref`. */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  ref?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onPointerDown = (e: PointerEvent) => {
      if (ref?.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    if (ref) window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (ref) window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [open, onClose, ref]);
}
