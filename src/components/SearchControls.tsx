import type { EventFilters } from './FilterSheet';
import { AREAS } from '../domain/discovery';
import { CATEGORY_LABELS, EVENT_TAG_LABELS } from '../domain';

export function SearchControls({ filters, onChange, onOpenFilters, onReset, query, onClearQuery, dateLabel, onClearDate, today, compact = false }: {
  filters: EventFilters; onChange: (value: EventFilters) => void; onOpenFilters: () => void; onReset: () => void;
  query: string; onClearQuery: () => void; dateLabel?: string; onClearDate: () => void; today: string; compact?: boolean;
}) {
  const remove = (key: keyof EventFilters) => { const next = { ...filters }; delete next[key]; onChange(next); };
  const chips: { label: string; remove: () => void }[] = [];
  if (query) chips.push({ label: `検索：${query}`, remove: onClearQuery });
  if (dateLabel) chips.push({ label: dateLabel, remove: onClearDate });
  if (filters.area) chips.push({ label: AREAS.find(([id]) => id === filters.area)?.[1] ?? filters.area, remove: () => remove('area') });
  for (const category of filters.categories ?? []) chips.push({ label: CATEGORY_LABELS[category] ?? category, remove: () => onChange({ ...filters, categories: filters.categories?.filter(c => c !== category) }) });
  for (const tag of filters.tags ?? []) chips.push({ label: EVENT_TAG_LABELS[tag], remove: () => onChange({ ...filters, tags: filters.tags?.filter(t => t !== tag) }) });
  for (const [key, label] of [['free', '無料'], ['family', '子どもと'], ['rainOk', '雨でもOK'], ['date', 'デート向け'], ['night', '夜イベント'], ['withinMinutes', `概算${filters.withinMinutes}分以内`], ['feature', '季節の特集']] as const) {
    if (filters[key]) chips.push({ label, remove: () => remove(key) });
  }
  const fields = <div className="search-controls__fields">
      <label>日付を指定<input type="date" aria-label="日付を指定" min={today} value={filters.selectedDate ?? ''} onChange={event => onChange({ ...filters, selectedDate: event.target.value || undefined })} /></label>
      <label>エリア<select aria-label="エリア" value={filters.area ?? ''} onChange={event => onChange({ ...filters, area: event.target.value || undefined })}><option value="">大阪全域</option>{AREAS.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>並び順<select aria-label="並び順" value={filters.sort ?? 'attention'} onChange={event => onChange({ ...filters, sort: event.target.value as 'attention' | 'date' })}><option value="attention">注目順</option><option value="date">開催日順</option></select></label>
      <button type="button" onClick={onOpenFilters}>ジャンル・条件</button>
      <button type="button" aria-pressed={filters.free === true} onClick={() => onChange({ ...filters, free: filters.free ? undefined : true })}>無料</button>
    </div>;
  return <div className={`search-controls${compact ? ' is-compact' : ''}`} aria-label="イベントの検索条件">
    {compact ? <details className="search-options"><summary>日付・エリア・並び順を選ぶ</summary>{fields}</details> : fields}
    {!!chips.length && <div className="active-conditions" aria-label="適用中の条件">{chips.map((chip, index) => <button key={`${chip.label}-${index}`} type="button" aria-label={`${chip.label}を解除`} onClick={chip.remove}>{chip.label} ×</button>)}<button type="button" onClick={onReset}>すべて解除</button></div>}
  </div>;
}
