import {readFile,writeFile} from 'node:fs/promises';
import {enrichEventDetails} from './lib/event-details.mjs';
import {enrichVenues,enrichVerifiedFacts} from './lib/venues.mjs';
import {qualitySummary} from './lib/quality.mjs';
import {assignStableRouteIds} from './collect-events.mjs';
// Re-run a provider's detail parser after a parser repair without fetching
// every official listing. The listing timestamp and source status stay intact.
const source=process.argv[2];
if(!source) throw new Error('Specify a source id');
const data=JSON.parse(await readFile('public/data/events.json','utf8'));
const targets=data.events.filter(event=>event.sourceId===source);
if(!targets.length)throw new Error('Unknown source or no published records');
const fetchText=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.text();};
const checkedAt=new Date().toISOString();
const result=await enrichEventDetails(targets,{fetchText,checkedAt});
const updates=new Map(result.events.map(event=>[event.id,event]));
const venues=JSON.parse(await readFile('data/venue-registry.json','utf8'));
const reviewedFacts=JSON.parse(await readFile('data/website-focus-facts.json','utf8'));
const gauntletFacts=await readFile('data/gauntlet-reviewed-facts.json','utf8').then(JSON.parse).catch(error=>{if(error.code==='ENOENT')return [];throw error;});
data.events=assignStableRouteIds(enrichVerifiedFacts(enrichVenues(data.events.map(event=>updates.get(event.id)??event),venues),[...reviewedFacts,...gauntletFacts]),data.events);
const ids=new Set(targets.map(event=>event.routeId??event.id));
data.detailReports=[...(data.detailReports??[]).filter(item=>!ids.has(item.routeId)),...result.reports];
const old=data.quality;data.quality=qualitySummary(data.events);data.quality.rejected=old?.rejected??0;data.quality.rejectionReasons=old?.rejectionReasons??{};
for(const path of ['public/data/events.json','data/sources/collection-report.json'])await writeFile(path,JSON.stringify(data,null,2)+'\n');
const {events,...report}=data;await writeFile('public/data/collection-report.json',JSON.stringify({...report,eventCount:events.length},null,2)+'\n');
console.log(`${source}: ${result.reports.filter(x=>x.status==='success').length}/${targets.length} detail pages recognized`);
