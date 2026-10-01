# Verified outing occurrences

This bounded snapshot covers the comparison window **2026-09-28 through 2026-10-28**. It contains fourteen occurrences verified against first-party event, venue, or organizer pages on 2026-09-29–30. The summaries in `data/verified-outings.json` are short independent descriptions of those official pages; no WalkerPlus, Matsuri, or other directory copy is used.

| Official event title | Verified 2026 dates | Osaka venue | Official evidence page |
| --- | --- | --- | --- |
| 空庭妖怪祭 | 2026-08-08–09-30 | 空庭温泉 OSAKA BAY TOWER | [空庭温泉 event page](https://solaniwa.com/lp/youkai_matsuri_26/) |
| 特別展「大絶滅展―生命史のビッグファイブ」 | 2026-07-17–10-12 | 大阪市立自然史博物館 ネイチャーホール | [Osaka exhibition outline](https://daizetsumetsu.jp/outline_osaka.html) |
| 北海道ブッフェ 第2弾～北の大地の恵みを味わう～ | 2026-07-01–09-30 | スカイレストラン エトワール（都シティ 大阪天王寺） | [Official hotel press release](https://d33qqn1gw1wkus.cloudfront.net/pressrelease/1213/) |
| リアル脱出ゲーム『ある実験室からの脱出』（リバイバル） | 2026-05-21–10-25 | リアル脱出ゲーム大阪恵美須町店 | [SCRAP venue event page](https://realdgame.jp/ajito/osaka_nazobldg/event/jikkenn.html?pj_id=none) |
| てんしばオクトーバーフェスト2026 | 2026-09-11–10-04 | てんしば | [Tenshiba event page](https://www.tennoji-park.jp/event/detail/5416a82d-41c3-4b12-84de-981f204c7de2) |
| リアル脱出ゲーム×名探偵コナン『疾風の追走からの脱出』 | 2026-07-09–10-12 | リアル脱出ゲーム大阪心斎橋店 | [SCRAP Shinsaibashi event page](https://realdgame.jp/ajito/osaka/2026/07/post-43.html) |
| Autumn Fest 2026 第2弾！ | 2026-09-26–10-24 | OSAKA STATION CITY | [Osaka Station City event page](https://osakastationcity.com/event/6374/) |
| 企画展「ミュシャ芸術博覧会リターンズ」 | 2026-08-01–11-29 | 堺 アルフォンス・ミュシャ館 | [Museum exhibition page](https://mucha.sakai-bunshin.com/event/mucha2026ex2/) |
| パンとドーナツの世界 | 2026-10-09–10-12 | ららぽーとEXPOCITY 1F 光の広場 | [Mall event page](https://mitsui-shopping-park.com/lalaport/expocity/event/3592977.html) |
| 九州四国物産展 | 2026-09-18–09-30 | イオンモール堺北花田 1F ウェルカムコート | [Mall event page](https://sakaikitahanada.aeonmall.jp/event/a87d5402-2b15-4a9d-af76-031a9747d546) |
| Vintage Market -万博 蚤の市-2026秋 | 2026-10-23–10-25 | 万博記念公園 東の広場 | [Park event page](https://www.expo70-park.jp/event/77096/) |
| SAKANA&JAPAN FESTIVAL2026 in 万博記念公園 | 2026-10-02–10-04 | 万博記念公園 お祭り広場 | [Organizer event page](https://37sakana.jp/sjfesosaka/index.html) |
| ZUMZUM KITCHENCAR FES in 堺市大泉緑地 | 2026-10-03 | 大泉緑地 大芝生広場 | [Promoter event page](https://www.kaeru-studio.com/live-detail?n=c58445f1c3330378aba824164440d3da) |
| Seaside Terrace BBQ 2026 | 2026-07-10–09-30 | ドーセット バイ アゴーラ 大阪堺 シーサイドテラス | [Hotel event page](https://www.agoradorsett-sakai.com/event/seasideterrace_bbq/) |

The Tenshiba page calls the occurrence `てんしばオクトーバーフェスト2026` and says the `世界ワインフェス` runs at the same time. The record keeps the page's official event title and summarizes the wine-festival detail. The currently available Osaka Station City page is specifically `Autumn Fest 2026 第2弾！`; the record follows that page's current title and 9/26 start date.

SCRAP's live [実験室 event page](https://realdgame.jp/ajito/osaka_nazobldg/event/jikkenn.html?pj_id=none) now states `2026年5月21日(木)〜` without an end date. Its earlier `10月25日` evidence no longer matches, so the adapter withholds that occurrence and reports the mismatch. A search-engine cache is not used as current confirmation.

The requested **水上さんぽガイドツアー 中之島公園** candidate is excluded. [The Japan City SUP Association page](https://www.citysup.jp/walkable_26/) names the course, gives an Osaka meeting point, and shows 2026 publication/update dates plus booking links. Its booking calendar displayed an explicit September 30 session, but the collector does not yet have a reliable adapter for that dynamic calendar. The landing page alone does not state a complete 2026 event range, so that range is not inferred. Add only a date that the first-party calendar can revalidate during collection.

The [hotel's Seaside Terrace BBQ](https://www.agoradorsett-sakai.com/event/seasideterrace_bbq/) ends September 30 and requires booking by 15:00 on the previous day. Its listing is marked `registration_closed` on September 30, so the user can still find the event and see why new booking is unavailable. The usual recommendation ranking excludes closed registration.

Every included field (`eventName`, `dateRange`, `venueName`, `osakaLocation`, and `description`) carries its own `sourceUrl`, evidence text, and `checkedAt`. The adapter fetches each referenced page and requires every evidence snippet to remain present before publishing a fresh record. A fetch failure may retain the checked snapshot as stale with its original timestamp; a changed page that no longer contains required evidence is withheld. Events whose end date is before the current date in Japan are omitted.
