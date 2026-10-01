import type { EventItem } from '../types';

/** Listing visibility stays separate from editorial recommendation eligibility. */
export function isPromotionEvent(event: EventItem): boolean {
  if (event.category === 'shopping') return true;
  if (/(?:ボランティア募集|登録済者のみ|会員限定|家族カード発行|短期レッスン|超[!！]?CO+L作戦)/iu.test(event.eventName)) return true;
  if (/(?:受注会|販売会|展示販売|期間限定販売|ポップアップショップ|POP[ -]?UP(?: (?:SHOP|STORE)|開催|展)|セール|実演販売|商品説明会|(?:公式|オフィシャル)ショップ|(?:サポーター|会員|募金).*募集|ポイント.{0,8}(?:\d+倍|アップ)|(?:服|衣類|古着).*(?:回収|買取)|MORE VARIATION|(?:無料)?相談会)/iu.test(event.eventName)) return true;
  const description = event.description ?? '';
  if (/^(?:grand-front|lucua|aeon-|hankyu-)/u.test(event.sourceId ?? '')
    && /販売|お買い上げ|コレクション|豊富に.*(?:展開|取り揃)/u.test(description.slice(0,400))
    && !/ワークショップ|体験|縁日|フェス|マルシェ/u.test(event.eventName)) return true;
  if (/^(?:grand-front|lucua|aeon-|hankyu-)/u.test(event.sourceId ?? '')
    && /専門店|座椅子|ニット|アパレル|お洋服/u.test(description.slice(0,200))
    && !/ワークショップ|体験|縁日|フェス|マルシェ/u.test(event.eventName)) return true;
  return /参加条件[\s\S]{0,100}(?:お買い上げ|ご購入)/u.test(description)
    || /(?:ご購入|お買い上げ)[\s\S]{0,30}(?:エントリー|応募)/u.test(description);
}
