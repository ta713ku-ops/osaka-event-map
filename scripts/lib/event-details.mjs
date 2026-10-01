import { JSDOM } from 'jsdom';
import { normalize, textValue } from './events.mjs';

const AEON_SOURCES = new Set(['aeon-osaka-dome-city', 'aeon-dainichi', 'aeon-hineno', 'aeon-ibaraki']);
const SUPPORTED = new Set(['expo-park', 'science-museum', 'fenice-sakai', 'festival-hall', 'nakka-art-museum', 'atc-events', 'grand-front', 'lucua', 'billboard-osaka', 'hirakata-park', 'namba-parks', ...AEON_SOURCES]);
const plain = node => textValue(node?.textContent ?? '').replace(/\s+/gu, ' ').trim();
const absolute = (href, base) => { try { const u = new URL(href, base); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password ? u.href : undefined; } catch { return undefined; } };
const clock = value => value?.replace(/\s+/gu, '').replace('：', ':');
const headingTags = 'h1,h2,h3,h4,h5,h6';

function textWithBreaks(node) {
  if (!node) return '';
  const copy = node.cloneNode(true);
  copy.querySelectorAll('br').forEach(item => item.replaceWith('\n'));
  return String(copy.textContent ?? '').replace(/\u00a0/gu, ' ').replace(/[\t ]+/gu, ' ').replace(/ *\n */gu, '\n').trim();
}

function pageNotFound(doc) {
  const text = normalize(doc.body?.textContent ?? '');
  return /404notfound|お探しのページが見つかりません|ページが見つかりません/u.test(text);
}

function hasExactHeading(root, eventName) {
  const title = normalize(eventName);
  return Boolean(title && [...(root?.querySelectorAll(headingTags) ?? [])].some(item => normalize(plain(item)) === title));
}

function detailImageUrl(doc, scope, baseUrl) {
  let origin;
  try { origin = new URL(baseUrl).origin; } catch { return undefined; }
  const candidates = [];
  const add = (href, width = 0, priority = 0) => {
    const url = absolute(href, baseUrl);
    if (!url || /logo|icon|favicon|og[-_]?image|badge|banner|cloud_|deco\//iu.test(new URL(url).pathname) || /(?:^|[-_/])\d{2,4}x\d{2,4}(?=\.|[-_/]|$)/iu.test(new URL(url).pathname) || /(?:[?&](?:w|width)=)(?:1[0-9]{2}|200)(?:&|$)/iu.test(url)) return;
    candidates.push({ url, width, priority });
  };
  for (const meta of doc.querySelectorAll('meta[property="og:image"],meta[name="twitter:image"]')) add(meta.getAttribute('content'), 0, 2);
  for (const source of scope.querySelectorAll('picture source[srcset],img[srcset]')) {
    for (const entry of (source.getAttribute('srcset') ?? '').split(',')) {
      const [href, descriptor = ''] = entry.trim().split(/\s+/u);
      const width = descriptor.endsWith('w') ? Number.parseInt(descriptor, 10) : descriptor.endsWith('x') ? Number.parseFloat(descriptor) * 1000 : 0;
      add(href, Number.isFinite(width) ? width : 0, 4);
    }
  }
  for (const image of scope.querySelectorAll('img')) {
    add(image.getAttribute('data-src'), 0, 3);
    add(image.getAttribute('data-original'), 0, 3);
    add(image.getAttribute('src'), 0, 1);
  }
  candidates.sort((a, b) => b.width - a.width || b.priority - a.priority);
  return candidates[0]?.url;
}

function dateOccurrences(text) {
  return [...String(text).matchAll(/(?<!\d)(\d{1,2})[./](\d{1,2})(?:\s*(?:\([^)]*\)|（[^）]*）))?/gu)]
    .map(match => ({ month: Number(match[1]), day: Number(match[2]), index: match.index, length: match[0].length }));
}

