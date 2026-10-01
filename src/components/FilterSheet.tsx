import { useEffect, useState } from 'react';
import { useDialogFocus } from './useDialogFocus';
import { CATEGORY_LABELS, EVENT_TAG_LABELS } from '../domain';
import type { EventTag } from '../types';

export type EventFilters = {
  selectedDate?: string;
  area?: string;
  sort?: 'attention' | 'date';
  feature?: string;
  time?: 'today' | 'tomorrow' | 'tonight' | 'weekend';
  withinMinutes?: 30 | 60;
  free?: boolean;
  rainOk?: boolean;
  family?: boolean;
  date?: boolean;
  night?: boolean;
  categories?: string[];
  tags?: EventTag[];
};

type Props = { open: boolean; value: EventFilters; onChange: (value: EventFilters) => void; onClose: () => void; categories?: string[] };
const OPTIONS = [
  ['withinMinutes', '概算30分以内', 30], ['withinMinutes', '概算60分以内', 60],
  ['rainOk', '雨でもOK', true], ['date', 'デート向け', true], ['night', '夜イベント', true],
] as const;
const TAG_OPTIONS: EventTag[] = ['celebrity', 'exhibition', 'family', 'free', 'limited'];
export function FilterSheet({ open, value, onChange, onClose, categories = Object.keys(CATEGORY_LABELS) }: Props) {
  const dialogRef = useDialogFocus(open);
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value, open]);
  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);
  if (!open) return null;
  const toggle = (key: keyof EventFilters, optionValue: 30 | 60 | true) => setDraft((current) => ({ ...current, [key]: current[key] === optionValue ? undefined : optionValue }));
  const toggleTag = (tag: EventTag) => setDraft((current) => {
    const selected = current.tags?.includes(tag) || (tag === 'free' && current.free === true);
    const tags = selected ? (current.tags ?? []).filter((item) => item !== tag) : [...(current.tags ?? []), tag];
    return { ...current, tags, ...(tag === 'free' ? { free: undefined } : {}) };
  });
  return (
    <section ref={dialogRef} className="filter-sheet" role="dialog" aria-modal="true" aria-label="条件を追加">
      <div className="sheet-header"><h2>条件を追加</h2><button type="button" onClick={onClose} aria-label="閉じる">×</button></div>
      <p className="data-note">条件は公式に確認できた情報から絞り込みます。移動時間は直線距離による概算です。</p><fieldset><legend>距離・シーン</legend><div className="filter-grid">
        {OPTIONS.map(([key, label, optionValue]) => {
          const selected = draft[key] === optionValue;
          return <button type="button" key={label} className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => toggle(key, optionValue)}>{label}</button>;
        })}
      </div></fieldset>
      <fieldset><legend>イベントの特徴</legend><div className="filter-grid">
        {TAG_OPTIONS.map((tag) => {
          const selected = draft.tags?.includes(tag) || (tag === 'free' && draft.free === true);
          return <button type="button" key={tag} className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => toggleTag(tag)}>{EVENT_TAG_LABELS[tag]}</button>;
        })}
      </div></fieldset>
      <fieldset><legend>カテゴリ</legend><div className="filter-grid">
        {categories.map((category) => {
          const selected = draft.categories?.includes(category) ?? false;
          return <button type="button" key={category} className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => setDraft((current) => ({ ...current, categories: selected ? current.categories?.filter((item) => item !== category) : [...(current.categories ?? []), category] }))}>{CATEGORY_LABELS[category] ?? category}</button>;
        })}
      </div></fieldset>
      <button type="button" className="filter-reset" onClick={() => setDraft({})}>すべての条件を解除</button>
      <button type="button" className="filter-apply" onClick={() => { onChange(draft); onClose(); }}>この条件で探す</button>
    </section>
  );
}
