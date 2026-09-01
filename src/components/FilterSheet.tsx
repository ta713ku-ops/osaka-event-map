import { useEffect, useState } from 'react';
import { useDialogFocus } from './useDialogFocus';

export type EventFilters = {
  time?: 'today' | 'tomorrow' | 'tonight' | 'weekend';
  withinMinutes?: 30 | 60;
  free?: boolean;
  rainOk?: boolean;
  family?: boolean;
  date?: boolean;
  night?: boolean;
  categories?: string[];
};

type Props = { open: boolean; value: EventFilters; onChange: (value: EventFilters) => void; onClose: () => void; categories?: string[] };
const OPTIONS = [
  ['withinMinutes', '30分以内', 30], ['withinMinutes', '60分以内', 60],
  ['free', '無料', true], ['rainOk', '雨でもOK', true], ['family', '子ども向け', true],
  ['date', 'デート向け', true], ['night', '夜イベント', true],
] as const;
const CATEGORY_LABELS: Record<string, string> = {
  festival: '祭り・フェス', fireworks: '花火', shopping: 'ショッピング', zoo: 'いきもの', aquarium: '水族館',
  amusement: '遊園地', themePark: 'テーマパーク', food: 'グルメ', market: 'マルシェ', fleaMarket: 'フリーマーケット',
  exhibition: '展覧会', museum: '博物館', workshop: '体験・教室', seasonal: '季節イベント',
  illumination: 'イルミネーション', night: '夜イベント',
};

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
  return (
    <section ref={dialogRef} className="filter-sheet" role="dialog" aria-modal="true" aria-label="条件を追加">
      <div className="sheet-header"><h2>条件を追加</h2><button type="button" onClick={onClose} aria-label="閉じる">×</button></div>
      <fieldset><legend>距離・料金・シーン</legend><div className="filter-grid">
        {OPTIONS.map(([key, label, optionValue]) => {
          const selected = draft[key] === optionValue;
          return <button type="button" key={label} className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => toggle(key, optionValue)}>{label}</button>;
        })}
      </div></fieldset>
      <fieldset><legend>カテゴリ</legend><div className="filter-grid">
        {categories.map((category) => {
          const selected = draft.categories?.includes(category) ?? false;
          return <button type="button" key={category} className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => setDraft((current) => ({ ...current, categories: selected ? current.categories?.filter((item) => item !== category) : [...(current.categories ?? []), category] }))}>{CATEGORY_LABELS[category] ?? category}</button>;
        })}
      </div></fieldset>
      <button type="button" className="filter-apply" onClick={() => { onChange(draft); onClose(); }}>この条件で探す</button>
    </section>
  );
}
