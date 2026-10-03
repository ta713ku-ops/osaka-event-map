import { useState } from 'react';
import { ArrowUpRight, Bookmark, CalendarDays, MapPin, TicketCheck } from 'lucide-react';
import { eventImageIsPortrait, eventMediaKind, isLowResolutionEventImage, normalizeDisplayText, type EventMediaKind } from '../domain/eventPresentation';
import { eventPath } from '../domain/eventRoutes';
import type { HomeEvent } from './HomeDiscovery';
import './discovery-card.css';

type ImageState = {
  url: string;
  failed: boolean;
  kind: EventMediaKind;
  portrait: boolean;
  lowResolution: boolean;
};

export function DiscoveryCard({ event, scope = 'home-list', onSelect, onSave, compact = false }: {
  event: HomeEvent;
  scope?: string;
  onSelect: (id: string, focus?: string) => void;
  onSave?: (id: string) => void;
  compact?: boolean;
}) {
  const [imageState, setImageState] = useState<ImageState>({
    url: '', failed: false, kind: 'photo', portrait: false, lowResolution: false,
  });
  const image = event.imageUrl?.trim();
  const sourceEvent = { imageUrl: image, imageSource: event.imageSource };
  const hasMatchingState = imageState.url === image;
  const failed = Boolean(image && hasMatchingState && imageState.failed);
  const hasImage = Boolean(image) && !failed && eventMediaKind(sourceEvent) !== 'none';
  const mediaKind = hasMatchingState ? imageState.kind : eventMediaKind(sourceEvent);
  const portrait = hasMatchingState && imageState.portrait;
  const lowResolution = hasMatchingState && imageState.lowResolution;
  const status = normalizeDisplayText(event.statusLabel ?? (event.ongoing ? '開催期間中' : '開催予定'));
  const warningStatus = /中止|延期|完売|受付終了|休催|開催なし|最新状況|日程未確認/u.test(status);
  const showDistance = /(?:^|[-_])distance(?:$|[-_])/iu.test(scope);
  const price = event.priceLabel ? normalizeDisplayText(event.priceLabel).replace(/[\s\u3000]+/gu, ' ').trim() : '料金は公式情報で確認';
  const focusId = `${scope}:${event.id}`;

  return <article className={`discovery-card${compact ? ' is-compact' : ''}${hasImage ? '' : ' is-no-image'}${warningStatus ? ' has-warning' : ''}`}>
    <a className="home-event-card" href={eventPath(event.routeId ?? event.id)} aria-label={`${event.eventName}、${event.timeLabel}、${event.venueName ?? ''}`} data-event-focus={focusId}
      onClick={e => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); onSelect(event.id, focusId); }}>
      {hasImage && image && <span className={`discovery-card__media is-${mediaKind}${portrait ? ' is-portrait' : ''}${lowResolution ? ' is-low-resolution' : ''}`}>
        <img src={image} alt="" loading="lazy" width="600" height="400" referrerPolicy="no-referrer"
          onLoad={e => {
            const dimensions = { width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight };
            setImageState({
              url: image,
              failed: false,
              kind: eventMediaKind(sourceEvent, dimensions),
              portrait: eventImageIsPortrait(dimensions),
              lowResolution: isLowResolutionEventImage(dimensions),
            });
          }}
          onError={() => setImageState({ url: image, failed: true, kind: 'none', portrait: false, lowResolution: false })} />
        {mediaKind === 'poster' && <em className="discovery-card__media-label">ポスター</em>}
      </span>}
      <span className="discovery-card__copy">
        <span className={`discovery-card__status${warningStatus ? ' is-warning' : ''}`}>{status}</span>
        <strong>{normalizeDisplayText(event.eventName)}</strong>
        {event.reservationRequired === true && <span className="discovery-card__reservation"><TicketCheck size={14} aria-hidden="true" />要予約</span>}
        {event.description && !compact && <span className="discovery-card__description">{normalizeDisplayText(event.description)}</span>}
        <span className="discovery-card__fact"><CalendarDays size={15} aria-hidden="true" />{normalizeDisplayText(event.timeLabel)}</span>
        {event.venueName && <span className="discovery-card__fact"><MapPin size={15} aria-hidden="true" />{normalizeDisplayText(event.venueName)}</span>}
        <span className="discovery-card__footer">
          <span className="discovery-card__price">{price}{showDistance && event.distanceKm !== undefined && <small> · 直線 {event.distanceKm.toFixed(1)}km</small>}</span>
          <ArrowUpRight size={18} aria-hidden="true" />
        </span>
      </span>
    </a>
    {onSave && <button type="button" className={`save-event${event.saved ? ' is-saved' : ''}`} aria-label={`${event.eventName}を${event.saved ? '保存から解除' : '保存'}`} aria-pressed={event.saved ?? false} onClick={() => onSave(event.id)}><Bookmark size={18} fill={event.saved ? 'currentColor' : 'none'} aria-hidden="true" /></button>}
  </article>;
}
