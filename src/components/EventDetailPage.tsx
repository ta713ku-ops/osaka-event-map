import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Bookmark, Bus, CalendarDays, Car, Check, Clock3, ExternalLink,
  Heart, Mail, MapPin, Navigation, Phone, Share2,
} from 'lucide-react';
import { CATEGORY_LABELS, EVENT_TAG_LABELS, hasCoordinates, type DetailRecommendation } from '../domain';
import { eventFreshness, eventStatusLabel, usableEventImage } from '../domain/eventPresentation';
import { eventPath } from '../domain/eventRoutes';
import type { EventItem } from '../types';
import { MapProviderDialog } from './MapProviderDialog';
import './event-detail.css';

export type DetailEvent = EventItem & {
  originLabel?: string;
  distanceKm?: number;
  travelMinutes?: number;
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
  onOpenEvent?: (eventId: string, focus?: string) => void;
  nearbyOngoingEvents?: DetailRecommendation[];
  sameAreaEvents?: DetailRecommendation[];
  saved?: boolean;
  onToggleSave?: () => void;
};

const present = (value: unknown) => value !== undefined && value !== null && String(value).trim() !== '';

function safeExternalHref(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function formatDate(value: string, includeYear = false) {
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value.replaceAll('-', '/');
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: includeYear ? 'numeric' : undefined,
    month: 'long', day: 'numeric', weekday: 'short',
  }).format(date);
}

function formatCheckedAt(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function timeFromTimestamp(value: string | undefined) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

function scheduleLabel(event: EventItem) {
  const endDate = event.endDate;
  const sameYear = !endDate || endDate.slice(0, 4) === event.startDate.slice(0, 4);
  const range = endDate && endDate !== event.startDate
    ? `${formatDate(event.startDate, true)} 〜 ${formatDate(endDate, !sameYear)}`
    : formatDate(event.startDate, true);
  const startTime = event.startTime?.slice(0, 5) || timeFromTimestamp(event.startAt);
  const endTime = event.endTime?.slice(0, 5) || timeFromTimestamp(event.endAt);
  const time = event.timeInfo || (startTime ? `${startTime}${endTime ? ` 〜 ${endTime}` : ''}` : '開催時間は未確認');
  return { range, time };
}

function priceLabel(event: EventItem) {
  if (typeof event.price === 'number' && Number.isFinite(event.price)) return event.price === 0 ? '無料' : `${event.price.toLocaleString('ja-JP')}円`;
  if (typeof event.price === 'string' && event.price.trim()) {
    const raw = event.price.trim();
    return /^0(?:\.0+)?$/u.test(raw) ? '無料' : raw;
  }
  if (event.freeEvent === true) return '無料';
  if (event.freeEvent === false) return '有料（料金は未確認）';
  return '料金は未確認';
}

function closedDateLabel(event: EventItem) {
  const dates = [...new Set(event.schedule?.closedDates ?? [])].filter(Boolean);
  return dates.length ? dates.map((date) => formatDate(date)).join('、') : undefined;
}

function contactPhoneHref(phone: string) {
  const normalized = phone.replace(/[^0-9+]/gu, '');
  return /\d/u.test(normalized) ? `tel:${normalized}` : undefined;
}

function statusTone(event: EventItem, fresh: boolean) {
  if (['cancelled', 'postponed', 'sold_out', 'registration_closed'].includes(event.officialStatus ?? '')) return 'is-warning';
  if (!fresh) return 'is-caution';
  return 'is-live';
}

function StatusState({ title, message, onBack, onRetry }: { title: string; message?: string; onBack: () => void; onRetry?: () => void }) {
  return <main tabIndex={-1} className="event-detail-page">
    <header className="event-detail-nav">
      <button type="button" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />戻る</button>
      <a href={import.meta.env.BASE_URL} className="event-detail-brand">どこいこ大阪</a>
      <span aria-hidden="true" />
    </header>
    <section className={`event-detail-state${onRetry ? ' is-error' : ''}`} role={onRetry ? 'alert' : 'status'}>
      <p className="event-detail-section-kicker">EVENT INFORMATION</p>
      <h1>{title}</h1>
      {message && <p>{message}</p>}
      <div className="event-detail-state-actions">
        <button type="button" onClick={onBack}>イベントを探す</button>
        {onRetry && <button type="button" className="is-secondary" onClick={onRetry}>もう一度読み込む</button>}
      </div>
    </section>
  </main>;
}

function RelatedEventsSection({ id, title, events, onOpenEvent }: {
  id: string;
  title: string;
  events: DetailRecommendation[];
  onOpenEvent?: (eventId: string, focus?: string) => void;
}) {
  if (!events.length) return null;
  return <section className="event-related-section" aria-labelledby={id}>
    <div className="event-related-heading"><div><p className="event-detail-section-kicker">MORE OSAKA</p><h2 id={id}>{title}</h2></div><span>{events.length}件</span></div>
    <div className="event-related-grid">
      {events.map((item) => {
        const image = usableEventImage(item);
        return <a
          key={item.id}
          className="event-related-card"
          data-event-focus={`related:${id}:${item.id}`}
          href={eventPath(item.routeId ?? item.id)}
          onClick={(clickEvent) => {
            if (!onOpenEvent || clickEvent.button !== 0 || clickEvent.metaKey || clickEvent.ctrlKey || clickEvent.shiftKey || clickEvent.altKey) return;
            clickEvent.preventDefault();
            onOpenEvent(item.id, `related:${id}:${item.id}`);
          }}
        >
          <span className="event-related-card__media">
            <span className="event-related-card__fallback" aria-hidden="true">OSAKA</span>
            {image && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(imageEvent) => imageEvent.currentTarget.remove()} />}
          </span>
          <span className="event-related-card__copy">
            <small>{formatDate(item.startDate)} ・ {CATEGORY_LABELS[item.category] ?? 'イベント'}</small>
            <strong>{item.eventName}</strong>
            {present(item.venueName) && <span>{item.venueName}</span>}
            {Number.isFinite(item.distanceKm) && <em>会場からの直線距離 約{item.distanceKm!.toFixed(1)}km</em>}
          </span>
          <ArrowRight size={17} aria-hidden="true" />
        </a>;
      })}
    </div>
  </section>;
}

