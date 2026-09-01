import { useEffect, useRef } from 'react';

/** Keep keyboard and assistive-technology focus within the active sheet. */
export function useDialogFocus(open: boolean) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const previous = document.activeElement as HTMLElement | null;
    const siblings = [...(dialog.parentElement?.children ?? [])].filter((node): node is HTMLElement => node instanceof HTMLElement && node !== dialog);
    const original = siblings.map((node) => node.inert);
    siblings.forEach((node) => { node.inert = true; });
    const focusable = () => [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input,select,[tabindex="0"]')];
    focusable()[0]?.focus({ preventScroll: true });
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener('keydown', trap);
    return () => {
      dialog.removeEventListener('keydown', trap);
      siblings.forEach((node, index) => { node.inert = original[index]; });
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open]);
  return ref;
}
