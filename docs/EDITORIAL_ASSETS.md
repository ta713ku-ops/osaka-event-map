# Editorial image assets

> 2026-09-01更新: 下記の生成画像は現在のホームでは使用していない。大阪府イベントCSVの「画像」URLを `imageUrl` として表示し、読み込み失敗時は日付・カテゴリ面へ戻る。生成画像は以前の比較記録を再現するため残している。

以前ホームのイベント発見画面で使用していた、汎用イメージ素材の記録。いずれも実際のイベント会場写真ではない。

| 公開ファイル | 用途 | 生成元 |
| --- | --- | --- |
| `public/editorial-garden.jpg` | ガーデン、植物、ハーブ、野菜等に紐づくイベント | `/Users/taku/.codex/generated_images/01a051f4-0191-7e71-ae6a-1d8090fc6d11/exec-6ac0745b-2291-4243-9acb-1b5dd736008f.png` |
| `public/editorial-market.jpg` | マルシェ、マーケット、市場、陶器等に紐づくイベント | `/Users/taku/.codex/generated_images/01a051f4-0191-7e71-ae6a-1d8090fc6d11/exec-ac3e3cc1-a2ae-4479-8136-9d91df26ac6c.png` |

## Processing

両素材とも imagegen で生成し、その後 `sips` で JPEG（品質84）へ変換した。

## Prompts

### Garden

> Photorealistic editorial photograph for a Japanese local experiences discovery website. Close tactile view of fresh green herbs and a small wooden-handled garden trowel in a sunlit raised garden bed, rosemary mint and basil, human hand gently picking a leaf, no face. Japanese public park garden in soft background, late summer sunlight, olive green and warm cream tones. Landscape 3:2, natural film grain, beautifully composed but documentary, no text, no logos, no border. Generic illustrative image, not a specific actual event.

### Market

> Photorealistic premium Japanese editorial travel photograph, landscape 3:2. An intimate outdoor weekend craft market in a leafy Japanese urban park: foreground handmade glazed ceramics in pale cream and terracotta with a few linen cloths, flowers and wooden tables, softly out-of-focus visitors and fabric canopies behind. Gentle September afternoon sunlight, tactile materials, candid warm atmosphere. No readable text, no logos, no border. Generic illustrative image, not a specific actual event.
