import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_SITE_URL = 'https://ta713ku-ops.github.io/osaka-event-map/';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/gu, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

function normalizeSiteUrl(value) {
  const url = new URL(value || DEFAULT_SITE_URL);
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url;
}

export function eventPageHtml(template, event, siteUrl = DEFAULT_SITE_URL) {
  const root = normalizeSiteUrl(siteUrl);
  const routeId = event.routeId || event.id;
  const canonical = new URL(`events/${encodeURIComponent(routeId)}/`, root).href;
  const title = `${event.eventName}｜どこいこ大阪`;
  const description = String(event.description || `${event.eventName}の開催日時・会場・アクセス・公式情報を確認できます。`).replace(/\s+/gu, ' ').slice(0, 150);
  const eventStatus = {
    cancelled: 'https://schema.org/EventCancelled',
    postponed: 'https://schema.org/EventPostponed',
    scheduled: 'https://schema.org/EventScheduled',
  }[event.officialStatus] || 'https://schema.org/EventScheduled';
  const structuredData = {
    '@context': 'https://schema.org', '@type': 'Event', name: event.eventName,
    startDate: event.startAt || event.startDate,
    ...(event.endAt || event.endDate ? { endDate: event.endAt || event.endDate } : {}),
    eventStatus,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    ...(event.description ? { description: event.description } : {}),
    ...(event.imageUrl ? { image: [event.imageUrl] } : {}),
    ...(event.officialUrl ? { url: event.officialUrl } : { url: canonical }),
    ...(event.venueName || event.address ? { location: { '@type': 'Place', ...(event.venueName ? { name: event.venueName } : {}), ...(event.address ? { address: event.address } : {}) } } : {}),
  };
  const metadata = [
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    ...(event.imageUrl ? [`<meta property="og:image" content="${escapeHtml(event.imageUrl)}" />`] : []),
    '<meta name="twitter:card" content="summary_large_image" />',
    `<script type="application/ld+json">${safeJson(structuredData)}</script>`,
  ].join('\n    ');
  return template
    .replace(/<title>[^<]*<\/title>/u, `<title>${escapeHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*"\s*\/>/u, `<meta name="description" content="${escapeHtml(description)}" />`)
    .replace('</head>', `    ${metadata}\n  </head>`);
}

export async function generateEventPages({ distDirectory = 'dist', siteUrl = process.env.PUBLIC_SITE_URL || DEFAULT_SITE_URL } = {}) {
  const dist = resolve(distDirectory);
  const [template, payload] = await Promise.all([
    readFile(resolve(dist, 'index.html'), 'utf8'),
    readFile(resolve(dist, 'data/events.json'), 'utf8').then(JSON.parse),
  ]);
  const events = Array.isArray(payload) ? payload : payload.events;
  if (!Array.isArray(events)) throw new Error('events.json にevents配列がありません');
  const root = normalizeSiteUrl(siteUrl);
  const sitemapUrls = [root.href];
  for (const event of events) {
    const routeId = event?.routeId || event?.id;
    if (!routeId || !/^[A-Za-z0-9_-]+$/u.test(routeId)) continue;
    const directory = resolve(dist, 'events', routeId);
    await mkdir(directory, { recursive: true });
    await writeFile(resolve(directory, 'index.html'), eventPageHtml(template, event, root.href));
    sitemapUrls.push(new URL(`events/${encodeURIComponent(routeId)}/`, root).href);
  }
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((url) => `  <url><loc>${escapeHtml(url)}</loc></url>`).join('\n')}\n</urlset>\n`;
  await writeFile(resolve(dist, 'sitemap.xml'), sitemap);
  return events.length;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const count = await generateEventPages();
  console.log(`Generated ${count} event detail pages.`);
}
