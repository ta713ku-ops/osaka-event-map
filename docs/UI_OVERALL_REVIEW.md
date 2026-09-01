# 地図中心UI・Gauntlet最終記録

## 結果

起動直後から大阪地図を表示し、「今日」「今夜」「明日」「今週末」、カテゴリ文字入りピン、下部候補レール、イベント詳細シート、Apple Maps / Google Maps導線までを同一画面上に統合した。

祭りどころの日本語マップを390×844で固定キャプチャし、識別情報を可能な範囲で隠したA/B比較を実施。第1回criticはこちらをhigh confidenceで選び、比較6ゲートをpassとした。その後、「ラベル密集と汎用ピン記号」を最大ギャップとする指摘を受け、常時ラベルを4件へ絞り、全カテゴリに文字記号を付与。最終の新規criticもこちらをhigh confidenceで選好した。

## 検証結果

- TypeScript typecheck: pass
- Vitest: 3 files / 21 tests pass
- Vite production build: pass
- npm audit: 0 vulnerabilities
- 大阪府公式BODIK CSV: 42件、ID重複0、座標欠落0
- 390×844: 地図初期表示、横overflow 0、可視ボタン44px以上、Safe Area対応
- 1280×800: 候補486.4px / 地図793.6px、横overflow 0
- 詳細シート: 背景遮蔽、閉じる操作への初期focus、Escape、focus trap / 復帰
- 外部地図: Apple Maps / Google Maps URL unit test pass
- 秘密情報: `.env`、鍵、token、DB、backup、`dist`、`node_modules`は追跡対象外

## 注意

「開催期間中」は公閏データの日付範囲内を意味し、当日の即時開催や受付状況を保証しない。明示時刻のないイベントは「今夜」に推測表示しない。実機iPhone Safariでの外部Mapsアプリ起動は利用者端末での最終確認が残る。

Gauntlet run: `/Users/taku/.codex/gauntlet-loop/runs/run-75d3da874faf/20260901-093906-625199-web`
