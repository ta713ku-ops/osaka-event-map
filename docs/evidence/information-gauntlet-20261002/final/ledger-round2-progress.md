# Gauntlet Loop: information-20261002-v2

- Status: **active**
- Updated: 2026-10-03T04:42:17Z
- Workspace: `/Users/taku/開発/地図`
- Goal: 大阪のお出かけ情報の掲載範囲・公式整合・検索と参加判断を改善する
- Bar: Walkerplus大阪・堺・吹田・枚方と祭りどころ大阪の固定実情報
- Judge question: 同じ固定催事と検索日時条件で、大阪のお出かけ先を実際に選び参加可否を判断する情報として、どちらが全体で優れているか

## Bar sources and provenance

- /private/tmp/osaka-info-gauntlet-20261002/reference (`sha256:957598ab64bc…`)
- https://www.walkerplus.com/event_list/ar0727/
- https://www.matsuri-dokoro.jp/ja/events?prefecture=%E5%A4%A7%E9%98%AA%E5%BA%9C

## Deterministic gates

- official_evidence
- coverage
- schedule_correctness
- search_consistency
- regression_tests
- production_build
- browser_runtime

## Pieces

| Piece | Status |
|---|---|
| coverage | pending |
| search | pending |
| details | pending |
| overall | passed |

## Iteration history

| Round | Scope | Verdict | Confidence | Change | Biggest gap | Next |
|---:|---|---|---|---|---|---|
| 1 | overall | bar | medium | 改修前の固定38主題の実情報を匿名比較 | 21主題の未収録と参加判断情報不足 | 公式一次情報を補完し検索と日程を修正、実成果物を再審査 |
| 2 | overall | ours | medium | 38主題の公式情報補完と日程・費用・画像の統合修正 | 比較対象はART最終日16時閉場を欠き、終了後来場を招く | 公式一次情報で残存の休館例外・料金情報を確認し再判定 |

## Latest evidence

- 独立Sol6.1が全38主題を確認し改善版優位、全7ゲート合格。改善版のミュシャ休館例外等の不足も指摘

### Latest gate results

- official_evidence: **pass**
- coverage: **pass**
- schedule_correctness: **pass**
- search_consistency: **pass**
- regression_tests: **pass**
- production_build: **pass**
- browser_runtime: **pass**

### Latest artifacts

- Candidate: `/private/tmp/osaka-info-gauntlet-20261002/packets/candidate-round2.json`
- Candidate SHA-256: `c11ff1ac18c4a4f871705c8dfa00b188e1b1a8d321c0b5e8c934d8a9a90209e2`
- Bar capture: `/private/tmp/osaka-info-gauntlet-20261002/packets/reference-fixed.json`
- Bar SHA-256: `c618e3012c11e6723fc926bc921c3b82bdc09a9e7bfc179051ab1256201b4f93`
- Supporting: `/private/tmp/osaka-info-gauntlet-20261002/critic-round2.json`

_Generated from `state.json` and `history.jsonl`; do not hand-edit this page._
