export const CATEGORY_LABELS: Record<string, string> = {
  festival: '祭り・フェス', fireworks: '花火', shopping: 'ショッピング', zoo: 'いきもの',
  aquarium: '水族館', amusement: '遊園地', themePark: 'テーマパーク', food: 'グルメ',
  market: 'マルシェ', fleaMarket: 'フリーマーケット', exhibition: '展覧会', museum: '博物館',
  workshop: '体験・教室', seasonal: '季節イベント', illumination: 'イルミネーション', night: '夜イベント',
  music: '音楽', theater: '演劇', sports: 'スポーツ',
};

export function eventCategoryLabel(category?: string | null): string {
  return (category && CATEGORY_LABELS[category]) || 'イベント';
}
