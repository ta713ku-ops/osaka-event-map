import { useMemo } from 'react';
import type {
  CoverageCandidateItem,
  CoverageDataFile,
  CoverageDimension,
  CoverageHealth,
  CoverageSummary,
} from '../types';
import './coverage-status.css';

export type CoverageData = CoverageDataFile;

const STATUS_LABELS: Record<CoverageHealth, string> = {
  tracked: '監視中',
  healthy: '確認済み',
  warning: '注意',
  gap: '未対応',
};

const STATUS_VALUES = new Set<CoverageHealth>(['tracked', 'healthy', 'warning', 'gap']);

type RecordValue = Record<string, unknown>;

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  return text || undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    const number = Number(value);
    return number >= 0 ? number : undefined;
  }
  return undefined;
}

function pickString(record: RecordValue, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = stringValue(record[key]);
    if (value) return value;
  }
  return undefined;
}

function pickNumber(record: RecordValue, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = numberValue(record[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function normalizeStatus(value: unknown, fallback: CoverageHealth = 'tracked'): CoverageHealth {
  const text = stringValue(value)?.toLocaleLowerCase('ja-JP');
  if (!text) return fallback;
  if (STATUS_VALUES.has(text as CoverageHealth)) return text as CoverageHealth;
  if (/gap|missing|unsupported|none|未対応|対象外|未確認|欠落/u.test(text)) return 'gap';
  if (/healthy|success|ok|確認済|取得済|正常/u.test(text)) return 'healthy';
  if (/warning|warn|stale|error|注意|失敗|古い|一部/u.test(text)) return 'warning';
  if (/track|監視|収集|対応/u.test(text)) return 'tracked';
  return fallback;
}

/**
 * Accept arrays as well as keyed objects. The latter keeps the view tolerant
 * of small schema revisions such as `{ museums: { status: "healthy" } }`.
 */
function listValue(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  return Object.entries(value).map(([name, item]) => {
    if (isRecord(item)) return { ...item, name: stringValue(item.name) ?? name };
    return { name, status: item };
  });
}

function normalizeDimension(value: unknown, index: number, fallbackPrefix: string): CoverageDimension | null {
  if (typeof value === 'string') {
    const name = stringValue(value);
    return name ? { id: `${fallbackPrefix}-${index}`, name, status: 'tracked' } : null;
  }
  if (!isRecord(value)) return null;
  const name = pickString(value, 'name', 'label', 'title', 'category', 'venue', 'source', 'id');
  if (!name) return null;
  const id = pickString(value, 'id', 'key', 'slug') ?? `${fallbackPrefix}-${index}`;
  const url = pickString(value, 'url', 'sourceUrl', 'officialUrl', 'official_url');
  const note = pickString(value, 'note', 'description', 'reason', 'coverage', 'scope');
  const count = pickNumber(value, 'count', 'eventCount', 'recordCount', 'records', 'items');
  const checkedAt = pickString(value, 'checkedAt', 'lastCheckedAt', 'checked_at', 'lastChecked');
  return {
    id,
    name,
    status: normalizeStatus(value.status ?? value.state ?? value.health ?? value.result),
    ...(count !== undefined ? { count } : {}),
    ...(checkedAt ? { checkedAt } : {}),
    ...(url ? { url } : {}),
    ...(note ? { note } : {}),
  };
}

function normalizeDimensions(value: unknown, fallbackPrefix: string): CoverageDimension[] {
  return listValue(value)
    .map((item, index) => normalizeDimension(item, index, fallbackPrefix))
    .filter((item): item is CoverageDimension => item !== null);
}

function normalizeCandidate(value: unknown, index: number): CoverageCandidateItem | null {
  if (typeof value === 'string') {
    const name = stringValue(value);
    return name ? { id: `candidate-${index}`, name, verification: '公式確認前' } : null;
  }
  if (!isRecord(value)) return null;
  const name = pickString(value, 'name', 'eventName', 'title', 'candidate', 'label');
  if (!name) return null;
  const id = pickString(value, 'id', 'key', 'slug') ?? `candidate-${index}`;
  const officialUrl = pickString(value, 'officialCandidateUrl', 'officialUrl', 'official_url', 'sourceUrl', 'url');
  const discoveredFrom = pickString(value, 'discoveredFrom', 'discoverySource', 'foundVia', 'source', 'foundFrom');
  const detectedAt = pickString(value, 'detectedAt', 'detected_at', 'foundAt', 'discoveredAt');
  const verification = pickString(value, 'verification', 'verificationStatus', 'status', 'state') ?? '公式確認前';
  const note = pickString(value, 'note', 'description', 'reason');
  return {
    id,
    name,
    ...(discoveredFrom ? { discoveredFrom } : {}),
    ...(officialUrl ? { officialUrl } : {}),
    ...(detectedAt ? { detectedAt } : {}),
    verification,
    ...(note ? { note } : {}),
  };
}

function normalizeCandidates(value: unknown): CoverageCandidateItem[] {
  return listValue(value)
    .map((item, index) => normalizeCandidate(item, index))
    .filter((item): item is CoverageCandidateItem => item !== null)
    .filter((item) => !/resolved|verified|published|dismissed|rejected|closed|掲載済|確認済|除外|解決/u.test(item.verification ?? ''));
}

function stringList(value: unknown): string[] {
  return listValue(value)
    .map((item) => typeof item === 'string' ? stringValue(item) : isRecord(item) ? pickString(item, 'text', 'note', 'description', 'reason', 'label') : undefined)
    .filter((item): item is string => Boolean(item));
}

function summaryValue(input: RecordValue | undefined, ...keys: string[]): number | undefined {
  if (!input) return undefined;
  return pickNumber(input, ...keys);
}

/**
 * Parse the public coverage snapshot without letting malformed optional data
 * affect the event feed. Unknown fields are ignored, and absent collections
 * become empty arrays so the UI can explain the empty state honestly.
 */
export function parseCoverageData(input: unknown): CoverageData | null {
  if (!isRecord(input)) return null;
  const summaryInput = isRecord(input.summary) ? input.summary : undefined;
  const sourceInput = input.sources
    ?? input.sourceStatuses
    ?? input.sourceCoverage
    ?? summaryInput?.sources
    ?? summaryInput?.sourceStatuses;
  const categoriesInput = input.categories ?? input.categoryCoverage ?? input.category;
  const venuesInput = input.venues ?? input.venueCoverage ?? input.majorVenues ?? input.venue;
  const candidatesInput = input.candidates ?? input.unverifiedCandidates ?? input.discoveryCandidates;
  const limitationsInput = input.limitations ?? input.notes ?? summaryInput?.limitations;
  const hasCoverageKey = ['summary', 'sources', 'sourceStatuses', 'sourceCoverage', 'categories', 'categoryCoverage', 'venues', 'venueCoverage', 'majorVenues', 'candidates', 'unverifiedCandidates', 'limitations', 'notes'].some((key) => key in input);
  if (!hasCoverageKey && !stringValue(input.generatedAt) && numberValue(input.schemaVersion) === undefined) return null;

  const sources = normalizeDimensions(sourceInput, 'source');
  const categories = normalizeDimensions(categoriesInput, 'category');
  const venues = normalizeDimensions(venuesInput, 'venue');
  const candidates = normalizeCandidates(candidatesInput);
  const dimensions = [...sources, ...categories, ...venues];
  const derived = (status: CoverageHealth) => dimensions.filter((item) => item.status === status).length;
  const readSummary = (...keys: string[]) => summaryValue(summaryInput, ...keys) ?? summaryValue(input, ...keys);
  const tracked = readSummary('tracked', 'trackedCount', 'trackedSources');
  const healthy = readSummary('healthy', 'healthyCount', 'healthySources', 'confirmed');
  const warning = readSummary('warning', 'warningCount', 'warningSources', 'warnings');
  const gap = readSummary('gap', 'gapCount', 'gapSources', 'gaps');
  const records = readSummary('records', 'recordCount', 'eventCount', 'confirmedRecords');
  const total = readSummary('total', 'totalCount');
  const summary: CoverageSummary = {
    ...(tracked !== undefined ? { tracked } : dimensions.length ? { tracked: derived('tracked') } : {}),
    ...(healthy !== undefined ? { healthy } : dimensions.length ? { healthy: derived('healthy') } : {}),
    ...(warning !== undefined ? { warning } : dimensions.length ? { warning: derived('warning') } : {}),
    ...(gap !== undefined ? { gap } : dimensions.length ? { gap: derived('gap') } : {}),
    ...(records !== undefined ? { records } : {}),
    ...(total !== undefined ? { total } : {}),
  };
  return {
    ...(numberValue(input.schemaVersion) !== undefined ? { schemaVersion: numberValue(input.schemaVersion) } : {}),
    ...(stringValue(input.generatedAt) ? { generatedAt: stringValue(input.generatedAt) } : {}),
    summary,
    sources,
    categories,
    venues,
    candidates,
    limitations: stringList(limitationsInput),
  };
}

type CoverageStatusProps = {
  data?: CoverageData | null;
  /** Alias kept for callers that name the optional snapshot `coverage`. */
  coverage?: CoverageData | null;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
};

function safeHttpUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function displayDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function DimensionList({ items, emptyLabel }: { items: CoverageDimension[]; emptyLabel: string }) {
  if (!items.length) return <p className="coverage-status__empty">{emptyLabel}</p>;
  return <ul className="coverage-status__list">
    {items.map((item) => {
      const url = safeHttpUrl(item.url);
      return <li key={item.id}>
        <span className={`coverage-status__state is-${item.status}`}>{STATUS_LABELS[item.status]}</span>
        <span className="coverage-status__item-copy">
          {url ? <a href={url} target="_blank" rel="noreferrer">{item.name}</a> : <strong>{item.name}</strong>}
          <small>{item.count !== undefined ? `確認済み記録 ${item.count}件` : item.note ?? '範囲を確認中'}</small>
          {item.checkedAt && <small>最終確認 {displayDate(item.checkedAt)}</small>}
        </span>
      </li>;
    })}
  </ul>;
}

function CandidateList({ items }: { items: CoverageCandidateItem[] }) {
  if (!items.length) return <p className="coverage-status__empty">現在表示できる未確認候補はありません。</p>;
  return <ul className="coverage-status__candidate-list">
    {items.map((item) => {
      const url = safeHttpUrl(item.officialUrl);
      return <li key={item.id}>
        <strong>{item.name}</strong>
        <span>{item.verification ?? '公式確認前'}</span>
        {item.discoveredFrom && <small>発見元：{item.discoveredFrom}</small>}
        {item.detectedAt && <small>検出 {displayDate(item.detectedAt)}</small>}
        {item.note && <small>{item.note}</small>}
        {url && <a href={url} target="_blank" rel="noreferrer">公式候補ページを見る</a>}
      </li>;
    })}
  </ul>;
}

function CoverageBody({ data }: { data: CoverageData }) {
  const sources = data.sources ?? data.summary?.sources ?? [];
  const categories = data.categories ?? [];
  const venues = data.venues ?? [];
  const candidates = data.candidates ?? [];
  const limitations = data.limitations ?? [];
  const summary = data.summary ?? {};
  const countLabel = (value: number | undefined) => value === undefined ? '—' : String(value);
  return <div className="coverage-status__body">
    <p className="coverage-status__lead">掲載件数は監視中の情報源で確認できた候補です。大阪府内のイベント全件を示すものではありません。</p>
    <div className="coverage-status__facts" aria-label="収集状況の概要">
      <span><strong>{sources.length}</strong>情報源</span>
      <span><strong>{categories.length}</strong>対応分野</span>
      <span><strong>{venues.length}</strong>主要会場</span>
      {summary.records !== undefined && <span><strong>{summary.records}</strong>確認済み記録</span>}
    </div>
    <div className="coverage-status__grid">
      <section aria-labelledby="coverage-sources-title">
        <h3 id="coverage-sources-title">収集中の情報源</h3>
        <DimensionList items={sources} emptyLabel="現在監視中の情報源を表示できません。" />
      </section>
      <section aria-labelledby="coverage-categories-title">
        <h3 id="coverage-categories-title">対応分野</h3>
        <DimensionList items={categories} emptyLabel="対応分野はまだ登録されていません。" />
      </section>
      <section aria-labelledby="coverage-venues-title">
        <h3 id="coverage-venues-title">主要会場</h3>
        <DimensionList items={venues} emptyLabel="主要会場はまだ登録されていません。" />
      </section>
    </div>
    <section className="coverage-status__confirmation" aria-labelledby="coverage-confirmation-title">
      <h3 id="coverage-confirmation-title">確認状況</h3>
      <div className="coverage-status__status-grid">
        {(Object.keys(STATUS_LABELS) as CoverageHealth[]).map((status) => <span key={status} className={`coverage-status__status-item is-${status}`}><strong>{countLabel(summary[status])}</strong>{STATUS_LABELS[status]}</span>)}
      </div>
      {data.generatedAt && <p>この状況の生成日時：{displayDate(data.generatedAt)}</p>}
    </section>
    <section className="coverage-status__candidates" aria-labelledby="coverage-candidates-title">
      <h3 id="coverage-candidates-title">未確認候補</h3>
      <CandidateList items={candidates} />
    </section>
    {limitations.length > 0 && <section className="coverage-status__limitations" aria-labelledby="coverage-limitations-title">
      <h3 id="coverage-limitations-title">この表示の範囲</h3>
      <ul>{limitations.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>
    </section>}
  </div>;
}

export function CoverageStatus({ data, coverage, loading = false, error = '', onRetry }: CoverageStatusProps) {
  const resolvedData = data ?? coverage ?? null;
  const summaryText = useMemo(() => {
    if (!resolvedData) return '情報源と対応範囲を確認中';
    const sourceCount = resolvedData.sources?.length ?? resolvedData.summary?.sources?.length ?? 0;
    const candidateCount = resolvedData.candidates?.length ?? 0;
    return `情報源 ${sourceCount}件 ・ 未確認候補 ${candidateCount}件`;
  }, [resolvedData]);

  if (loading) return <section className="coverage-status" aria-labelledby="coverage-status-title" role="status">
    <div className="coverage-status__state-card is-loading">
      <p className="coverage-status__eyebrow">収集の透明性</p>
      <h2 id="coverage-status-title">現在の収集状況</h2>
      <p><span className="coverage-status__loading-dot" aria-hidden="true" />監視中の情報源と対応範囲を確認しています…</p>
    </div>
  </section>;

  if (error) return <section className="coverage-status" aria-labelledby="coverage-status-title" role="alert">
    <div className="coverage-status__state-card is-warning">
      <p className="coverage-status__eyebrow">収集の透明性</p>
      <h2 id="coverage-status-title">監視状況を確認できません</h2>
      <p>イベント一覧は通常どおりご利用いただけます。参加前は各イベントの公式サイトをご確認ください。</p>
      {onRetry && <button type="button" onClick={onRetry}>再確認</button>}
    </div>
  </section>;

  if (!resolvedData) return <section className="coverage-status" aria-labelledby="coverage-status-title" role="status">
    <div className="coverage-status__state-card is-empty">
      <p className="coverage-status__eyebrow">収集の透明性</p>
      <h2 id="coverage-status-title">収集範囲はまだ表示できません</h2>
      <p>監視中の情報源や対応分野は未登録です。イベント一覧は通常どおりご利用いただけます。</p>
    </div>
  </section>;

  return <section className="coverage-status" aria-labelledby="coverage-status-title">
    <details className="coverage-status__disclosure">
      <summary>
        <span className="coverage-status__summary-copy">
          <span className="coverage-status__eyebrow">収集の透明性</span>
          <strong id="coverage-status-title">現在の収集状況</strong>
          <small>{summaryText}</small>
        </span>
        <span className="coverage-status__summary-hint">詳細を開く</span>
      </summary>
      <CoverageBody data={resolvedData} />
    </details>
  </section>;
}
