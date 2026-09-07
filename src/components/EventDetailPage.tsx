import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CalendarDays, Car, Clock, ExternalLink, MapPin,
  Navigation, Share2, TrainFront,
} from 'lucide-react';
import { CATEGORY_LABELS, EVENT_TAG_LABELS, hasCoordinates } from '../domain';
import { eventPath } from '../domain/eventRoutes';
import type { EventItem, EventSource } from '../types';
import { MapProviderDialog } from './MapProviderDialog';

export type DetailEvent = EventItem & {
  distanceKm?: number;
  travelMinutes?: number;
  sourceReports?: EventSource[];
};

type Props = {
  event: DetailEvent | null;
  requestedId: string;
  loading: boolean;
  loadError?: string;
  now: Date;
  onBack: () => void;
  onRetry: () => void;
  onNavigate: (provider: 'apple' | 'google', event: EventItem) => void;
};

const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';

function formatDate(value: string, includeYear = false) {
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value.replaceAll('-', '/');
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: includeYear ? 'numeric' : undefined,
    month: 'long', day: 'numeric', weekday: 'short',
  }).format(date);
}

function scheduleLabel(event: EventItem) {
  const range = event.endDate && event.endDate !== event.startDate
    ? `${formatDate(event.startDate, true)} — ${formatDate(event.endDate, event.endDate.slice(0, 4) !== event.startDate.slice(0, 4))}`
    : formatDate(event.startDate, true);
  const time = event.startTime
    ? `${event.startTime.slice(0, 5)}${event.endTime ? `–${event.endTime.slice(0, 5)}` : ''}`
    : '開催時間未取得';
  return { range, time };
}

const explicitStatusLabels = {
  scheduled: '開催予定', cancelled: '中止', postponed: '延期', sold_out: '完売', registration_closed: '受付終了',
} as const;

function statusFor(event: EventItem, now: Date) {
  if (event.officialStatus && event.officialStatus !== 'scheduled') {
    return { label: explicitStatusLabels[event.officialStatus], tone: 'warning' as const };
  }
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(now);
  const end = event.endDate ?? event.startDate;
  if (end < today) return { label: '終了', tone: 'muted' as const };
  if (event.startDate > today) return { label: '開催予定', tone: 'default' as const };
  if (event.startDate === today && end === today) return { label: '本日開催', tone: 'live' as const };
  return { label: '開催期間中', tone: 'live' as const };
}

