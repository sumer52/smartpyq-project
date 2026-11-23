// Build-time sitemap + robots generator.
//
// The frontend is a static SPA, so there is no server to answer /sitemap.xml.
// Vercel serves real files before applying the index.html rewrite, so this
// script writes public/sitemap.xml (and public/robots.txt) at build time and
// the platform serves them as-is.
//
// The paper list comes from the backend. When the API is unreachable the build
// still succeeds: it warns and ships the static pages only, because a broken
// sitemap must never block a deploy.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(HERE, '..', 'public');

const SITE_URL = (process.env.VITE_SITE_URL || 'https://smartpyq-project.vercel.app').replace(/\/+$/, '');
const BACKEND_URL = (process.env.VITE_BACKEND_URL || 'https://smartpyq-backend.onrender.com').replace(/\/+$/, '');

// Static routes that are worth indexing. Excluded on purpose: /admin*, /upload
// (admin-only), /my-papers (per-visitor), /analysis-history (client state) and
// /error/* (never a destination).
const STATIC_PAGES = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/pyq', changefreq: 'daily', priority: '0.9' },
  { path: '/search', changefreq: 'weekly', priority: '0.7' },
  { path: '/repeated-questions', changefreq: 'weekly', priority: '0.8' },
  { path: '/analyze', changefreq: 'weekly', priority: '0.7' },
  { path: '/practice', changefreq: 'weekly', priority: '0.6' },
  { path: '/ai', changefreq: 'monthly', priority: '0.6' },
  { path: '/faq', changefreq: 'monthly', priority: '0.4' },
  { path: '/contact', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.2' },
  { path: '/terms', changefreq: 'yearly', priority: '0.2' },
  { path: '/cookies', changefreq: 'yearly', priority: '0.2' },
  { path: '/accessibility', changefreq: 'yearly', priority: '0.2' },
  { path: '/acceptable-use', changefreq: 'yearly', priority: '0.2' },
];

const PER_PAGE = 100;
const MAX_PAGES = 50;
const TIMEOUT_MS = 20000;

const escapeXml = (value) => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

function parsePapers(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['papers', 'items', 'results', 'data']) {
    if (Array.isArray(payload[key])) return payload[key];
  }
  return [];
}

async function fetchApprovedPapers() {
  const papers = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `${BACKEND_URL}/api/v1/papers/?paper_status=approved&per_page=${PER_PAGE}&page=${page}`;
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`GET ${url} -> HTTP ${response.status}`);
    }
    const batch = parsePapers(await response.json());
    papers.push(...batch);
    if (batch.length < PER_PAGE) break;
  }
  return papers;
}

function buildSitemap(paperUrls) {
  const today = new Date().toISOString().slice(0, 10);
  const entries = [
    ...STATIC_PAGES.map((page) => ({
      loc: `${SITE_URL}${page.path}`,
      changefreq: page.changefreq,
      priority: page.priority,
      lastmod: today,
    })),
    ...paperUrls,
  ];

  const body = entries
    .map((entry) => [
      '  <url>',
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      entry.lastmod ? `    <lastmod>${entry.lastmod}</lastmod>` : null,
      entry.changefreq ? `    <changefreq>${entry.changefreq}</changefreq>` : null,
      entry.priority ? `    <priority>${entry.priority}</priority>` : null,
      '  </url>',
    ].filter(Boolean).join('\n'))
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    body,
    '</urlset>',
    '',
  ].join('\n');
}

function buildRobots() {
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /upload',
    'Disallow: /my-papers',
    'Disallow: /analysis-history',
    '',
    `Sitemap: ${SITE_URL}/sitemap.xml`,
    '',
  ].join('\n');
}

async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true });

  let paperUrls = [];
  try {
    const papers = await fetchApprovedPapers();
    const seen = new Set();
    paperUrls = papers
      .filter((paper) => {
        if (!paper || paper.id === undefined || paper.id === null) return false;
        if (seen.has(paper.id)) return false;
        seen.add(paper.id);
        return true;
      })
      .map((paper) => ({
        loc: `${SITE_URL}/paper/${paper.id}`,
        changefreq: 'monthly',
        priority: '0.8',
        lastmod: (paper.approved_at || paper.updated_at || paper.created_at || '').slice(0, 10) || undefined,
      }));
    console.log(`[sitemap] ${paperUrls.length} paper URL(s) from ${BACKEND_URL}`);
  } catch (error) {
    console.warn(
      `[sitemap] Could not reach the backend (${error?.message || error}). ` +
      'Writing static pages only; paper URLs are missing from this build.',
    );
  }

  await writeFile(path.join(PUBLIC_DIR, 'sitemap.xml'), buildSitemap(paperUrls), 'utf8');
  await writeFile(path.join(PUBLIC_DIR, 'robots.txt'), buildRobots(), 'utf8');
  console.log(`[sitemap] Wrote ${STATIC_PAGES.length + paperUrls.length} URL(s) to public/sitemap.xml`);
}

main().catch((error) => {
  // A generator failure must not break the deploy; say so loudly instead.
  console.warn(`[sitemap] Generation failed: ${error?.stack || error}`);
});
