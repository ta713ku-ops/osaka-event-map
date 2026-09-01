# ローカル再開・ホーム切替検証（2026-08-31）

## 起動とiPhone

`npm run dev -- --host 0.0.0.0 --port 5173 --strictPort`

- Mac: http://localhost:5173/
- 同じWi-FiのiPhone: http://192.168.1.5:5173/
- LAN URLへのHTTP応答200をMac側で確認。Macを起動し、サーバーを動かしたまま使う。IPはネットワーク変更で変わる。
- 実iPhoneからの接続はユーザー確認待ち。ゲストWi-Fi/端末分離/ファイアウォールにより接続できないことがある。
- HTTPのLAN接続では位置情報APIが使えない。大阪駅起点で動作し、ヘッダーの現在地操作時に説明する。
- GitHub Pagesへのデプロイ、push、トンネル公開は実施していない。

## 実測したゲート

- build: typecheckとVite production build成功。
- tests: Vitest 14件成功。初期地図非表示、両CTA、戻る、検索/条件保持、詳細、Escape、再試行、Apple/Google Maps URLを含む。
- collector-and-dedup: 公式キャッシュから45件を正規化・重複排除。重複処理のドメインテスト成功。
- mobile-no-overflow / responsive-no-overflow: 320×740、390×844、760×900、1280×800でホーム/地図のmain.scrollWidthがviewport幅と一致。
- touch-targets-44px: 同4幅で表示されたbutton/inputに幅・高さ44px未満なし（非表示要素除外）。
- accessibility: 名前付き検索、ボタン名、見出し、押下状態、focus-visible、詳細への初期フォーカス、Shift+Tabで末尾リンクへの循環、Escape閉鎖を確認。背景inertとフォーカス復帰を追加。全文言/全配色のWCAG適合認証ではない。
- initial-map-hidden: 初期DOMにLeaflet containerなし。データ取得後もなし。
- map-button-transition: CTA後Leaflet地図と候補が表示され、戻るとホーム。地図タイルの実表示確認。
- event-detail-flow: ホームカードから詳細を開いても地図は未マウント。
- external-map-link: テストで座標付きApple/Google URLとnoopener,noreferrerを確認。実端末の地図アプリ起動は未確認。
- visual-capture: docs/evidence/home-r2-*に390×844と1280×800、および地図表示を保存。
- ブラウザーのerror/warnログなし。
- 条件シート・プロフィールのモバイルタップ領域も確認。プロフィールの小さな選択肢を最小幅44pxに補正。
- LAN URLをブラウザーでも開き、実イベント表示とHTTP現在地制限メッセージを確認。

## 素材とデザイン

Terracottaを継続し、クリーム面・濃い赤茶の操作色・明朝見出しを統一。ヒーローは動画ではなく、独自生成画像に4秒で終了するズームを付けた映像風演出。reduced-motionではアニメーションを抑制。

素材: public/osaka-festival-hero.jpg（生成PNGからJPEG変換）。生成モード: 新規画像。使用プロンプト要旨: Original cinematic Osaka festival street at blue hour, warm lanterns, amber and indigo, crowd from behind, calm area for headline, no text or logos, no specific event branding. 実際のイベント写真ではないことをホーム末尾に明記。
