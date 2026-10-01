import { useState } from 'react';
import { ArrowUpRight, Bookmark, CalendarDays, MapPin } from 'lucide-react';
import { eventPath } from '../domain/eventRoutes';
import type { HomeEvent } from './HomeDiscovery';

export function DiscoveryCard({ event, scope = 'home-list', onSelect, onSave, compact = false }: {
  event: HomeEvent; scope?: string; onSelect: (id: string, focus?: string) => void; onSave?: (id: string) => void; compact?: boolean;
}) {
  const [imageState, setImageState] = useState({ url: '', failed: false, thumbnail: false });
  const failed = imageState.url === event.imageUrl && imageState.failed;
  const thumbnail = imageState.url === event.imageUrl && imageState.thumbnail;
  return <article className={`discovery-card${compact ? ' is-compact' : ''}`}>
    <a className="home-event-card" href={eventPath(event.routeId ?? event.id)} aria-label={`${event.eventName}、${event.timeLabel}、${event.venueName ?? ''}`} data-event-focus={`${scope}:${event.id}`}
      onClick={e => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onSelect(event.id, `${scope}:${event.id}`); }}>
      <span className="discovery-card__media">{event.imageUrl && !failed ? <img className={thumbnail?'is-thumbnail':undefined} src={event.imageUrl} alt="" loading="lazy" width="600" height="400" referrerPolicy="no-referrer" onLoad={e=>setImageState({url:event.imageUrl??'',failed:false,thumbnail:e.currentTarget.naturalWidth>0&&e.currentTarget.naturalWidth<480})} onError={()=>setImageState({url:event.imageUrl??'',failed:true,thumbnail:false})} /> : <span className="discovery-card__placeholder"><small>大阪の催し</small><b>{event.categoryLabel}</b><span>{event.timeLabel}</span></span>}</span>
      <span className="discovery-card__copy">
        <span className="discovery-card__eyebrow">{event.categoryLabel}<span>{event.statusLabel ?? (event.ongoing ? '開催期間中' : '開催予定')}</span></span>
        <strong>{event.eventName}</strong>
        {event.description && <span className="discovery-card__description">{event.description}</span>}
        <span className="discovery-card__fact"><CalendarDays size={15} aria-hidden="true" />{event.timeLabel}</span>
        {event.venueName && <span className="discovery-card__fact"><MapPin size={15} aria-hidden="true" />{event.venueName}</span>}
        <span className="discovery-card__footer"><span>{event.priceLabel ?? '料金は公式確認'}{event.distanceKm !== undefined && <small> · 直線 {event.distanceKm.toFixed(1)}km</small>}</span><ArrowUpRight size={18} aria-hidden="true" /></span>
      </span>
    </a>
    {onSave && <button type="button" className={`save-event${event.saved ? ' is-saved' : ''}`} aria-label={`${event.eventName}を${event.saved ? '保存から解除' : '保存'}`} aria-pressed={event.saved ?? false} onClick={() => onSave(event.id)}><Bookmark size={18} fill={event.saved ? 'currentColor' : 'none'} aria-hidden="true" /></button>}
  </article>;
}
