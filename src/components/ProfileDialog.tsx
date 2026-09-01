import { useEffect, useState } from 'react';
import { useDialogFocus } from './useDialogFocus';

export type Profile = { companion?: string; children?: string; transport?: string; favorites?: string[]; maxMinutes?: 30 | 60 | 90 | 0 };
type Props = { open: boolean; value: Profile; onChange: (value: Profile) => void; onClose: () => void; onSave?: (value: Profile) => void };
const CHOICES = {
  companion: ['ひとり', '恋人・夫婦', '友達', '家族'], children: ['なし', '未就学', '小学生', '中高生'],
  transport: ['車', '電車', '徒歩・自転車'], favorites: ['祭り', 'グルメ', '展覧会', '自然', '夜イベント'],
  maxMinutes: ['30分', '60分', '90分', '制限なし'],
};

export function ProfileDialog({ open, value, onChange, onClose, onSave }: Props) {
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
  const normalized = (key: keyof Profile, label: string) => key === 'maxMinutes' ? (label === '制限なし' ? 0 : Number(label.replace('分', ''))) : label;
  const choose = (key: keyof Profile, label: string) => setDraft((current) => ({ ...current, [key]: normalized(key, label) }));
  return (
    <section ref={dialogRef} className="profile-dialog" role="dialog" aria-modal="true" aria-label="あなたの好み">
      <div className="dialog-header"><h2>あなたに合うイベントを探す</h2><button type="button" onClick={onClose} aria-label="閉じる">×</button></div>
      <p>5つの質問でおすすめを調整します。</p>
      {(['companion', 'children', 'transport', 'maxMinutes'] as const).map((key) => (
        <fieldset key={key}><legend>{{ companion: '誰と出かける？', children: '子どもは？', transport: '主な移動手段', maxMinutes: '移動時間の上限' }[key]}</legend><div className="choice-row">
          {CHOICES[key].map((label) => {
            const selected = String(draft[key] ?? '') === String(normalized(key, label));
            return <button type="button" key={label} className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => choose(key, label)}>{label}</button>;
          })}
        </div></fieldset>
      ))}
      <fieldset><legend>好きなイベント（複数可）</legend><div className="choice-row">
        {CHOICES.favorites.map((label) => {
          const selected = draft.favorites?.includes(label) ?? false;
          return <button type="button" key={label} className={selected ? 'is-selected' : ''} aria-pressed={selected} onClick={() => setDraft((current) => ({ ...current, favorites: selected ? current.favorites?.filter((item) => item !== label) : [...(current.favorites ?? []), label] }))}>{label}</button>;
        })}
      </div></fieldset>
      <button type="button" className="profile-save" onClick={() => { onChange(draft); onSave?.(draft); onClose(); }}>設定を保存</button>
    </section>
  );
}
