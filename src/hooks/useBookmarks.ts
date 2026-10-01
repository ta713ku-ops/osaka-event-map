import { useEffect, useState } from 'react';
import { BOOKMARKS_KEY, parseBookmarks, toggleBookmark, type Bookmark } from '../domain/bookmarks';
import type { EventItem } from '../types';

export function useBookmarks() {
  const [initial] = useState(() => {
    try { return { items: parseBookmarks(localStorage.getItem(BOOKMARKS_KEY)), error: '' }; }
    catch { return { items: [] as Bookmark[], error: '保存したイベントを読み込めませんでした。この端末の保存設定をご確認ください。' }; }
  });
  const [items, setItems] = useState(initial.items);
  const [notice, setNotice] = useState(initial.error);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== BOOKMARKS_KEY && event.key !== null) return;
      try { setItems(parseBookmarks(event.newValue)); setNotice(''); }
      catch { setNotice('保存したイベントを読み込めませんでした。'); }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const persist = (next: Bookmark[]) => {
    try { localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(next)); setItems(next); setNotice(''); }
    catch { setNotice('保存できませんでした。ブラウザの保存設定をご確認ください。'); }
  };
  return { items, notice, dismiss: () => setNotice(''), has: (id: string) => items.some(item => item.routeId === id),
    toggle: (event: EventItem) => persist(toggleBookmark(items, event)),
    remove: (id: string) => persist(items.filter(item => item.routeId !== id)) };
}
