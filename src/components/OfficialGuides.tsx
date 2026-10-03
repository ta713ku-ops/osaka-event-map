import type { SeasonalGuide } from '../types';
import './official-guides.css';

export function OfficialGuides({ guides }: { guides: SeasonalGuide[] }) {
  if (!guides.length) return null;
  return <section className="official-guides" aria-label="開催日確定前の公式案内">
    <p className="official-guides__eyebrow">開花を待つ、秋のよりみち。</p>
    <h2>開催日確定前の公式案内</h2>
    <p>公式の予想です。今日・今夜・今週末の開催件数には含めていません。</p>
    {guides.map(guide => <article key={guide.id}>
      <h3>{guide.title}</h3><p className="official-guides__period">{guide.periodText}</p>
      <p>{guide.venueName}</p><p>{guide.description}</p><p>{guide.bloomStatus}</p>
      <a href={guide.officialUrl} target="_blank" rel="noreferrer">開花状況を公式で確認 ↗</a>
      <details><summary>料金・交通と公式の根拠を見る</summary>
        <dl>{([['priceInfo', '料金'], ['timeInfo', '営業時間'], ['accessByTransit', '交通'], ['parkingInfo', '駐車場'], ['address', '住所'], ['contact', '問い合わせ']] as const).map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{guide[key]} {guide.fieldEvidence[key]?.sourceUrl && <a href={guide.fieldEvidence[key].sourceUrl} target="_blank" rel="noreferrer">{label}の公式情報 ↗</a>}</dd></div>)}</dl>
        <p>公式ページ確認：{new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' }).format(new Date(guide.lastCheckedAt))}{guide.sourceStatus === 'stale' ? '（最新の更新を確認できていません）' : ''}</p>
        <p>開花予想から特定の開催日は補っていません。休園日・最新の見ごろは公式でご確認ください。</p>
      </details>
    </article>)}
  </section>;
}
