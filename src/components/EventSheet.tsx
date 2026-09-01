import { useEffect, useState } from 'react';
import { useDialogFocus } from './useDialogFocus';
import { ArrowRight, Car, Clock, ExternalLink, MapPin, Navigation, X } from 'lucide-react';

export type EventSheetEvent = {
  id?: string; eventName?: string; venueName?: string; category?: string;
  address?: string; description?: string; startDate?: string; endDate?: string;
  startTime?: string; endTime?: string; price?: string | number | null; freeEvent?: boolean | null;
  indoor?: boolean | null; outdoor?: boolean | null; rainSupport?: boolean | null; parking?: boolean | null;
  officialUrl?: string; imageUrl?: string; imageSourceUrl?: string; distanceKm?: number; travelMinutes?: number;
  recommendation?: number; recommendationReasons?: string[];
  ongoing?: boolean;
};

type Props = { event: EventSheetEvent | null; onClose: () => void; onNavigate?: (provider: 'apple' | 'google') => void };

const present = (v: unknown) => v !== undefined && v !== null && String(v).trim() !== '';
const dateLabel = (e: EventSheetEvent) => {
  if (!present(e.startDate)) return '';
  const start = e.startDate!.replace(/-/g, '/'); const end = present(e.endDate) ? `〜 ${e.endDate!.replace(/-/g, '/')}` : '';
  return `${start}${end}${present(e.startTime) ? `　${e.startTime}${present(e.endTime) ? `–${e.endTime}` : ''}` : ''}`;
};
const categoryLabels: Record<string, string> = {
  festival: '祭り・フェス', fireworks: '花火', shopping: 'ショッピング', zoo: 'いきもの', aquarium: '水族館',
  amusement: '遊園地', themePark: 'テーマパーク', food: 'グルメ', market: 'マルシェ', fleaMarket: 'フリーマーケット',
  exhibition: '展覧会', museum: '博物館', workshop: '体験・教室', seasonal: '季節イベント',
  illumination: 'イルミネーション', night: '夜イベント',
};

export function EventSheet({ event, onClose, onNavigate }: Props) {
  const dialogRef = useDialogFocus(!!event);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [event?.imageUrl]);
  useEffect(() => { if (!event) return; const fn = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, [event, onClose]);
  if (!event) return null;
  const maps = (provider: 'apple' | 'google') => onNavigate ? onNavigate(provider) : window.open(`${provider === 'apple' ? 'https://maps.apple.com/?q=' : 'https://www.google.com/maps/search/?api=1&query='}${encodeURIComponent(event.address || event.venueName || event.eventName || '')}`, '_blank', 'noopener,noreferrer');
  return <section ref={dialogRef} className="event-sheet" role="dialog" aria-modal="true" aria-label="イベント詳細">
    <button type="button" className="sheet-close" onClick={onClose} aria-label="閉じる"><X size={20} /></button>
    {present(event.imageUrl) && !imageFailed && <figure className="event-sheet-media"><img className="event-sheet-image" src={event.imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /><figcaption>{present(event.imageSourceUrl) ? <a href={event.imageSourceUrl} target="_blank" rel="noreferrer">会場の公式画像・出典</a> : '会場の公式画像'}</figcaption></figure>}
    <div className="event-sheet-body">
      <div className="event-sheet-kicker">{event.ongoing && <span className="live-badge">開催中</span>}{present(event.category) && (categoryLabels[event.category!] ?? event.category)}{event.recommendation != null && <span className="recommendation-badge">おすすめ {event.recommendation}%</span>}</div>
      <h2>{event.eventName || 'イベント'}</h2>
      {present(event.venueName) && <p className="event-meta"><MapPin size={16} />{event.venueName}</p>}
      {present(event.address) && <p className="event-address">{event.address}</p>}
      {present(dateLabel(event)) && <p className="event-meta"><Clock size={16} />{dateLabel(event)}</p>}
      {(event.distanceKm != null || event.travelMinutes != null) && <p className="event-meta"><Navigation size={16} />{event.distanceKm != null && `${event.distanceKm.toFixed(1)} km`}{event.distanceKm != null && event.travelMinutes != null && ' ・ '}{event.travelMinutes != null && `移動 約${event.travelMinutes}分`}</p>}
      <div className="event-facts">{event.freeEvent != null && <span>{event.freeEvent ? '無料' : (present(event.price) ? `料金 ${event.price}` : '有料')}</span>}{event.indoor != null && <span>{event.indoor ? '屋内' : '屋外'}</span>}{event.rainSupport != null && <span>{event.rainSupport ? '雨でもOK' : '雨天中止の可能性'}</span>}{event.parking != null && <span><Car size={14} />駐車場{event.parking ? 'あり' : 'なし'}</span>}</div>
      {event.recommendationReasons?.length ? <p className="recommendation-reason">あなたにおすすめ：{event.recommendationReasons.join('・')}</p> : null}
      {present(event.description) && <p className="event-description">{event.description}</p>}
      <div className="event-actions"><button type="button" onClick={() => maps('apple')}><ArrowRight size={18} />ここに行く（Apple Maps）</button><button type="button" onClick={() => maps('google')}><ArrowRight size={18} />ここに行く（Google Maps）</button></div>
      {present(event.officialUrl) && <a className="official-link" href={event.officialUrl} target="_blank" rel="noreferrer">公式サイト <ExternalLink size={15} /></a>}
    </div>
  </section>;
}
