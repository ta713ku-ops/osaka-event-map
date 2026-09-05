import { build } from 'esbuild';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const now = new Date(process.argv[2] ?? Date.now());
if (!Number.isFinite(now.getTime())) throw new Error('Pass an ISO timestamp with timezone');
const temporary = await mkdtemp(join(tmpdir(), 'osaka-recommendations-'));
try {
  const outfile = join(temporary, 'ranking.mjs');
  await build({ entryPoints: ['src/domain/homeRecommendations.ts'], outfile, bundle: true, platform: 'node', format: 'esm' });
  const { recommendHomeEvents } = await import(pathToFileURL(outfile).href);
  const data = JSON.parse(await readFile('public/data/events.json', 'utf8'));
  const result = recommendHomeEvents(data.events, now);
  const summary = c => ({ id: c.event.id, name: c.event.eventName, venue: c.event.venueName, dates: [c.event.startDate, c.event.endDate], category: c.event.category, score: c.score, tier: c.tier, reasons: c.reasons, components: c.components, bonuses: c.bonuses, penalties: c.penalties, exclusions: c.exclusions });
  const report = { evaluatedAt: now.toISOString(), dataGeneratedAt: data.generatedAt, eventCount: data.events.length, large: result.large.map(summary), today: result.today.map(summary), diagnostics: { large: result.diagnostics.large.map(summary), today: result.diagnostics.today.map(summary) } };
  if (process.argv[3]) await writeFile(process.argv[3], JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, diagnostics: undefined }, null, 2));
} finally { await rm(temporary, { recursive: true, force: true }); }
