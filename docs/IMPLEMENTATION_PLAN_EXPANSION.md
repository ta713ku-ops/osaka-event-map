# 収集拡張とファーストビュー演出

## 承認済み範囲
- 収集件数の上限を撤廃し、公式の自治体・文化施設・観光・商業施設・公演情報を複数ソースから集約する。
- 有名人来場、展覧会、親子、無料、期間限定を根拠付きで分類する。推測で人物の知名度や料金を補完しない。
- 既存Editorialの配色・一覧の読みやすさを維持し、最初の画面の写真・見出しの連動演出を強化する。
- 長い操作ブロックを設けない。reduced motion、手動停止、画像失敗、読込・空・失敗状態を維持する。

## 体制
- Sol: 計画・契約・レビュー・統合・最終検証
- Luna MAX: 全実装ワーカー

## TODO
- [in_progress] A: scripts/collect-events.mjs と収集共通処理・テスト。上限撤廃、正規化、重複、キャッシュ、取得レポート。
- [in_progress] B: scripts/sources/ と data/sources/ の追加公式収集先。実取得、出典、取得可能範囲の記録。
- [review] C: HomeDiscovery のファーストビューと専用CSS・テスト。カード一覧は維持。親390px幅確認済み、デスクトップ操作領域の余白と検索後の切替参照を最終修正中。
- [in_progress] D: App/types/FilterSheet の分類・件数・出典統合。C担当Luna MAXへ移管しAとの並列を継続。
- [in_progress] E: 全テスト、ブラウザの時系列・モバイル・地図導線検証、セキュリティ・公開確認。

## データ契約
追加ソースは scripts/sources/index.mjs から collectAdditionalEvents({ fetchText, now }) をexport。
fetchText(url)は親の取得関数。返り値は { events, sources }。
eventsは既存EventItem相当（eventName/startDate/endDate/venueName/address/latitude/longitude/officialUrl/source/sourceUrl/lastCheckedAt）。取得できない座標は捏造しない。
sourcesは { id, name, url, status, count, checkedAt, error? }[]。取得失敗を空の成功扱いにしない。
追加データはsourceId、tags（celebrity/exhibition/family/free/limited）、根拠を保持可能。
ネットワーク処理はタイムアウト・低並列度・公開ページのみ。認証/アクセス制限を回避しない。

## 再開時レビューの重点
- 実取得した全イベントのsnapshotとパーサーテスト用の小さなfixtureを分離する。ビルドでfixtureへ置き換えない。
- live収集→cachedビルドのID集合・件数・確認日時を一致させる。
- 失敗したsourceだけ前回情報へ戻し、source自身の確認日時から14日を超えて延命しない。
- 無料駐車場・子どもだけ無料・数量限定・一般ゲストを全体無料/期間限定/有名人来場と誤分類しない。
- CMSの掲載期間と実開催日を区別し、離散開催日を連続期間に変換しない。
- 公式リンクのhref抽出、地図座標なしの詳細保持、今夜18時以降・今週末の判定を回帰検証する。

## 親レビューの実画面確認（公開前）
- 一覧の「もっと見る」を7回操作し、48件まで表示できることを確認。
- 390×844のレイアウトでdocument幅・scroll幅とも390px、横はみ出しなし。
- モバイルのhero詳細ボタン下端594.6px、演出操作領域の上端621.1pxで重ならないことを計測。
- 演出を停止するとタイトルが維持されること、美術館名で検索できることを確認。
- 座標のない美術館イベントを地図側候補から開き、詳細が消えず、住所と公式URLを確認できることを確認。
- 本番再収集・最終ビルド・公開版の確認は全ワーカーの修正統合後に実施する。
