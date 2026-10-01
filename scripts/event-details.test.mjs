import test from 'node:test';
import assert from 'node:assert/strict';
import {parseEventDetails,mergeEventDetails,parseWizardOsakaDetails,parseBillboardPerformanceDetails,parseNambaUnkaiDetails} from './lib/event-details.mjs';
import {enrichVenues,enrichVerifiedFacts} from './lib/venues.mjs';
const checkedAt='2026-09-28T00:00:00Z';
const e={id:'x',eventName:'実験体験',sourceId:'science-museum',officialUrl:'https://www.sci-museum.jp/event/#pl123',startDate:'2026-10-03',venueName:'大阪市立科学館'};
test('isolates a science session from other events and keeps separated time slots',()=>{
 const html='<div id="pl123"><h3>実験体験</h3><p>手を動かして観察する実験体験を親子で一緒に楽しむことができます。</p></div><table><tr><th>日時</th><td>2026年10月3日 ①13:30〜14:30 ②15:00〜16:00</td></tr><tr><th>参加費</th><td>無料（展示場観覧料が必要）</td></tr><tr><th>申込方法</th><td>Webで申し込み <a href="https://example.test/apply">申込</a></td></tr></table><div id="pl456"><h3>別イベント</h3></div><table><tr><th>参加費</th><td>8,000円</td></tr></table>';
 const r=parseEventDetails(html,e,checkedAt);assert.equal(r.recognized,true);assert.equal(r.fields.price,'無料(展示場観覧料が必要)');assert.equal(r.fields.endTime,undefined);assert.match(r.fields.timeInfo,/15:00/);assert.equal(r.fields.reservationRequired,true);assert.equal(r.fields.reservationUrl,'https://example.test/apply');assert.equal(r.fields.fieldEvidence.price.sourceUrl,e.officialUrl);
});
test('rejects unrelated page content and keeps identity and date intact',()=>{
 const r=parseEventDetails('<main><h2>別イベント</h2><p>予約してお越しください。</p></main>',e,checkedAt);assert.equal(r.recognized,false);assert.equal(mergeEventDetails(e,r).startDate,e.startDate);
});
test('does not confuse an opening clock before the start label with the start clock',()=>{
 const event={...e,eventName:'演奏会',sourceId:'atc-events',officialUrl:'https://www.atc-co.com/event/test/'};
 const r=parseEventDetails('<article class="p-event-detail__article"><h2>演奏会</h2><dl><dt>開催時間</dt><dd>開場16:00 開演16:30</dd></dl></article>',event,checkedAt);assert.equal(r.fields.startTime,'16:30');assert.equal(r.fields.endTime,undefined);
});
test('venue registry requires explicit venue identity and evidence, preserving existing facts',()=>{
 const registry=[{aliases:['大阪市立科学館'],roomSuffixes:['研修室'],fields:{nearestStation:'公式駅',address:'公式住所'},fieldEvidence:{nearestStation:{sourceUrl:'https://example.test/access',checkedAt},address:{sourceUrl:'https://example.test/access',checkedAt}}}];
 const rows=enrichVenues([{...e,address:'既存住所'},{...e,venueName:'大阪市立科学館 研修室'},{...e,venueName:'別会場'}],registry);
 assert.equal(rows[0].address,'既存住所');assert.equal(rows[1].nearestStation,'公式駅');assert.equal(rows[2].nearestStation,undefined);
});
test('reviewed facts cannot leak across occurrences or apply without evidence',()=>{
 const facts=[{sourceId:e.sourceId,eventName:e.eventName,startDate:e.startDate,fields:{price:0,endTime:'17:00'},fieldEvidence:{price:{text:'無料',sourceUrl:e.officialUrl,checkedAt}}}];
 const rows=enrichVerifiedFacts([e,{...e,startDate:'2026-10-04'},{...e,eventName:'別の実験'}],facts);
 assert.equal(rows[0].price,0);assert.equal(rows[0].endTime,undefined);assert.equal(rows[1].price,undefined);assert.equal(rows[2].price,undefined);
});
test('exhibition facts exclude reservation requirements of a related talk',()=>{
 const event={...e,eventName:'美術展',sourceId:'nakka-art-museum',officialUrl:'https://nakka-art.jp/exhibition-post/test/'};
 const r=parseEventDetails('<h2>美術展</h2><h2>概要</h2><div><p>番組の世界と美術作品を楽しむ展覧会。時代の異なる作品が会場に集まります。</p></div><div><table><tr><th>会期</th><td>2026年10月10日から12月20日</td></tr><tr><th>観覧料</th><td>2,000円</td></tr></table><table><tr><th>申込方法</th><td>関連講演への事前申込必須</td></tr></table></div>',event,checkedAt);
 assert.equal(r.fields.price,'2,000円');assert.equal(r.fields.reservationRequired,undefined);assert.equal(r.fields.reservationInfo,undefined);
});
test('an exhibition closure calendar honors published exceptional opening days',()=>{
 const event={...e,eventName:'美術展',sourceId:'nakka-art-museum',startDate:'2026-10-01',endDate:'2026-10-31'};
 const r=parseEventDetails('<h2>美術展</h2><table><tr><th>会期</th><td>休館日：月曜日、10月13日(火) *10月12日(月・祝)は開館</td></tr></table>',event,checkedAt);
 assert.equal(r.fields.schedule.closedDates.includes('2026-10-05'),true);assert.equal(r.fields.schedule.closedDates.includes('2026-10-12'),false);assert.equal(r.fields.schedule.closedDates.includes('2026-10-13'),true);
});
test('reservation closure cannot be displayed as an available booking',()=>{
 const r=parseEventDetails('<div id="pl123"><h2>実験体験</h2></div><table><tr><th>申込方法</th><td>Web申込。受付を終了しました。</td></tr></table>',e,checkedAt);
 assert.equal(r.fields.officialStatus,'registration_closed');assert.match(r.fields.statusEvidence,/受付を終了/);
});
test('Osaka escape-game facts separate the day course, night course, and merchandise',()=>{
 const html='<title>大阪 夜の魔法学校からの脱出</title><div id="access">ひらかたパーク 京阪電車「枚方公園駅」徒歩3分</div><div id="price01"><table><tr><th>昼コースチケット</th><td>¥3,000</td></tr><tr><th>夜公演チケット</th><td>¥4,200</td></tr><tr><th>グッズ</th><td>¥500</td></tr></table></div><div id="timetable">■夜公演 開演18:30 終演予定20:45 ■昼コース 開園〜閉園、最終受付15:00</div>';
 const url='https://realdgame.jp/s/wizardpark/osaka/';
 const day=parseWizardOsakaDetails(html,{...e,officialUrl:'https://realdgame.jp/s/wizardpark/day/'},url,checkedAt);
 const night=parseWizardOsakaDetails(html,{...e,officialUrl:'https://realdgame.jp/s/wizardpark/'},url,checkedAt);
 assert.match(day.price,/3,000/);assert.doesNotMatch(day.price,/4,200/);assert.equal(day.startTime,undefined);assert.equal(night.startTime,'18:30');assert.equal(night.endTime,'20:45');assert.equal(night.fieldEvidence.startTime.sourceUrl,url);
});