function checkedAtLabel(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export function EventDetailPage({ event, requestedId, loading, loadError, now, onBack, onRetry, onNavigate }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const [mapChoiceOpen, setMapChoiceOpen] = useState(false);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [requestedId, event?.id]);
  useEffect(() => setImageFailed(false), [event?.imageUrl]);
  const schedule = event ? scheduleLabel(event) : null;
  const status = event ? statusFor(event, now) : null;
  const canNavigate = !!event && (hasCoordinates(event) || present(event.address) || present(event.venueName));
  const relevantReports = useMemo(() => {
    if (!event) return [];
    const ids = new Set([event.sourceId, ...(event.provenance ?? []).map((item) => item.sourceId)].filter(Boolean));
    return (event.sourceReports ?? []).filter((source) => ids.has(source.id) || source.url === event.sourceUrl);
  }, [event]);
  const sourceWarning = relevantReports.some((source) => source.status !== 'success');

  const share = async () => {
    if (!event) return;
    const url = new URL(eventPath(event.routeId ?? event.id), window.location.origin).href;
    try {
      if (navigator.share) await navigator.share({ title: `${event.eventName}｜どこいこ大阪`, text: `${event.eventName}の開催情報`, url });
      else {
        await navigator.clipboard.writeText(url);
        setShareNotice('URLをコピーしました');
      }
    } catch (error) {
      if ((error as { name?: string }).name !== 'AbortError') setShareNotice('共有できませんでした');
    }
  };

  if (loading) return <main className="event-detail-page"><div className="event-detail-state" role="status">イベント情報を読み込んでいます…</div></main>;
  if (loadError) return <main className="event-detail-page"><div className="event-detail-state is-error" role="alert"><strong>{loadError}</strong><button type="button" onClick={onRetry}>もう一度読み込む</button></div></main>;
  if (!event) return <main className="event-detail-page"><div className="event-detail-state"><strong>イベントが見つかりません</strong><p>ID「{requestedId}」の情報は終了または更新された可能性があります。</p><button type="button" onClick={onBack}>イベントを探す</button></div></main>;

  const price = present(event.price) ? String(event.price) : event.freeEvent === true ? '無料' : '未取得';
  const reservation = event.reservationRequired === false ? '予約不要' : event.reservationRequired === true ? (event.reservationInfo || '予約必要') : (event.reservationInfo || '未取得');
  const weather = event.rainPolicy || (event.rainSupport === true ? '雨天開催' : event.rainSupport === false ? '雨天中止' : '未取得');
  const parking = event.parkingInfo || (event.parking === true ? '駐車場あり' : event.parking === false ? '駐車場なし' : '未取得');

  return <main className="event-detail-page" id="event-detail">
    <header className="event-detail-nav">
      <button type="button" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />戻る</button>
      <a href={import.meta.env.BASE_URL} className="event-detail-brand">どこいこ大阪</a>
      <button type="button" onClick={share}><Share2 size={18} aria-hidden="true" />共有</button>
    </header>
    {shareNotice && <p className="event-share-notice" role="status">{shareNotice}</p>}

    <article className="event-detail-article">
      <div className="event-detail-hero">
        <div className="event-detail-hero__copy">
          <p className="event-detail-kicker">{CATEGORY_LABELS[event.category] ?? 'イベント'} / OSAKA</p>
          <span className={`event-status is-${status?.tone}`}>{status?.label}</span>
          <h1 ref={headingRef} tabIndex={-1}>{event.eventName}</h1>
          <div className="event-detail-lead-facts">
            <p><CalendarDays size={18} aria-hidden="true" /><span><b>{schedule?.range}</b><small>{schedule?.time}</small></span></p>
            {present(event.venueName) && <p><MapPin size={18} aria-hidden="true" /><span><b>{event.venueName}</b>{present(event.address) && <small>{event.address}</small>}</span></p>}
            {(Number.isFinite(event.distanceKm) || Number.isFinite(event.travelMinutes)) && <p><Navigation size={18} aria-hidden="true" /><span><b>{Number.isFinite(event.distanceKm) ? `${event.distanceKm!.toFixed(1)} km` : '現在地から'}</b><small>{Number.isFinite(event.travelMinutes) ? `移動 約${event.travelMinutes}分` : '距離を確認'}</small></span></p>}
          </div>
        </div>
        <figure className="event-detail-media">
          {present(event.imageUrl) && !imageFailed
            ? <img src={event.imageUrl} alt={`${event.eventName}の公式イメージ`} referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
            : <div className="event-detail-media__fallback" aria-hidden="true"><span>{formatDate(event.startDate)}</span><strong>{CATEGORY_LABELS[event.category] ?? '大阪のイベント'}</strong></div>}
        </figure>
      </div>

      <div className="event-detail-layout">
        <div className="event-detail-main">
          <section aria-labelledby="event-overview-title"><p className="event-detail-section-kicker">ABOUT</p><h2 id="event-overview-title">このイベントについて</h2>{present(event.description) ? <p className="event-detail-description">{event.description}</p> : <p className="event-detail-missing">詳しい内容は公式サイトでご確認ください。</p>}
            {!!event.tags?.length && <ul className="event-detail-tags" aria-label="イベントの特徴">{event.tags.filter((tag) => EVENT_TAG_LABELS[tag]).map((tag) => <li key={tag}>{EVENT_TAG_LABELS[tag]}</li>)}</ul>}
          </section>

          <section aria-labelledby="event-before-title"><p className="event-detail-section-kicker">BEFORE YOU GO</p><h2 id="event-before-title">行く前に知っておきたいこと</h2><dl className="event-detail-fact-grid">
            <div><dt>料金</dt><dd>{price}</dd></div><div><dt>予約</dt><dd>{reservation}</dd></div><div><dt>雨天時</dt><dd>{weather}</dd></div><div><dt>駐車場</dt><dd>{parking}</dd></div>
          </dl>{event.statusEvidence && <p className="event-detail-warning">{event.statusEvidence}</p>}</section>

          <section aria-labelledby="event-access-title"><p className="event-detail-section-kicker">ACCESS</p><h2 id="event-access-title">アクセス</h2>
            <div className="event-access-list">
              {present(event.nearestStation) && <p><TrainFront size={18} aria-hidden="true" /><span><b>最寄駅</b>{event.nearestStation}</span></p>}
              {present(event.accessByTransit) && <p><TrainFront size={18} aria-hidden="true" /><span><b>公共交通</b>{event.accessByTransit}</span></p>}
              {present(event.accessByCar) && <p><Car size={18} aria-hidden="true" /><span><b>車</b>{event.accessByCar}</span></p>}
              {present(event.address) && <p><MapPin size={18} aria-hidden="true" /><span><b>住所</b>{event.address}</span></p>}
            </div>
            <div className="event-detail-route-actions"><button type="button" disabled={!canNavigate} onClick={() => onNavigate('apple', event)}>経路を見る（Apple Maps）</button><button type="button" disabled={!canNavigate} onClick={() => onNavigate('google', event)}>Google Mapsで見る</button></div>
            {!canNavigate && <p className="event-detail-missing">住所・会場情報が未確認のため、経路案内は利用できません。</p>}
          </section>
        </div>

        <aside className="event-detail-aside" aria-label="公式情報">
          <p className="event-detail-section-kicker">OFFICIAL INFORMATION</p><h2>公式情報</h2>
          {sourceWarning && <p className="event-detail-source-warning" role="status">更新確認が古い、または取得に失敗した公式ソースがあります。</p>}
          {event.officialUrl && <a className="event-detail-official" href={event.officialUrl} target="_blank" rel="noreferrer">公式サイトで最新情報を確認 <ExternalLink size={16} aria-hidden="true" /></a>}
          {event.officialSocialLinks?.map((link) => <a key={link.url} className="event-detail-source-link" href={link.url} target="_blank" rel="noreferrer">{link.label || '公式SNS'} <ExternalLink size={14} aria-hidden="true" /></a>)}
          {event.contact && <div className="event-detail-contact"><b>問い合わせ</b>{event.contact.name && <span>{event.contact.name}</span>}{event.contact.phone && <a href={`tel:${event.contact.phone}`}>{event.contact.phone}</a>}{event.contact.email && <a href={`mailto:${event.contact.email}`}>{event.contact.email}</a>}</div>}
          <div className="event-detail-provenance"><b>情報の確認</b><span>{event.source || '公式ソース'}</span>{event.lastCheckedAt && <span>最終確認 {checkedAtLabel(event.lastCheckedAt)}</span>}</div>
          <p className="event-detail-disclaimer">開催内容は変更される場合があります。参加前に公式情報をご確認ください。</p>
        </aside>
      </div>
    </article>

    <div className="event-detail-mobile-actions"><button type="button" disabled={!canNavigate} onClick={() => setMapChoiceOpen(true)}><Navigation size={18} aria-hidden="true" />経路を見る</button>{event.officialUrl && <a href={event.officialUrl} target="_blank" rel="noreferrer">公式情報 <ArrowRight size={18} aria-hidden="true" /></a>}</div>
    <MapProviderDialog open={mapChoiceOpen} eventName={event.eventName} onClose={() => setMapChoiceOpen(false)} onSelect={(provider) => { setMapChoiceOpen(false); onNavigate(provider, event); }} />
  </main>;
}
