import { useEffect, useState } from 'react';
import { ArrowRight, Clock, MapPin, Navigation, X } from 'lucide-react';
import { CATEGORY_LABELS, hasCoordinates } from '../domain';
import type { EventItem } from '../types';
import { useDialogFocus } from './useDialogFocus';
import { MapProviderDialog } from './MapProviderDialog';

export type EventSheetEvent = Partial<EventItem> & {
  eventName?: string;
  distanceKm?: number;
  travelMinutes?: number;
  ongoing?: boolean;
};

type Props = {
  event: EventSheetEvent | null;
  onClose: () => void;
  onOpenDetail?: () => void;
  onNavigate?: (provider: 'apple' | 'google') => void;
};

const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';
const dateLabel = (event: EventSheetEvent) => {
  if (!present(event.startDate)) return '';
  const start = event.startDate!.replaceAll('-', '/');
  const end = present(event.endDate) && event.endDate !== event.startDate ? ` — ${event.endDate!.replaceAll('-', '/')}` : '';
  const time = present(event.startTime) ? `　${event.startTime}${present(event.endTime) ? `–${event.endTime}` : ''}` : '';
  return `${start}${end}${time}`;
};

export function EventSheet({ event, onClose, onOpenDetail, onNavigate }: Props) {
  const dialogRef = useDialogFocus(!!event);
  const [imageFailed, setImageFailed] = useState(false);
  const [mapChoiceOpen, setMapChoiceOpen] = useState(false);
  useEffect(() => setImageFailed(false), [event?.imageUrl]);
  useEffect(() => {
    if (!event) return;
    const close = (keyboardEvent: KeyboardEvent) => keyboardEvent.key === 'Escape' && !mapChoiceOpen && onClose();
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [event, mapChoiceOpen, onClose]);
  if (!event) return null;

  const canNavigate = hasCoordinates(event) || present(event.address) || present(event.venueName);
  const maps = (provider: 'apple' | 'google') => {
    if (!canNavigate) return;
    if (onNavigate) return onNavigate(provider);
    const destination = hasCoordinates(event) ? `${event.latitude},${event.longitude}` : event.address || event.venueName || '';
    window.open(`${provider === 'apple' ? 'https://maps.apple.com/?q=' : 'https://www.google.com/maps/search/?api=1&query='}${encodeURIComponent(destination)}`, '_blank', 'noopener,noreferrer');
  };
  const openMapChoice = () => { if (canNavigate) setMapChoiceOpen(true); };

  return <section ref={dialogRef} className="event-sheet event-preview-sheet" role="dialog" aria-modal="true" aria-label="地図のイベント概要">
    <button type="button" className="sheet-close" onClick={onClose} aria-label="閉じる"><X size={20} aria-hidden="true" /></button>
    {present(event.imageUrl) && !imageFailed && <figure className="event-sheet-media"><img className="event-sheet-image" src={event.imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /></figure>}
    <div className="event-sheet-body">
      <div className="event-sheet-kicker">{event.ongoing && <span className="live-badge">開催期間中</span>}{present(event.category) && (CATEGORY_LABELS[event.category!] ?? event.category)}</div>
      <h2>{event.eventName || 'イベント'}</h2>
      {present(event.venueName) && <p className="event-meta"><MapPin size={16} aria-hidden="true" />{event.venueName}</p>}
      {present(dateLabel(event)) && <p className="event-meta"><Clock size={16} aria-hidden="true" />{dateLabel(event)}</p>}
      {(Number.isFinite(event.distanceKm) || Number.isFinite(event.travelMinutes)) && <p className="event-meta"><Navigation size={16} aria-hidden="true" />{Number.isFinite(event.distanceKm) && `${event.distanceKm!.toFixed(1)} km`}{Number.isFinite(event.distanceKm) && Number.isFinite(event.travelMinutes) && ' ・ '}{Number.isFinite(event.travelMinutes) && `移動 約${event.travelMinutes}分`}</p>}
      <div className="event-preview-actions">
        {onOpenDetail && <button type="button" className="event-preview-detail" onClick={onOpenDetail}>詳しく見る <ArrowRight size={18} aria-hidden="true" /></button>}
        <button type="button" disabled={!canNavigate} onClick={openMapChoice}>{canNavigate ? '経路を見る' : '経路案内なし'}</button>
      </div>
      {!canNavigate && <p className="event-navigation-note">住所・会場情報が未確認です。</p>}
    </div>
    <MapProviderDialog open={mapChoiceOpen} eventName={event.eventName} onClose={() => setMapChoiceOpen(false)} onSelect={(provider) => { setMapChoiceOpen(false); maps(provider); }} />
  </section>;
}
