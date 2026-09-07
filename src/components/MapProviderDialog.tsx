import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialogFocus } from './useDialogFocus';

type Provider = 'apple' | 'google';

type Props = {
  open: boolean;
  eventName?: string;
  onSelect: (provider: Provider) => void;
  onClose: () => void;
};

export function MapProviderDialog({ open, eventName, onSelect, onClose }: Props) {
  const dialogRef = useDialogFocus(open);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose, open]);
  if (!open) return null;

  return createPortal(<>
    <div className="modal-scrim map-choice-scrim" aria-hidden="true" onClick={onClose} />
    <section ref={dialogRef} className="map-choice-dialog" role="dialog" aria-modal="true" aria-labelledby="map-choice-title">
      <div className="dialog-header">
        <div>
          <p className="map-choice-kicker">ROUTE</p>
          <h2 id="map-choice-title">地図アプリを選ぶ</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="閉じる"><X size={20} aria-hidden="true" /></button>
      </div>
      <p className="map-choice-description">{eventName ? `「${eventName}」への経路を開きます。` : '経路を開く地図アプリを選んでください。'}</p>
      <div className="map-choice-actions">
        <button type="button" onClick={() => onSelect('apple')}>Apple Maps</button>
        <button type="button" onClick={() => onSelect('google')}>Google Maps</button>
      </div>
      <button type="button" className="map-choice-cancel" onClick={onClose}>キャンセル</button>
    </section>
  </>, document.body);
}
