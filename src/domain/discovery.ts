import type { EventItem } from '../types';
import { isPromotionEvent } from './eventEligibility';

export const AREAS = [
  ['osaka-kita', '梅田・中之島', /大阪市北区/],
  ['osaka-minami', 'なんば・心斎橋', /大阪市(?:中央区|浪速区)/],
  ['osaka-tennoji', '天王寺・あべの', /大阪市(?:天王寺区|阿倍野区)/],
  ['osaka-bay', '大阪ベイエリア', /大阪市(?:港区|此花区|住之江区)/],
  ['osaka-other', '大阪市のその他', /大阪市/],
  ['hokusetsu', '北摂', /(?:吹田|豊中|茨木|高槻|池田|箕面|摂津)市|(?:島本|豊能|能勢)町/],
  ['kawachi', '河内', /(?:守口|門真|枚方|寝屋川|交野|四條畷|大東|東大阪|八尾|柏原|松原|藤井寺|羽曳野|富田林|河内長野|大阪狭山)市|(?:太子|河南)町|千早赤阪村/],
  ['sakai', '堺・泉州', /堺市|(?:和泉|高石|泉大津|岸和田|貝塚|泉佐野|泉南|阪南)市|(?:忠岡|熊取|田尻|岬)町/],
] as const;
export function eventArea(event: EventItem): string | undefined {
  // Only explicit addresses establish a region; venue names are not geocoded guesses.
  return AREAS.find(([, , pattern]) => pattern.test(event.address ?? ''))?.[0];
}
export type EditorialFeature = { id: string; title: string; description: string; events: EventItem[] };
export function editorialFeatures(events: EventItem[], now: Date): EditorialFeature[] {
  const month = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', month: 'numeric' }).format(now));
  const season = month >= 9 && month <= 11 ? { title: '秋のよりみち', pattern: /秋|紅葉|ハロウィン/ }
    : month >= 6 && month <= 8 ? { title: '夏のよりみち', pattern: /夏|花火|七夕/ }
      : month >= 3 && month <= 5 ? { title: '春のよりみち', pattern: /春|桜|花見/ }
        : { title: '冬のよりみち', pattern: /冬|クリスマス|イルミネーション|初詣/ };
  const matching = events.filter(event => season.pattern.test(event.eventName)
    && !isPromotionEvent(event) && (!event.officialStatus || event.officialStatus === 'scheduled'));
  return matching.length ? [{ id: 'season', title: season.title, description: '公式のイベント名から、季節の催しを集めました。開催日と参加条件を確かめてお出かけください。', events: matching }] : [];
}
