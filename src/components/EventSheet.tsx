import { useEffect, useState } from 'react';
import { useDialogFocus } from './useDialogFocus';
import { ArrowRight, Car, Clock, ExternalLink, MapPin, Navigation, X } from 'lucide-react';
import { CATEGORY_LABELS, EVENT_TAG_LABELS, hasCoordinates } from '../domain';
import type { EventProvenance, EventSource, EventTag } from '../types';

export type EventSheetEvent = {
  id?: string; eventName?: string; venueName?: string; category?: string;
  address?: string; description?: string; startDate?: string; endDate?: string;
  startTime?: string; endTime?: string; price?: string | number | null; freeEvent?: boolean | null;
  indoor?: boolean | null; outdoor?: boolean | null; rainSupport?: boolean | null; parking?: boolean | null;
  officialUrl?: string; imageUrl?: string; imageSourceUrl?: string; distanceKm?: number; travelMinutes?: number;
  latitude?: number | null; longitude?: number | null;
  tags?: EventTag[]; tagEvidence?: Record<string, string>;
  sourceId?: string; source?: string; sourceUrl?: string; lastCheckedAt?: string;
  provenance?: EventProvenance[]; sourceReports?: EventSource[];
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
const statusLabel: Record<EventSource['status'], string> = { success: '取得済み', error: '取得失敗', stale: '更新確認が古い可能性' };
const checkedAtLabel = (value?: string) => {
  if (!present(value)) return '';
  const date = new Date(value!);
  return Number.isNaN(date.getTime()) ? value! : new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export function EventSheet({ event, onClose, onNavigate }: Props) {
  const dialogRef = useDialogFocus(!!event);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [event?.imageUrl]);
  useEffect(() => { if (!event) return; const fn = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', fn); return () => window.removeEventListener('keydown', fn); }, [event, onClose]);
  if (!event) return null;
  const canNavigate = hasCoordinates(event) || present(event.address) || present(event.venueName);
  const maps = (provider: 'apple' | 'google') => {
    if (!canNavigate) return;
    if (onNavigate) return onNavigate(provider);
    const destination = hasCoordinates(event) ? `${event.latitude},${event.longitude}` : event.address || event.venueName || '';
    return window.open(`${provider === 'apple' ? 'https://maps.apple.com/?q=' : 'https://www.google.com/maps/search/?api=1&query='}${encodeURIComponent(destination)}`, '_blank', 'noopener,noreferrer');
  };
  const sourceReports = event.sourceReports ?? [];
  const provenanceSourceIds = new Set((event.provenance ?? []).map((item) => item.sourceId).filter(Boolean));
  const relevantSourceIds = new Set([event.sourceId, ...provenanceSourceIds].filter(Boolean));
  const provenance = event.provenance ?? [];
  const relevantReports = sourceReports.filter((source) => {
    if (relevantSourceIds.has(source.id)) return true;
    if (present(event.sourceUrl) && source.url === event.sourceUrl) return true;
    if (present(event.source) && source.name === event.source) return true;
    return provenance.some((item) => (present(item.sourceUrl) && item.sourceUrl === source.url) || (present(item.source) && item.source === source.name));
  });
  const hasSourceWarning = relevantReports.some((source) => source.status === 'error' || source.status === 'stale');
  const evidenceTags = (event.tags ?? []).filter((tag) => EVENT_TAG_LABELS[tag]);
  const isFree = event.freeEvent === true || event.tags?.includes('free');
  return <section ref={dialogRef} className="event-sheet" role="dialog" aria-modal="true" aria-label="イベント詳細">
    <button type="button" className="sheet-close" onClick={onClose} aria-label="閉じる"><X size={20} /></button>
    {present(event.imageUrl) && !imageFailed && <figure className="event-sheet-media"><img className="event-sheet-image" src={event.imageUrl} alt="" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} /><figcaption>{present(event.imageSourceUrl || event.officialUrl || event.sourceUrl) ? <a href={event.imageSourceUrl || event.officialUrl || event.sourceUrl} target="_blank" rel="noreferrer">公式画像・出典</a> : '公式画像・出典'}</figcaption></figure>}
    <div className="event-sheet-body">
      <div className="event-sheet-kicker">{event.ongoing && <span className="live-badge">開催中</span>}{present(event.category) && (CATEGORY_LABELS[event.category!] ?? event.category)}{event.recommendation != null && <span className="recommendation-badge">おすすめ {event.recommendation}%</span>}</div>
      <h2>{event.eventName || 'イベント'}</h2>
      {present(event.venueName) && <p className="event-meta"><MapPin size={16} />{event.venueName}</p>}
      {present(event.address) && <p className="event-address">{event.address}</p>}
      {present(dateLabel(event)) && <p className="event-meta"><Clock size={16} />{dateLabel(event)}</p>}
      {(Number.isFinite(event.distanceKm) || Number.isFinite(event.travelMinutes)) && <p className="event-meta"><Navigation size={16} />{Number.isFinite(event.distanceKm) && `${event.distanceKm!.toFixed(1)} km`}{Number.isFinite(event.distanceKm) && Number.isFinite(event.travelMinutes) && ' ・ '}{Number.isFinite(event.travelMinutes) && `移動 約${event.travelMinutes}分`}</p>}
      <div className="event-facts">{(event.freeEvent != null || isFree) && <span>{isFree ? '無料' : (present(event.price) ? `料金 ${event.price}` : '有料')}</span>}{event.indoor != null && <span>{event.indoor ? '屋内' : '屋外'}</span>}{event.rainSupport != null && <span>{event.rainSupport ? '雨でもOK' : '雨天中止の可能性'}</span>}{event.parking != null && <span><Car size={14} />駐車場{event.parking ? 'あり' : 'なし'}</span>}</div>
      {evidenceTags.length > 0 && <div className="event-tag-list" aria-label="イベントの特徴">{evidenceTags.map((tag) => <span key={tag}>{EVENT_TAG_LABELS[tag]}</span>)}</div>}
      {evidenceTags.some((tag) => present(event.tagEvidence?.[tag])) && <ul className="event-tag-evidence">{evidenceTags.filter((tag) => present(event.tagEvidence?.[tag])).map((tag) => <li key={tag}><b>{EVENT_TAG_LABELS[tag]}</b>：{event.tagEvidence?.[tag]}</li>)}</ul>}
      {event.recommendationReasons?.length ? <p className="recommendation-reason">あなたにおすすめ：{event.recommendationReasons.join('・')}</p> : null}
      {present(event.description) && <p className="event-description">{event.description}</p>}
      <div className="event-actions"><button type="button" disabled={!canNavigate} onClick={() => maps('apple')}><ArrowRight size={18} />{canNavigate ? 'ここに行く（Apple Maps）' : '経路案内を利用できません'}</button><button type="button" disabled={!canNavigate} onClick={() => maps('google')}><ArrowRight size={18} />{canNavigate ? 'ここに行く（Google Maps）' : '経路案内を利用できません'}</button></div>
      {!canNavigate && <p className="event-navigation-note">住所・会場情報が未確認のため、経路案内は利用できません。公式サイトで場所をご確認ください。</p>}
      {present(event.officialUrl) && <a className="official-link" href={event.officialUrl} target="_blank" rel="noreferrer">公式サイト <ExternalLink size={15} /></a>}
      {(relevantSourceIds.size > 0 || relevantReports.length > 0 || provenance.length > 0 || present(event.source) || present(event.sourceUrl) || present(event.lastCheckedAt)) && <details className="event-source-details"><summary>出典・更新情報</summary><div className="event-source-details__body">
        {hasSourceWarning && <p className="event-source-warning" role="status">このイベントの公式ソースは取得失敗または更新確認が古い可能性があります。参加前に公式サイトで最新情報をご確認ください。</p>}
        {provenance.length > 0 ? provenance.map((item, index) => <p key={`${item.sourceId ?? item.source ?? 'source'}-${index}`}><b>{item.source ?? item.sourceId ?? '公式ソース'}</b>{item.lastCheckedAt && <> ・ 確認 {checkedAtLabel(item.lastCheckedAt)}</>}{item.sourceUrl && <> ・ <a href={item.sourceUrl} target="_blank" rel="noreferrer">出典</a></>}</p>) : <p><b>{event.source ?? event.sourceId ?? '公式ソース'}</b>{event.lastCheckedAt && <> ・ 確認 {checkedAtLabel(event.lastCheckedAt)}</>}{event.sourceUrl && <> ・ <a href={event.sourceUrl} target="_blank" rel="noreferrer">出典</a></>}</p>}
        {relevantReports.map((source) => <p key={source.id} className={source.status === 'success' ? '' : 'is-source-warning'}><b>{source.name}</b> ・ {statusLabel[source.status]} ・ 確認 {checkedAtLabel(source.checkedAt)}{source.error && <>：{source.error}</>}</p>)}
      </div></details>}
    </div>
  </section>;
}