function dateSlice(text, date) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(date ?? '')) return undefined;
  const [, year, month, day] = date.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  const found = dateOccurrences(text);
  const at = found.findIndex(item => item.month === Number(month) && item.day === Number(day));
  if (at < 0) return undefined;
  const start = found[at].index;
  const end = found[at + 1]?.index ?? String(text).length;
  // If a year is printed immediately before this date, it must also match.
  const prefix = String(text).slice(Math.max(0, start - 6), start);
  const printedYear = prefix.match(/(20\d{2})[./年]?\s*$/u)?.[1];
  if (printedYear && printedYear !== year) return undefined;
  return String(text).slice(start, end).trim();
}

function occurrenceInJapaneseDateText(text, date) {
  const match = String(date ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (!match) return false;
  const [, year, month, day] = match;
  const md = new RegExp(`(?:${Number(month)}\\s*月\\s*${Number(day)}\\s*日|${Number(month)}\\s*[/・.]\\s*${Number(day)}(?:日)?)(?!\\d)`, 'u');
  if (!md.test(text)) return false;
  const explicitYears = [...String(text).matchAll(/(20\d{2})年/gu)].map(item => item[1]);
  return !explicitYears.length || explicitYears.includes(year);
}

function scopeFor(doc, html, event) {
  if (event.sourceId === 'hirakata-park' && new URL(event.officialUrl).hostname === 'realdgame.jp') return doc.body;
  if (event.sourceId === 'science-museum') {
    const id = new URL(event.officialUrl).hash.slice(1);
    if (!/^pl\d+$/u.test(id)) return;
    const start = String(html).search(new RegExp(`<div\\b[^>]*id=["']${id}["']`, 'iu'));
    if (start < 0) return;
    const tail = String(html).slice(start);
    const end = tail.slice(1).search(/<div\b[^>]*id=["']pl\d+["']/iu);
    return new JSDOM((end < 0 ? tail : tail.slice(0, end + 1)).replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/giu, '')).window.document.body;
  }
  if (event.sourceId === 'namba-parks') return doc.querySelector('main') ?? doc.querySelector('[class*=event-detail]') ?? doc.body;
  if (AEON_SOURCES.has(event.sourceId)) return doc.querySelector('.event') ?? doc.querySelector('main') ?? doc.body;
  if (event.sourceId === 'fenice-sakai') return doc.querySelector('.p-event_single__body');
  if (event.sourceId === 'expo-park') return doc.querySelector('article.main');
  if (event.sourceId === 'atc-events') return doc.querySelector('.p-event-detail__article');
  if (event.sourceId === 'grand-front') return doc.querySelector('.article-event') ?? doc.querySelector('main');
  if (event.sourceId === 'hirakata-park') return doc.querySelector('.topics-dtl') ?? doc.querySelector('main');
  if (event.sourceId === 'festival-hall') return doc.querySelector('main');
  if (event.sourceId === 'nakka-art-museum') return [...doc.querySelectorAll('table')].find(x => plain(x).includes('会期'));
  if (event.sourceId === 'lucua') return doc.querySelector('article');
  if (event.sourceId === 'billboard-osaka') return doc.querySelector('main') ?? doc.querySelector('[class*=LiveDetailOverview_root]')?.parentElement?.parentElement ?? doc.body;
}

/** Event-specific facts only. A provider's navigation, other events, booking
 * deadlines, and general venue opening hours never become event clock fields. */
export function parseEventDetails(html, event, checkedAt) {
  const doc = new JSDOM(String(html).replace(/<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/giu, '')).window.document;
  doc.querySelectorAll('script,style,nav,footer').forEach(x => x.remove());
  const titleKey = normalize(event.eventName);
  const bodyKey = normalize(doc.body.textContent);
  const wizardPage = event.sourceId === 'hirakata-park' && /^https:\/\/realdgame\.jp\/s\/wizardpark\/(?:day\/)?$/u.test(event.officialUrl) && doc.title.includes('夜の魔法学校からの脱出');
  if (!titleKey || (!bodyKey.includes(titleKey) && !wizardPage)) return { recognized: false, fields: {}, reason: 'イベント名を本文で照合できない' };
  const scope = scopeFor(doc, html, event);
  if (!scope) return { recognized: false, fields: {}, reason: 'イベント本文の構造に未対応' };
  scope.querySelectorAll('script,style,nav,footer').forEach(x => x.remove());
  const fields = {}, evidence = {};
  const put = (key, value, text = value) => {
    if (value === undefined || value === null || value === '') return;
    fields[key] = value;
    evidence[key] = { text: String(text).slice(0, 1000), sourceUrl: event.officialUrl, checkedAt };
  };
  const facts = new Map();
  for (const row of scope.querySelectorAll('tr')) {
    const cells = [...row.children].filter(x => ['TH','TD'].includes(x.tagName));
    const label = plain(cells[0]);
    const cell = cells[1];
    if (label && cell && !facts.has(label)) facts.set(label, { text: plain(cell), node: cell });
  }
  for (const dt of scope.querySelectorAll('dt')) {
    const dd = dt.nextElementSibling;
    if (dd?.tagName === 'DD' && !facts.has(plain(dt))) facts.set(plain(dt), { text: plain(dd), node: dd });
  }
  const fact = re => [...facts].find(([key]) => re.test(key))?.[1];
  const cost = fact(/^(料金|参加費|観覧料|入場料)$/u);
  if (cost) put('price', cost.text);
  const time = fact(/^(時間|開催時間|開場時間)$/u) ?? fact(/^日時$/u);
  if (time) {
    if (/\d{1,2}[:：]\d{2}|\d{1,2}時|開場|開演/u.test(time.text)) put('timeInfo', time.text);
    const pairs = [...time.text.matchAll(/([0-2]?\d[:：][0-5]\d)\s*[~〜～–−-]\s*([0-2]?\d[:：][0-5]\d)/gu)];
    // Multiple sessions remain in timeInfo; do not turn their span into an
    // uninterrupted opening period.
    if (pairs.length === 1) {
      put('startTime', clock(pairs[0][1]), time.text);
      put('endTime', clock(pairs[0][2]), time.text);
    } else if (!pairs.length) {
      const startAfter = time.text.match(/開演\s*([0-2]?\d[:：][0-5]\d)/u);
      const start = startAfter ?? time.text.match(/([0-2]?\d[:：][0-5]\d)\s*開演/u);
      if (start) put('startTime', clock(start[1]), time.text);
    }
  }
  const booking = fact(/^(申込方法|申し込み|予約|予約方法|チケット発売日)$/u);
  if (booking) {
    put('reservationInfo', booking.text);
    if (/申し込み不要|申込不要|直接会場/u.test(booking.text)) put('reservationRequired', false, booking.text);
    else if (/申し込|申込み|申込|予約/u.test(booking.text)) put('reservationRequired', true, booking.text);
    const a = booking.node.querySelector('a[href]');
    if (a) put('reservationUrl', absolute(a.getAttribute('href'), event.officialUrl), booking.text);
    if (/受付(?:を)?終了|申込(?:受付)?終了|募集(?:を)?終了/u.test(booking.text)) {
      put('officialStatus', 'registration_closed', booking.text);
      put('statusEvidence', booking.text);
    }
  }
  const audience = fact(/^(対象|対象年齢)$/u);
  if (audience) put('audienceInfo', audience.text);
  const date = fact(/^(日程|会期)$/u);
  if (date && /休園日|休館日|休催/u.test(date.text)) put('closureInfo', date.text.slice(date.text.search(/休園日|休館日|休催/u)));
  if (event.sourceId === 'nakka-art-museum' && fields.closureInfo) {
    const closure = fields.closureInfo;
    const closedPart = closure.split('*')[0];
    const weekdays = '日月火水木金土';
    const weekly = [...closedPart.matchAll(/([日月火水木金土])曜日/gu)].map(x => weekdays.indexOf(x[1]));
    const extractDates = text => [...text.matchAll(/(\d{1,2})月(\d{1,2})日/gu)].map(x => `${event.startDate.slice(0,4)}-${x[1].padStart(2,'0')}-${x[2].padStart(2,'0')}`);
    const closedDates = new Set(extractDates(closedPart));
    const openDates = new Set(closure.includes('は開館') ? extractDates(closure.slice(closure.indexOf('*') + 1).split('は開館')[0]) : []);
    const end = event.endDate ?? event.startDate;
    // This provider states closures plus explicit exceptional opening days.
    // Only same-year finite exhibitions are expanded; no holiday inference.
    if (event.startDate.slice(0,4) === end.slice(0,4) && Date.parse(end) - Date.parse(event.startDate) < 370 * 86400000) {
      for (let day = new Date(event.startDate); day.toISOString().slice(0,10) <= end; day.setUTCDate(day.getUTCDate()+1)) {
        const value = day.toISOString().slice(0,10);
        if (weekly.includes(day.getUTCDay()) && !openDates.has(value)) closedDates.add(value);
      }
      put('schedule', {...event.schedule, closedDates: [...closedDates].sort(), evidence: closure}, closure);
    }
  }
  if (event.sourceId === 'fenice-sakai') {
    const head = doc.querySelector('.p-event_single__head');
    const text = plain(head?.querySelector('time'));
    if (text) put('timeInfo', text);
    const starts = [...text.matchAll(/([0-2]?\d[:：][0-5]\d)\s*開演/gu)];
    if (starts.length === 1) put('startTime', clock(starts[0][1]), text);
    const costSection = [...scope.querySelectorAll('.p-event_single__body__item')].find(x => plain(x.querySelector('.aco_head')) === '料金');
    if (costSection) put('price', plain(costSection.querySelector('.aco_body')));
    const bookingLink = [...(head?.querySelectorAll('a[href]') ?? [])].find(x=>/Webでチケット購入/u.test(plain(x)));
    if (bookingLink) { put('reservationUrl', absolute(bookingLink.getAttribute('href'), event.officialUrl), plain(bookingLink)); put('reservationInfo', '公式のチケット購入ページで販売状況・購入条件を確認してください。', plain(bookingLink)); }
  }
  if (event.sourceId === 'grand-front') {
    const body = plain(scope);
    const cost = body.match(/価格[:：]\s*(.+?)(?=予約方法[:：]|※|$)/u)?.[1]?.trim();
    if (cost) put('price', cost);
    const booking = body.match(/予約方法[:：]\s*(.+?)(?=※写真|開催期間|$)/u)?.[1]?.trim();
    if (booking) { put('reservationInfo', booking); if (/事前予約のみ/u.test(booking)) put('reservationRequired', true, booking); }
    const hours = body.match(/時間[:：]\s*(.+?)(?=価格[:：]|$)/u)?.[1]?.trim();
    if (hours) put('timeInfo', hours);
  }
  let paragraphs = [...scope.querySelectorAll('p')].map(plain).filter(x=>x.length>=35 && !/Cookie|クッキー|情報は|お問い合わせ|転載|コピーライト|イベントはこちら.*キャンペーンはこちら/u.test(x));
  if (event.sourceId === 'nakka-art-museum') {
    const heading = [...doc.querySelectorAll('h2,h3')].find(x=>plain(x)==='概要');
    if (heading?.nextElementSibling) paragraphs = [plain(heading.nextElementSibling)];
  }
  if (event.sourceId === 'fenice-sakai') paragraphs = [...scope.querySelectorAll('.p-event_single__body__item')].filter(x=>plain(x.querySelector('.aco_head'))==='概要').flatMap(x=>[...x.querySelectorAll('.aco_body > p')].map(plain));
  const contact = fact(/^(お問い合わせ|問い合わせ)$/u);
  if (contact) { const phone = contact.text.match(/0[0-9-]{8,16}/u)?.[0]; if (phone) put('contact', {name: contact.text.replace(phone, '').trim(), phone}, contact.text); }
  const description = paragraphs.find(x=>x.length>=35 && !/^(日時|料金|先行発売|一般発売|チケット)/u.test(x));
  if (wizardPage) {
    const intro = plain(scope.querySelector('.mtxt.prx'));
    if (intro) put('description', intro);
  } else if (event.sourceId === 'billboard-osaka') {
    const intro = plain(scope.querySelector('[class*=LiveDetailOverview_description]'));
    if (intro.length >= 35) put('description', intro.slice(0, 600));
    const supplemental = parseBillboardPerformanceDetails(html,event,checkedAt);
    for(const [key,value] of Object.entries(supplemental.fields??{})) if(key!=='fieldEvidence') put(key,value,supplemental.fields.fieldEvidence?.[key]?.text??value);
  } else if (description) put('description', description.slice(0,600));
  if (['expo-park','namba-parks',...AEON_SOURCES].includes(event.sourceId)) {
    const image=detailImageUrl(doc,scope,event.officialUrl);
    if(image){put('imageUrl',image);put('imageSourceUrl',event.officialUrl);}
  }
  return { recognized: true, fields: { ...fields, ...(Object.keys(evidence).length ? { fieldEvidence: evidence } : {}) }, reason: Object.keys(fields).length ? undefined : '本文取得済み・抽出可能な項目なし' };
}

/** Decode only JSON values from the official page's React payload, never run
 * its scripts. Only the requested event, Osaka venue and exact date qualify.
 * Public seat pricing is kept separate from dishes and staff-only notes. */
export function parseBillboardPerformanceDetails(html,event,checkedAt){
  const url=new URL(event.officialUrl);const id=url.searchParams.get('event_id');
  const doc=new JSDOM(html).window.document;const parts=[];
  for(const script of doc.querySelectorAll('script')){
    const m=script.textContent.match(/^self\.__next_f\.push\((\[.*\])\);?$/su);
    if(!m)continue;
    try{const part=JSON.parse(m[1]);if(typeof part[1]==='string')parts.push(part[1]);}catch{}
  }
  const records=[];
  const walk=value=>{if(!value||typeof value!=='object')return;if(value.event_id===id&&value.play_date===event.startDate&&value.facilityname==='ビルボードライブ大阪'&&normalize(value.title_name)===normalize(event.eventName))records.push(value);for(const child of Object.values(value))walk(child);};
  for(const line of parts.join('').split('\n'))try{walk(JSON.parse(line.slice(line.indexOf(':')+1)));}catch{}
  const fields={},fieldEvidence={};const put=(key,value)=>{if(!value)return;fields[key]=value;fieldEvidence[key]={text:String(value),sourceUrl:event.officialUrl,checkedAt};};
  const stages=[...new Map(records.filter(r=>/^\d{1,2}:\d{2}$/u.test(r.play_start??'')).map(r=>[r.schedule_id??r.play_start,r])).values()].sort((a,b)=>a.play_start.localeCompare(b.play_start));
  if(stages.length)put('timeInfo',stages.map((r,i)=>`${i+1}ステージ：${r.play_open?'開場 '+r.play_open+'／':''}開演 ${r.play_start}`).join('、'));
  const prices=[...new Set(records.flatMap(r=>(r.vacancy??[]).flatMap(v=>(v.pricelist??[]).filter(p=>p.price_name&&Number.isFinite(p.price)&&p.price>=0).map(p=>`${p.price_name} ${p.price.toLocaleString('ja-JP')}円`))))];
  if(prices.length)put('price',prices.join('／')+'。席種ごとの人数・購入条件は公式購入画面で確認してください。');
  if(records.length){put('reservationUrl',event.officialUrl);put('reservationInfo','公演・ステージ・席種を選択し、公式購入画面でチケットの販売状況を確認してください。');}
  return {recognized:records.length>0,fields:{...fields,...(Object.keys(fieldEvidence).length?{fieldEvidence}:{})}};
}

export function parseNambaUnkaiDetails(html,event,url,checkedAt){
  if(event.sourceId!=='namba-parks'||event.eventName!=='なんば雲海'||event.startDate!=='2026-08-28'||event.endDate!=='2026-11-01')return {};
  const doc=new JSDOM(html).window.document;doc.querySelectorAll('script,style,nav,footer').forEach(x=>x.remove());
  const text=plain(doc.body);if(!text.includes('なんば雲海'))return {};
  const fields={},fieldEvidence={};const put=(key,value,quote=value)=>{if(value===undefined)return;fields[key]=value;fieldEvidence[key]={text:String(quote),sourceUrl:url,checkedAt};};
  const hours=text.match(/雲海発生時間\s*(17:30[～〜~]22:00)\s*の内、約30分に1回3分/u);
  if(hours&&text.includes('パークスガーデン'))put('description','なんばパークスの屋上庭園で、雲海と光の演出を楽しめます。雲海は夜間に約30分ごとに現れ、庭園内のスポットによって見え方が異なります。','パークスガーデンの各フロアで雲海が広がります。');
  if(hours)put('timeInfo','17:30～22:00の内、約30分に1回・3分間。スポットごとに発生タイミング・長さは変動。'+(/9月22日.*9月23日.*11:00\s*[~～〜]\s*22:00/u.test(text)?'9月22日・23日のファミリーDAYは11:00～22:00。':''),hours[0]);
  if(text.includes('必要ございません。期間中であれば無料でご参加いただけます。')){
    put('price',0,'期間中であれば無料でご参加いただけます。');
    put('reservationRequired',false,'事前申込は必要ですか？必要ございません。');
    put('reservationInfo','雲海イベントは事前申込不要。提灯レンタルは別料金・事前予約制（当日空きがあれば利用可能）。','必要ございません。期間中であれば無料でご参加いただけます。レンタル品については数に限りがあり、事前予約制とさせていただいております。');
  }
  if(text.includes('雨天・荒天時は、予告なく雲海イベントおよび提灯のお貸出しを中止させていただく可能性がございます。'))put('rainPolicy','雨天・荒天時は予告なく雲海イベントと提灯レンタルが中止される場合があります。','雨天・荒天時は、予告なく雲海イベントおよび提灯のお貸出しを中止させていただく可能性がございます。');
  if(text.includes('南海電鉄 「なんば駅」直結')){put('nearestStation','南海電鉄 なんば駅');put('accessByTransit','南海電鉄「なんば駅」直結。Osaka Metro御堂筋線「なんば駅」より徒歩約7分。','南海電鉄 「なんば駅」直結地下鉄御堂筋線「なんば駅」より徒歩約7分');}
  const image=absolute(doc.querySelector('.hero__bg img')?.getAttribute('src'),url);if(image){put('imageUrl',image);put('imageSourceUrl',url);}
  return {...fields,fieldEvidence};
}

/** The series site separates Osaka facts from other cities and merchandise. */
export function parseWizardOsakaDetails(html, event, url, checkedAt) {
  const doc = new JSDOM(html).window.document;
  if (!doc.title.includes('大阪') || !plain(doc.querySelector('#access')).includes('ひらかたパーク')) return {};
  const day = event.officialUrl.endsWith('/day/');
  const fields = {}, fieldEvidence = {};
  const put = (key, value) => { if (!value) return; fields[key] = value; fieldEvidence[key] = {text: String(value), sourceUrl: url, checkedAt}; };
  const rowText = id => [...(doc.querySelector(id)?.querySelectorAll('tr') ?? [])].filter(row => /チケット/u.test(plain(row.querySelector('th'))) && (day ? /昼コース/u : /^夜公演/u).test(plain(row.querySelector('th')))).map(plain).join(' / ');
  const advance = rowText('#price01'), sameDay = rowText('#price02');
  if (advance || sameDay) put('price', `前売（一般）：${advance} / 当日（一般${day ? '' : '／U22団員'}）：${sameDay}${day ? ' ※遊園地入園券は別途購入が必要。' : ' ※入園券の有無・割引条件は公式確認。'}`);
  const timetable = plain(doc.querySelector('#timetable'));
  const time = day ? timetable.split('■昼コース')[1] : timetable.split('■夜公演')[1]?.split('■昼コース')[0];
  put('timeInfo', time?.trim());
  if (!day && time) { put('startTime', time.match(/開演\s*(\d{2}:\d{2})/u)?.[1]); put('endTime', time.match(/終演予定\s*(\d{2}:\d{2})/u)?.[1]); }
  put('reservationInfo', '公式のチケット購入ページで対象日時・当日券の販売状況を確認してください。');
  const link = day ? [...doc.querySelectorAll('a[href]')].find(x => plain(x).includes('昼コースのみのチケットはこちら')) : doc.querySelector('#scrapticket a[href]');
  put('reservationUrl', absolute(link?.getAttribute('href'), url));
  const transit = plain(doc.querySelector('#access')).match(/京阪電車.+?(?=※|$)/u)?.[0];
  put('accessByTransit', transit);
  return {...fields, fieldEvidence};
}

export function mergeEventDetails(event, detail) {
  // Identity and published date/venue stay owned by the source adapter.
  return { ...event, ...detail.fields, fieldEvidence: { ...event.fieldEvidence, ...detail.fields?.fieldEvidence } };
}

export async function enrichEventDetails(events, {fetchText, checkedAt, focusUrls = []}) {
  const focused = new Set(focusUrls);
  const pages = new Map(), reports = [];
  const enriched = [];
  const urls = [...new Set(events.filter(event => event.officialUrl && (SUPPORTED.has(event.sourceId) || focused.has(event.officialUrl))).map(event => event.officialUrl.split('#')[0]))];
  let cursor = 0;
  await Promise.all(Array.from({length: 2}, async () => {
    while (cursor < urls.length) { const url = urls[cursor++];
      try { pages.set(url, {html: await fetchText(url)}); } catch(error) { pages.set(url, {error: error.message}); }
    }
  }));
  for (const event of events) {
    if (!event.officialUrl || (!SUPPORTED.has(event.sourceId) && !focused.has(event.officialUrl))) { enriched.push(event); continue; }
    const url = event.officialUrl.split('#')[0];
    let page = pages.get(url);
    if (!page) {
      try { page = { html: await fetchText(url) }; } catch(error) { page = { error: error.message }; }
      pages.set(url, page);
    }
    if (page.error) { reports.push({routeId:event.routeId ?? event.id, url:event.officialUrl, status:'error', error:page.error}); enriched.push(event); continue; }
    const detail = parseEventDetails(page.html, event, checkedAt);
    if(detail.recognized&&event.sourceId==='namba-parks'&&event.eventName==='なんば雲海'){
      const doc=new JSDOM(page.html).window.document;
      const link=[...doc.querySelectorAll('a[href]')].map(a=>absolute(a.getAttribute('href'),event.officialUrl)).find(href=>href==='https://nambaparks.com/nambaunkai/');
      if(link)try{
        if(!pages.has(link))pages.set(link,{html:await fetchText(link)});
        const supplemental=parseNambaUnkaiDetails(pages.get(link).html,event,link,checkedAt);
        detail.fields={...detail.fields,...supplemental,fieldEvidence:{...detail.fields.fieldEvidence,...supplemental.fieldEvidence}};
      }catch(error){detail.reason=`公式特設ページの補足取得失敗: ${error.message}`;}
    }
    if (detail.recognized && event.sourceId === 'hirakata-park' && new URL(event.officialUrl).hostname === 'realdgame.jp') {
      const doc = new JSDOM(page.html).window.document;
      const link = [...doc.querySelectorAll('a[href]')].find(x => plain(x).includes('会場の詳細') && absolute(x.getAttribute('href'),event.officialUrl)?.endsWith('/wizardpark/osaka/'));
      const cityUrl = link && absolute(link.getAttribute('href'),event.officialUrl);
      if (cityUrl) {
        try {
          if (!pages.has(cityUrl)) pages.set(cityUrl,{html: await fetchText(cityUrl)});
          const fields = parseWizardOsakaDetails(pages.get(cityUrl).html,event,cityUrl,checkedAt);
          detail.fields = {...detail.fields,...fields,fieldEvidence:{...detail.fields.fieldEvidence,...fields.fieldEvidence}};
        } catch(error) { detail.reason = `大阪会場の補足取得失敗: ${error.message}`; }
      }
    }
    reports.push({routeId:event.routeId ?? event.id,url:event.officialUrl,status:detail.recognized?'success':'unrecognized',fields:Object.keys(detail.fields).filter(x=>x!=='fieldEvidence'),reason:detail.reason,checkedAt});
    enriched.push(mergeEventDetails(event,detail));
  }
  return {events:enriched,reports};
}
