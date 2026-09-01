# どこいこ大阪

「今日どこ行く？」に答える、大阪府のモバイルファースト・イベント発見マップ試作版です。大阪府公式オープンデータを取得し、地図・時間・距離・同行者・好みから行き先候補を見つけられます。

## 起動

```bash
npm install
npm run dev
```

## iPhoneでローカル確認

MacとiPhoneを同じWi-Fiにつなぎ、Macで `npm run dev:lan` を実行します。
表示される `Network: http://192.168.x.x:5173/` をiPhoneのSafariで開いてください。
Macと開発サーバーを起動したまま使います。iPhone側の `localhost` はMacには接続しません。
ゲストWi-Fiの端末分離やmacOSのファイアウォールにより接続できない場合があります。
LANのHTTPでは現在地取得が制限されるため、大阪駅起点で確認してください。

起動直後は大阪府周辺の地図です。「今日」「今夜」「明日」「今週末」をワンタップで切り替え、ピンから詳細と外部地図へ進めます。

## データ更新

```bash
npm run collect
```

大阪府公式の「イベント一覧」CSVを取得し、重複排除・型正規化して `public/data/events.json` を更新します。ビルドではリポジトリ内の検証済みキャッシュを使います。

## 検証

```bash
npm run typecheck
npm test
npm run build
```

## データ出典

- 大阪府「イベント一覧」
- 提供: 大阪府 / BODIK
- ライセンス: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.ja)
- [データセット](https://data.bodik.jp/dataset/270008_event)

イベント内容は変更される場合があります。参加前に各イベントの公式サイトを確認してください。