test('Billboard facts match event id, date and venue while excluding dishes and internal notes',()=>{
 const event={...e,eventName:'演奏会',sourceId:'billboard-osaka',venueName:'ビルボードライブ大阪',officialUrl:'https://www.billboard-live.com/osaka/show?event_id=ev-1&date=2026-10-03'};
 const base={event_id:'ev-1',play_date:'2026-10-03',facilityname:'ビルボードライブ大阪',title_name:'演奏会',notice:'STAFF ONLY',recommended_dishes:[{base_price:500}],vacancy:[{pricelist:[{price_name:'S指定席',price:10000}]}]};
 const values=[{...base,schedule_id:'a',play_open:'16:00',play_start:'17:00'},{...base,schedule_id:'b',play_open:'19:00',play_start:'20:00'},{...base,event_id:'ev-2',vacancy:[{pricelist:[{price_name:'他公演',price:100}]}]}];
 const html='<h2>演奏会</h2><script>self.__next_f.push('+JSON.stringify([1,'a:'+JSON.stringify({data:values})+'\n'])+')</script>';
 const result=parseBillboardPerformanceDetails(html,event,checkedAt);
 assert.match(result.fields.timeInfo,/開演 17:00.*開演 20:00/u);
 assert.match(result.fields.price,/S指定席 10,000円/u);
 assert.doesNotMatch(JSON.stringify(result.fields),/STAFF|他公演|500/u);
 assert.equal(result.fields.startTime,undefined);assert.equal(result.fields.endTime,undefined);
 assert.equal(parseBillboardPerformanceDetails(html,{...event,startDate:'2026-10-04'},checkedAt).recognized,false);
});

test('cloud show keeps intermittent sessions and rental booking separate from free admission',()=>{
 const event={...e,eventName:'なんば雲海',sourceId:'namba-parks',startDate:'2026-08-28',endDate:'2026-11-01'};
 const html='<h1>なんば雲海</h1><p>パークスガーデンの各フロアで雲海が広がります。</p><p>雲海発生時間17:30～22:00 の内、約30分に1回3分</p><p>事前申込は必要ですか？必要ございません。期間中であれば無料でご参加いただけます。レンタル品については数に限りがあり、事前予約制とさせていただいております。</p><p>雨天・荒天時は、予告なく雲海イベントおよび提灯のお貸出しを中止させていただく可能性がございます。</p><p>提灯 貸出料金500円/台（税込） 事前予約はこちら</p>';
 const facts=parseNambaUnkaiDetails(html,event,'https://nambaparks.com/nambaunkai/',checkedAt);
 assert.equal(facts.price,0);assert.equal(facts.reservationRequired,false);assert.match(facts.timeInfo,/約30分に1回/u);assert.equal(facts.startTime,undefined);assert.equal(facts.endTime,undefined);assert.equal(facts.reservationUrl,undefined);
 assert.match(facts.description,/屋上庭園/u);assert.match(facts.rainPolicy,/雨天・荒天/u);
 assert.deepEqual(parseNambaUnkaiDetails(html,{...event,startDate:'2027-08-28'},'https://nambaparks.com/nambaunkai/',checkedAt),{});
});