export function EventDetailPage({
  event, requestedId, loading, loadError, now, onBack, onRetry, onNavigate, onOpenEvent,
  nearbyOngoingEvents = [], sameAreaEvents = [], saved = false, onToggleSave,
}: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [shareNotice, setShareNotice] = useState('');
  const [mapChoiceOpen, setMapChoiceOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [event?.imageUrl, event?.id]);
  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [requestedId, event?.id]);

  if (loading) return <StatusState title="イベント情報を読み込んでいます" message="公式情報を確認しています。" onBack={onBack} />;
  if (loadError) return <StatusState title="イベント情報を読み込めませんでした" message={loadError} onBack={onBack} onRetry={onRetry} />;
  if (!event) return <StatusState title="イベントが見つかりません" message={`ID「${requestedId}」の情報は終了または更新された可能性があります。`} onBack={onBack} />;

  const schedule = scheduleLabel(event);
  const status = eventStatusLabel(event, now);
  const fresh = eventFreshness(event, now);
  const image = imageFailed ? undefined : usableEventImage(event);
  const imageSourceHref = safeExternalHref(event.imageSourceUrl);
  const officialHref = safeExternalHref(event.officialUrl);
  const reservationHref = safeExternalHref(event.reservationUrl);
  const sourceHref = safeExternalHref(event.sourceUrl);
  const checkedAt = formatCheckedAt(event.lastCheckedAt ?? event.provenance?.find((item) => item.lastCheckedAt)?.lastCheckedAt);
  const closedDates = closedDateLabel(event);
  const fullPrice = priceLabel(event);
  const priceBeforeNotes = fullPrice.split(/[*※]/u)[0].trim();
  const shortPrice = fullPrice.length > 180 && priceBeforeNotes ? priceBeforeNotes + (/無料/.test(priceBeforeNotes) ? '（条件は下記で確認）' : '') : fullPrice;
  const canNavigate = hasCoordinates(event) || present(event.address) || present(event.venueName);
  const hasEndedReservation = event.officialStatus === 'sold_out' || event.officialStatus === 'registration_closed';
  const eventUnavailable = event.officialStatus === 'cancelled' || event.officialStatus === 'postponed';
  const reservationActionHref = reservationHref && !hasEndedReservation && !eventUnavailable ? reservationHref : undefined;
  const fallbackOfficialHref = officialHref ?? sourceHref;
  const sourceLinks = [
    ...(officialHref ? [{ href: officialHref, label: '公式サイトを開く' }] : []),
    ...(sourceHref && sourceHref !== officialHref ? [{ href: sourceHref, label: event.source || '掲載元を開く' }] : []),
  ];
  const hasContact = !!(event.contact?.name || event.contact?.phone || event.contact?.email);

  const share = async () => {
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

  return <main tabIndex={-1} className="event-detail-page" id="event-detail">
    <header className="event-detail-nav">
      <button type="button" onClick={onBack}><ArrowLeft size={18} aria-hidden="true" />戻る</button>
      <a href={import.meta.env.BASE_URL} className="event-detail-brand">どこいこ大阪</a>
      <button type="button" onClick={share}><Share2 size={18} aria-hidden="true" />共有</button>
    </header>
    {shareNotice && <p className="event-share-notice" role="status">{shareNotice}</p>}

    <article className="event-detail-article">
      <header className="event-detail-hero">
        <div className="event-detail-hero__copy">
          <p className="event-detail-kicker">{CATEGORY_LABELS[event.category] ?? 'イベント'} <span aria-hidden="true">/</span> OSAKA</p>
          <p className={`event-status ${statusTone(event, fresh)}`}><span aria-hidden="true" />{status}</p>
          {!!event.statusEvidence && <p className="event-detail-status-evidence">{event.statusEvidence}</p>}
          <h1 ref={headingRef} tabIndex={-1}>{event.eventName}</h1>
          <p className="event-detail-hero__essentials">
            <span>{formatDate(event.startDate, true)}{event.endDate && event.endDate !== event.startDate ? ` 〜 ${formatDate(event.endDate)}` : ''}</span>
            <span>{event.venueName}</span>
          </p>
          {event.description && <p className="event-detail-hero__summary">{event.description}</p>}
          <div className="event-detail-title-actions">
            {onToggleSave && <button type="button" className={`event-save-button${saved ? ' is-saved' : ''}`} aria-pressed={saved} aria-label={saved ? 'お気に入りから削除' : 'お気に入りに保存'} onClick={onToggleSave}>
              {saved ? <Check size={18} aria-hidden="true" /> : <Bookmark size={18} aria-hidden="true" />}{saved ? '保存済み' : 'お気に入りに保存'}
            </button>}
            {Number.isFinite(event.distanceKm) && <span className="event-distance"><Navigation size={16} aria-hidden="true" />直線距離 約{event.distanceKm!.toFixed(1)}km</span>}
          </div>
        </div>
        <figure className="event-detail-media">
          {image
            ? <img src={image} alt={`${event.eventName}の公式画像`} fetchPriority="high" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} />
            : <div className="event-detail-media__fallback" aria-hidden="true"><span>{CATEGORY_LABELS[event.category] ?? '大阪のイベント'} · {formatDate(event.startDate)}</span><strong>{event.eventName}</strong></div>}
          {(image || imageSourceHref) && <figcaption>{image && <a href={image} target="_blank" rel="noopener noreferrer" aria-label={`${event.eventName}の公式画像を大きく見る`}>画像を大きく見る <ExternalLink size={13} aria-hidden="true" /></a>}{imageSourceHref && <a href={imageSourceHref} target="_blank" rel="noopener noreferrer">画像の出典 <ExternalLink size={13} aria-hidden="true" /></a>}</figcaption>}
        </figure>
      </header>

      <div className="event-detail-layout">
        <div className="event-detail-main">
          <section className="event-participation" aria-labelledby="event-participation-title">
            <div className="event-section-heading"><div><p className="event-detail-section-kicker">PLAN YOUR VISIT</p><h2 id="event-participation-title">参加の基本情報</h2></div><p>日時・費用・参加方法</p></div>
            <dl className="event-facts-grid">
              <div className="event-fact event-fact--schedule"><CalendarDays size={19} aria-hidden="true" /><div><dt>開催日</dt><dd>{schedule.range}</dd><p><Clock3 size={15} aria-hidden="true" />{schedule.time}</p>{closedDates && <p className="event-fact-note"><span>休催日</span>{closedDates}</p>}{event.closureInfo && <p className="event-fact-note">{event.closureInfo}</p>}</div></div>
              <div className="event-fact"><MapPin size={19} aria-hidden="true" /><div><dt>会場</dt><dd>{event.venueName || '会場情報は未確認'}</dd><p>{event.address || '住所は未確認'}</p></div></div>
              <div className="event-fact"><span className="event-fact-mark" aria-hidden="true">¥</span><div><dt>料金</dt><dd>{shortPrice}</dd>{fullPrice !== shortPrice && <details className="event-price-conditions"><summary>詳しい料金・割引条件</summary><p>{fullPrice}</p></details>}{present(event.price) && event.freeEvent === true && <p>表示の料金条件を公式情報でご確認ください。</p>}</div></div>
              <div className="event-fact event-fact--reservation"><Bookmark size={19} aria-hidden="true" /><div><dt>予約</dt><dd>{event.reservationRequired === true ? '予約が必要' : event.reservationRequired === false ? '予約不要' : '予約情報は未確認'}</dd>
                {present(event.reservationInfo) && <p>{event.reservationInfo}</p>}{event.audienceInfo && <p>対象：{event.audienceInfo}</p>}
                <div className="event-reservation-actions">
                  {hasEndedReservation && <button type="button" disabled>{event.officialStatus === 'sold_out' ? '完売' : '受付終了'}</button>}
                  {eventUnavailable && <button type="button" disabled>{event.officialStatus === 'cancelled' ? '開催中止' : '開催延期'}</button>}
                  {reservationActionHref && <a href={reservationActionHref} target="_blank" rel="noopener noreferrer">{fresh ? '公式予約へ' : '予約先を公式ページで確認'} <ExternalLink size={15} aria-hidden="true" /></a>}
                  {!reservationActionHref && !hasEndedReservation && !eventUnavailable && fallbackOfficialHref && <a href={fallbackOfficialHref} target="_blank" rel="noopener noreferrer">公式情報を確認 <ExternalLink size={15} aria-hidden="true" /></a>}
                </div>
              </div></div>
            </dl>
          </section>

          <section className="event-description-section" aria-labelledby="event-overview-title">
            <p className="event-detail-section-kicker">ABOUT THE EVENT</p><h2 id="event-overview-title">イベントについて</h2>
            {present(event.description) ? <p className="event-detail-description">{event.description}</p> : <p className="event-detail-missing">紹介文は未掲載です。内容は公式情報でご確認ください。</p>}
            {!!event.tags?.length && <ul className="event-detail-tags" aria-label="確認されているイベントの特徴">{event.tags.filter((tag) => EVENT_TAG_LABELS[tag]).map((tag) => <li key={tag}>{EVENT_TAG_LABELS[tag]}</li>)}</ul>}
            {(event.rainPolicy || event.parkingInfo || typeof event.parking === 'boolean') && <dl className="event-notes-list">
              {event.rainPolicy && <div><dt>雨天時</dt><dd>{event.rainPolicy}</dd></div>}
              {event.parkingInfo && <div><dt>駐車場</dt><dd>{event.parkingInfo}</dd></div>}
              {!event.parkingInfo && typeof event.parking === 'boolean' && <div><dt>駐車場</dt><dd>{event.parking ? 'あり' : 'なし'}</dd></div>}
            </dl>}
          </section>

          <section aria-labelledby="event-access-title" className="event-access-section">
            <p className="event-detail-section-kicker">ACCESS</p><h2 id="event-access-title">アクセス</h2>
            <div className="event-access-card">
              <div className="event-access-place"><MapPin size={20} aria-hidden="true" /><div><strong>{event.venueName || '会場情報は未確認'}</strong><p>{event.address || '住所は未確認'}</p></div></div>
              {(event.nearestStation || event.accessByTransit || event.accessByCar) && <dl className="event-access-details">
                {event.nearestStation && <div><dt><Bus size={16} aria-hidden="true" />最寄駅</dt><dd>{event.nearestStation}</dd></div>}
                {event.accessByTransit && <div><dt><Bus size={16} aria-hidden="true" />電車・バス</dt><dd>{event.accessByTransit}</dd></div>}
                {event.accessByCar && <div><dt><Car size={16} aria-hidden="true" />車</dt><dd>{event.accessByCar}</dd></div>}
              </dl>}
              {Number.isFinite(event.distanceKm) && <p className="event-access-distance">{event.originLabel?.replace(/から$/u,'') ?? '設定した起点'}からの直線距離 約{event.distanceKm!.toFixed(1)}km <span>道路や乗換経路の距離ではありません</span></p>}
              <div className="event-detail-route-actions">
                <button type="button" disabled={!canNavigate} onClick={() => onNavigate('apple', event)}>Apple Mapsで経路を見る <ArrowRight size={16} aria-hidden="true" /></button>
                <button type="button" className="is-secondary" disabled={!canNavigate} onClick={() => onNavigate('google', event)}>Google Mapsで見る <ExternalLink size={15} aria-hidden="true" /></button>
              </div>
              {!canNavigate && <p className="event-detail-missing">住所・会場情報が未確認のため、経路案内は利用できません。</p>}
            </div>
          </section>

          {hasContact && <section className="event-contact-section" aria-labelledby="event-contact-title">
            <p className="event-detail-section-kicker">CONTACT</p><h2 id="event-contact-title">問い合わせ</h2>
            <div className="event-contact-card">
              {event.contact?.name && <p className="event-contact-name">{event.contact.name}</p>}
              {event.contact?.phone && <p><Phone size={17} aria-hidden="true" />{contactPhoneHref(event.contact.phone) ? <a href={contactPhoneHref(event.contact.phone)}>{event.contact.phone}</a> : <span>{event.contact.phone}</span>}</p>}
              {event.contact?.email && <p><Mail size={17} aria-hidden="true" />{/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(event.contact.email) ? <a href={`mailto:${event.contact.email}`}>{event.contact.email}</a> : <span>{event.contact.email}</span>}</p>}
            </div>
          </section>}

          <section className="event-source-section" aria-labelledby="event-source-title">
            <p className="event-detail-section-kicker">SOURCES</p><h2 id="event-source-title">出典と確認日</h2>
            <div className="event-source-card">
              <p className={`event-source-freshness${fresh ? ' is-fresh' : ' is-stale'}`}><span aria-hidden="true" />{fresh ? '公式情報を確認済み' : '最新状況は公式情報でご確認ください'}</p>
              {checkedAt ? <p className="event-source-checked">最終確認 <time dateTime={event.lastCheckedAt ?? event.provenance?.find((item) => item.lastCheckedAt)?.lastCheckedAt}>{checkedAt}</time></p> : <p className="event-source-checked">確認日を記録していません</p>}
              {event.source && <p className="event-source-name">情報元：{event.source}</p>}
              {!!sourceLinks.length && <ul>{sourceLinks.map((link) => <li key={link.href}><a href={link.href} target="_blank" rel="noopener noreferrer">{link.label} <ExternalLink size={15} aria-hidden="true" /></a></li>)}</ul>}
              {!sourceLinks.length && <p className="event-detail-missing">公式の確認先URLは未掲載です。</p>}
            </div>
          </section>

          <div className="event-detail-related">
            <RelatedEventsSection id="event-nearby-title" title="近くのイベント" events={nearbyOngoingEvents} onOpenEvent={onOpenEvent} />
            <RelatedEventsSection id="event-same-area-title" title="同じ会場・エリアのイベント" events={sameAreaEvents} onOpenEvent={onOpenEvent} />
          </div>
        </div>
      </div>
    </article>

    <div className={`event-detail-mobile-actions${reservationActionHref || fallbackOfficialHref || hasEndedReservation || eventUnavailable ? ' has-secondary' : ''}`}>
      <button type="button" disabled={!canNavigate} onClick={() => setMapChoiceOpen(true)}><Navigation size={18} aria-hidden="true" />経路を見る</button>
      {reservationActionHref
        ? <a href={reservationActionHref} target="_blank" rel="noopener noreferrer">{fresh ? '公式予約へ' : '予約先を確認'} <ExternalLink size={16} aria-hidden="true" /></a>
        : hasEndedReservation || eventUnavailable
          ? <button type="button" disabled><Heart size={17} aria-hidden="true" />{status}</button>
          : fallbackOfficialHref && <a href={fallbackOfficialHref} target="_blank" rel="noopener noreferrer">公式情報を確認 <ExternalLink size={16} aria-hidden="true" /></a>}
    </div>
    <MapProviderDialog open={mapChoiceOpen} eventName={event.eventName} onClose={() => setMapChoiceOpen(false)} onSelect={(provider) => { setMapChoiceOpen(false); onNavigate(provider, event); }} />
  </main>;
}
